// ============================================================
// demo-deployer/src/deploy-manager.js — Gerencia estado dos deploys
// ============================================================

import { v4 as uuid } from "uuid";
import { runPlaybook, runOcCommand } from "./ansible-runner.js";
import { COMPONENTS } from "./config.js";

// Estado global dos deploys
const deployState = {
  config: {
    ocpApiUrl: "",
    ocpToken: "",
    namespace: "bbdw-demo",
    gitRepoUrl: "https://github.com/SEU_USUARIO/bbdw-2025.git",
  },
  components: {},  // id -> { status, route, logs, startedAt, finishedAt, error }
  jobs: {},        // jobId -> { componentId, status, logs, startedAt, finishedAt }
};

// Inicializa estado dos componentes
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
}

// ---- API Pública ----

export function getConfig() {
  return { ...deployState.config, ocpToken: deployState.config.ocpToken ? "***" : "" };
}

export function setConfig(config) {
  Object.assign(deployState.config, config);
  broadcast({ type: "config-update", data: getConfig() });
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

  const { ocpApiUrl, ocpToken, namespace, gitRepoUrl } = deployState.config;
  if (!ocpApiUrl || !ocpToken) throw new Error("Configure OCP API URL e Token antes de deployar");

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
      const extraVars = {
        ocp_api_url: ocpApiUrl,
        ocp_token: ocpToken,
        namespace,
      };

      // Adicionar configurações específicas do componente
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

      if (compDef.id === "rbac") {
        extraVars.sa_name = "mcp-sa";
      }

      const onOutput = (line) => {
        deployState.jobs[jobId].logs += line;
        deployState.components[componentId].logs += line;
        broadcast({ type: "job-output", jobId, componentId, data: line });
      };

      const result = await runPlaybook(compDef.playbook, extraVars, onOutput);

      // Extrair rota do output (se houver)
      let route = null;
      const routeMatch = result.output.match(/"route"\s*:\s*"([^"]+)"/);
      if (routeMatch) route = routeMatch[1];

      // Extrair token do SA (se RBAC)
      if (compDef.id === "rbac") {
        const tokenMatch = result.output.match(/"token"\s*:\s*"([^"]+)"/);
        if (tokenMatch) {
          deployState.config.saToken = tokenMatch[1];
        }
      }

      const status = result.success ? "deployed" : "failed";
      updateComponent(componentId, {
        status,
        route,
        finishedAt: new Date().toISOString(),
        error: result.success ? null : "Playbook falhou. Veja os logs.",
      });

      deployState.jobs[jobId].status = result.success ? "completed" : "failed";
      deployState.jobs[jobId].finishedAt = new Date().toISOString();

      broadcast({ type: "job-complete", jobId, componentId, success: result.success });
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
 */
export async function refreshStatus() {
  const { ocpApiUrl, ocpToken, namespace } = deployState.config;
  if (!ocpApiUrl || !ocpToken) return { error: "OCP não configurado" };

  const result = await runPlaybook("get-status.yml", {
    ocp_api_url: ocpApiUrl,
    ocp_token: ocpToken,
    namespace,
  });

  // Tentar parsear a saída JSON
  try {
    const match = result.output.match(/cluster_status.*?({[\s\S]*?})\s*$/m);
    if (match) {
      return { success: true, raw: result.output };
    }
  } catch (e) { /* ignore */ }

  return { success: result.success, raw: result.output };
}

/**
 * Limpa todos os recursos do namespace.
 */
export async function cleanup() {
  const { ocpApiUrl, ocpToken, namespace } = deployState.config;
  if (!ocpApiUrl || !ocpToken) throw new Error("OCP não configurado");

  const result = await runPlaybook("cleanup.yml", {
    ocp_api_url: ocpApiUrl,
    ocp_token: ocpToken,
    namespace,
  });

  if (result.success) {
    // Reset estado
    COMPONENTS.forEach((c) => {
      updateComponent(c.id, {
        status: "not-deployed",
        route: null,
        logs: "",
        startedAt: null,
        finishedAt: null,
        error: null,
      });
    });
  }

  return { success: result.success, output: result.output };
}

export function getJob(jobId) {
  return deployState.jobs[jobId] || null;
}
