// ============================================================
// demo-deployer/src/deploy-manager.js — Gerencia estado dos deploys
// ============================================================

import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import { runPlaybook, runOcCommand } from "./ansible-runner.js";
import { COMPONENTS } from "./config.js";

// ---- Persistência em disco ----
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf-8");
      const saved = JSON.parse(raw);
      console.log(`[State] Carregado de ${STATE_FILE}`);
      return saved;
    }
  } catch (e) {
    console.error(`[State] Erro ao carregar: ${e.message}`);
  }
  return null;
}

function saveState() {
  try {
    ensureDataDir();
    // Salva tudo exceto logs (muito grandes) e jobs antigos
    const toSave = {
      config: deployState.config,
      components: {},
    };
    for (const [id, comp] of Object.entries(deployState.components)) {
      toSave.components[id] = { ...comp, logs: "" }; // não salva logs pesados
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(toSave, null, 2));
  } catch (e) {
    console.error(`[State] Erro ao salvar: ${e.message}`);
  }
}

// Estado global dos deploys
const deployState = {
  config: {
    ocpApiUrl: "",
    ocpToken: "",
    namespace: "bbdw-demo",
    gitRepoUrl: "https://github.com/LucianoRed/bbdw-2025.git",
  },
  components: {},  // id -> { status, route, logs, startedAt, finishedAt, error }
  jobs: {},        // jobId -> { componentId, status, logs, startedAt, finishedAt }
};

// Inicializa estado dos componentes com defaults
COMPONENTS.forEach((c) => {
  deployState.components[c.id] = {
    status: "not-deployed",
    route: null,
    logs: "",
    startedAt: null,
    finishedAt: null,
    error: null,
  };
});

// Restaura estado salvo (se existir)
const saved = loadState();
if (saved) {
  if (saved.config) Object.assign(deployState.config, saved.config);
  if (saved.components) {
    for (const [id, comp] of Object.entries(saved.components)) {
      if (deployState.components[id]) {
        Object.assign(deployState.components[id], comp);
      }
    }
  }
}

// Listeners para WebSocket
const wsListeners = new Set();

export function addWsListener(fn) { wsListeners.add(fn); }
export function removeWsListener(fn) { wsListeners.delete(fn); }

function broadcast(event) {
  for (const fn of wsListeners) {
    try { fn(event); } catch (e) { /* ignore */ }
  }
}

function updateComponent(id, updates) {
  Object.assign(deployState.components[id], updates);
  broadcast({ type: "component-update", componentId: id, data: deployState.components[id] });
  saveState();
}

// ---- API Pública ----

export function getConfig() {
  return { ...deployState.config, ocpToken: deployState.config.ocpToken ? "***" : "" };
}

export function setConfig(config) {
  Object.assign(deployState.config, config);
  broadcast({ type: "config-update", data: getConfig() });
  saveState();
  return getConfig();
}

export function getState() {
  return {
    config: getConfig(),
    components: deployState.components,
    definitions: COMPONENTS,
  };
}

export function getComponentState(id) {
  return deployState.components[id] || null;
}

/**
 * Faz deploy de um componente individual.
 * Retorna jobId para acompanhar via WebSocket.
 */
export async function deployComponent(componentId) {
  const compDef = COMPONENTS.find((c) => c.id === componentId);
  if (!compDef) throw new Error(`Componente desconhecido: ${componentId}`);

  const { ocpApiUrl, ocpToken, gitRepoUrl } = deployState.config;
  if (!ocpApiUrl || !ocpToken) throw new Error("Configure OCP API URL e Token antes de deployar");

  // Cada componente tem seu próprio namespace
  const namespace = compDef.namespace || compDef.id;

  const jobId = uuid();
  deployState.jobs[jobId] = {
    componentId,
    status: "running",
    logs: "",
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };

  updateComponent(componentId, {
    status: "deploying",
    logs: "",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  });

  broadcast({ type: "job-start", jobId, componentId });

  // Executar assincronamente
  (async () => {
    try {
      const onOutput = (line) => {
        deployState.jobs[jobId].logs += line;
        deployState.components[componentId].logs += line;
        broadcast({ type: "job-output", jobId, componentId, data: line });
      };

      let finalResult = { success: true, output: "" };
      let route = null;

      // Se tem subSteps, executa cada um em sequência
      if (compDef.subSteps && compDef.subSteps.length > 0) {
        for (const step of compDef.subSteps) {
          onOutput(`\n═══ Etapa: ${step.name} ═══\n`);

          const stepVars = {
            ocp_api_url: ocpApiUrl,
            ocp_token: ocpToken,
            namespace,
            ...(step.extraVars || {}),
          };

          // Se o step tem contextDir, é um deploy de app
          if (step.contextDir) {
            stepVars.app_name = compDef.id;
            stepVars.git_repo_url = gitRepoUrl;
            stepVars.context_dir = step.contextDir;
          }

          // Env vars do componente pai (apenas no step da app)
          if (step.contextDir && compDef.envVars) {
            stepVars.env_vars = compDef.envVars.map((ev) => ({
              key: ev.key,
              value: ev.value
                .replace("{{ocp_api_url}}", ocpApiUrl)
                .replace("{{sa_token}}", deployState.config.saToken || ocpToken),
            }));
          }

          const stepResult = await runPlaybook(step.playbook, stepVars, onOutput);
          finalResult.output += stepResult.output;

          // Extrair token do SA (se RBAC)
          if (step.id === "rbac") {
            const tokenMatch = stepResult.output.match(/"token"\s*:\s*"([^"]+)"/);
            if (tokenMatch) {
              deployState.config.saToken = tokenMatch[1];
            }
          }

          // Extrair rota
          const routeMatch = stepResult.output.match(/"route"\s*:\s*"([^"]+)"/);
          if (routeMatch) route = routeMatch[1];

          if (!stepResult.success) {
            finalResult.success = false;
            onOutput(`\n❌ Etapa "${step.name}" falhou!\n`);
            break;
          }
          onOutput(`✅ Etapa "${step.name}" concluída\n`);
        }
      } else {
        // Deploy simples (sem subSteps)
        const extraVars = {
          ocp_api_url: ocpApiUrl,
          ocp_token: ocpToken,
          namespace,
        };

        if (compDef.contextDir) {
          extraVars.app_name = compDef.id;
          extraVars.git_repo_url = gitRepoUrl;
          extraVars.context_dir = compDef.contextDir;
        }

        if (compDef.envVars) {
          extraVars.env_vars = compDef.envVars.map((ev) => ({
            key: ev.key,
            value: ev.value
              .replace("{{ocp_api_url}}", ocpApiUrl)
              .replace("{{sa_token}}", deployState.config.saToken || ocpToken),
          }));
        }

        finalResult = await runPlaybook(compDef.playbook, extraVars, onOutput);

        const routeMatch = finalResult.output.match(/"route"\s*:\s*"([^"]+)"/);
        if (routeMatch) route = routeMatch[1];
      }

      const status = finalResult.success ? "deployed" : "failed";
      updateComponent(componentId, {
        status,
        route,
        namespace,
        finishedAt: new Date().toISOString(),
        error: finalResult.success ? null : "Playbook falhou. Veja os logs.",
      });

      deployState.jobs[jobId].status = finalResult.success ? "completed" : "failed";
      deployState.jobs[jobId].finishedAt = new Date().toISOString();

      broadcast({ type: "job-complete", jobId, componentId, success: finalResult.success });
    } catch (err) {
      updateComponent(componentId, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: err.message,
      });
      deployState.jobs[jobId].status = "failed";
      deployState.jobs[jobId].finishedAt = new Date().toISOString();
      broadcast({ type: "job-error", jobId, componentId, error: err.message });
    }
  })();

  return { jobId, componentId };
}

/**
 * Deploy de todos os componentes em ordem.
 */
export async function deployAll() {
  const sorted = [...COMPONENTS].sort((a, b) => a.order - b.order);
  const results = [];

  for (const comp of sorted) {
    const job = await deployComponent(comp.id);
    // Aguarda conclusão antes do próximo
    await waitForJob(job.jobId);
    results.push({ componentId: comp.id, jobId: job.jobId });

    // Se falhou, para
    if (deployState.jobs[job.jobId].status === "failed" && comp.required) {
      broadcast({ type: "deploy-all-stopped", reason: `Falha no componente obrigatório: ${comp.name}` });
      break;
    }
  }

  return results;
}

function waitForJob(jobId) {
  return new Promise((resolve) => {
    const check = () => {
      const job = deployState.jobs[jobId];
      if (job && (job.status === "completed" || job.status === "failed")) {
        resolve(job);
      } else {
        setTimeout(check, 1000);
      }
    };
    check();
  });
}

/**
 * Obtém status de todos os componentes no cluster.
 * Verifica se cada namespace existe e se há pods/deployments rodando.
 */
export async function refreshStatus() {
  const { ocpApiUrl, ocpToken } = deployState.config;
  if (!ocpApiUrl || !ocpToken) return { error: "OCP não configurado" };

  // Login primeiro
  await runOcCommand(["login", ocpApiUrl, `--token=${ocpToken}`, "--insecure-skip-tls-verify=true"], ocpApiUrl, ocpToken);

  // Para cada componente, verifica diretamente no cluster
  for (const compDef of COMPONENTS) {
    const ns = compDef.namespace || compDef.id;
    const appName = compDef.id;

    // Verificar se o namespace existe
    const nsCheck = await runOcCommand(["get", "project", ns, "-o", "name"], ocpApiUrl, ocpToken);
    if (!nsCheck.success) {
      // Namespace não existe → componente não está deployado
      updateComponent(appName, {
        status: "not-deployed",
        route: null,
        namespace: null,
        error: null,
      });
      continue;
    }

    // Verificar se há deployments/pods do app
    const dcCheck = await runOcCommand(
      ["get", "deploy,dc,buildconfig", "-n", ns, "-o", "name"],
      ocpApiUrl, ocpToken
    );

    if (!dcCheck.success || !dcCheck.output.trim()) {
      // Namespace existe mas sem deployments
      updateComponent(appName, {
        status: "not-deployed",
        route: null,
        namespace: ns,
        error: null,
      });
      continue;
    }

    // Verificar pods rodando
    const podCheck = await runOcCommand(
      ["get", "pods", "-n", ns, "-o", "jsonpath={.items[*].status.phase}"],
      ocpApiUrl, ocpToken
    );
    const phases = (podCheck.output || "").trim().split(/\s+/).filter(Boolean);
    const hasRunning = phases.some((p) => p === "Running");
    const allFailed = phases.length > 0 && phases.every((p) => p === "CrashLoopBackOff" || p === "Error" || p === "Failed");

    // Verificar rota
    let route = null;
    const routeCheck = await runOcCommand(
      ["get", "route", appName, "-n", ns, "-o", "jsonpath={.spec.host}"],
      ocpApiUrl, ocpToken
    );
    if (routeCheck.success && routeCheck.output.trim()) {
      route = `https://${routeCheck.output.trim()}`;
    }

    let status;
    if (hasRunning) {
      status = "deployed";
    } else if (allFailed) {
      status = "failed";
    } else if (phases.length > 0) {
      // Pods existem mas não Running (Building, Pending, etc)
      status = "deploying";
    } else {
      // Sem pods mas tem deployment/bc → pode estar buildando
      status = "deploying";
    }

    updateComponent(appName, {
      status,
      route,
      namespace: ns,
      error: allFailed ? "Pods em falha. Verifique os logs." : null,
    });
  }

  broadcast({ type: "refresh-complete" });
  return { success: true };
}

/**
 * Limpa todos os recursos do namespace.
 */
export async function cleanup() {
  const { ocpApiUrl, ocpToken } = deployState.config;
  if (!ocpApiUrl || !ocpToken) throw new Error("OCP não configurado");

  // Limpa cada namespace individualmente
  const namespaces = [...new Set(COMPONENTS.map((c) => c.namespace || c.id))];

  for (const ns of namespaces) {
    await runPlaybook("cleanup.yml", {
      ocp_api_url: ocpApiUrl,
      ocp_token: ocpToken,
      namespace: ns,
    });
  }

  // Reset estado
  COMPONENTS.forEach((c) => {
    updateComponent(c.id, {
      status: "not-deployed",
      route: null,
      namespace: null,
      logs: "",
      startedAt: null,
      finishedAt: null,
      error: null,
    });
  });

  // Limpa SA token (RBAC foi deletado junto com o namespace)
  delete deployState.config.saToken;
  saveState();

  return { success: true, output: `Cleanup de ${namespaces.length} namespaces excluídos: ${namespaces.join(", ")}` };
}

export function getJob(jobId) {
  return deployState.jobs[jobId] || null;
}
