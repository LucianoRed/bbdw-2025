// ============================================================
// demo-deployer/src/deploy-manager.js — Gerencia estado dos deploys
// ============================================================

import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import { runPlaybook, runOcCommand } from "./ansible-runner.js";
import { COMPONENTS, OFERTAS } from "./config.js";

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
    openaiApiKey: "",
    openaiSeiModel: "gpt-4o-mini",
    openaiSeiWorkflowId: "",
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

/**
 * Valida se as credenciais OCP estão configuradas.
 * Lança erro descritivo se não estiverem.
 */
export function validateCredentials() {
  const { ocpApiUrl, ocpToken } = deployState.config;
  if (!ocpApiUrl && !ocpToken) {
    throw new Error(
      "OCP API URL e Token não configurados. Acesse a aba ⚙️ Configurações e preencha as credenciais antes de deployar."
    );
  }
  if (!ocpApiUrl) {
    throw new Error(
      "OCP API URL não configurado. Acesse a aba ⚙️ Configurações e informe a URL da API do cluster."
    );
  }
  if (!ocpToken) {
    throw new Error(
      "OCP Token não configurado. Acesse a aba ⚙️ Configurações e informe o token de acesso ao cluster."
    );
  }
}

export function getConfig() {
  return {
    ...deployState.config,
    ocpToken: deployState.config.ocpToken ? "***" : "",
    openaiApiKey: deployState.config.openaiApiKey ? "***" : "",
  };
}


export function setConfig(config) {
  // Não sobreescrever segredos se vierem mascarados ou vazios
  if (!config.ocpToken || config.ocpToken === "***") {
    delete config.ocpToken;
  }
  if (!config.openaiApiKey || config.openaiApiKey === "***") {
    delete config.openaiApiKey;
  }
  // openaiSeiModel não é segredo — aceita vazio (mantém o padrão existente)
  if (!config.openaiSeiModel) {
    delete config.openaiSeiModel;
  }
  // openaiSeiWorkflowId não é segredo — aceita vazio
  if (!config.openaiSeiWorkflowId) {
    delete config.openaiSeiWorkflowId;
  }
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
            // Timeout da rota (para agent-ai etc)
            if (compDef.routeTimeout) {
              stepVars.route_timeout = true;
            }
          }

          // Env vars do componente pai (apenas no step da app)
          if (step.contextDir && compDef.envVars) {
            stepVars.env_vars = compDef.envVars.map((ev) => ({
              key: ev.key,
              value: ev.value
                .replace("{{ocp_api_url}}", ocpApiUrl)
                .replace("{{sa_token}}", deployState.config.saToken || ocpToken)
                .replace("{{openai_api_key}}", deployState.config.openaiApiKey || "")
                .replace("{{openai_sei_model}}", deployState.config.openaiSeiModel || "gpt-4o-mini")
                .replace("{{openai_sei_workflow_id}}", deployState.config.openaiSeiWorkflowId || ""),
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
          if (routeMatch) {
            const raw = routeMatch[1];
            route = raw.startsWith('http') ? raw : `https://${raw}`;
          }

          if (!stepResult.success) {
            // Steps de infraestrutura (Redis, RBAC) não devem abortar o fluxo
            // Só o step principal (com contextDir ou critical:true) é crítico
            if (step.contextDir || step.critical) {
              finalResult.success = false;
              onOutput(`\n❌ Etapa "${step.name}" falhou!\n`);
              break;
            } else {
              onOutput(`\n⚠️ Etapa "${step.name}" falhou (não-crítico, continuando...)\n`);
            }
          } else {
            onOutput(`✅ Etapa "${step.name}" concluída\n`);
          }
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

        // Deploy a partir de imagem externa (sem build)
        if (compDef.appImage) {
          extraVars.app_name = compDef.id;
          extraVars.app_image = compDef.appImage;
        }
        if (compDef.envVars) {
          extraVars.env_vars = compDef.envVars.map((ev) => ({
            key: ev.key,
            value: ev.value
              .replace("{{ocp_api_url}}", ocpApiUrl)
              .replace("{{sa_token}}", deployState.config.saToken || ocpToken)
              .replace("{{openai_api_key}}", deployState.config.openaiApiKey || "")
              .replace("{{openai_sei_model}}", deployState.config.openaiSeiModel || "gpt-4o-mini")
              .replace("{{openai_sei_workflow_id}}", deployState.config.openaiSeiWorkflowId || ""),
          }));
        }

        // Porta customizada para a rota (quando não é a padrão)
        if (compDef.port && compDef.port !== 8080 && compDef.port !== 3000) {
          extraVars.service_port = compDef.port;
        }

        // Timeout da rota
        if (compDef.routeTimeout) {
          extraVars.route_timeout = true;
        }

        finalResult = await runPlaybook(compDef.playbook, extraVars, onOutput);

        const routeMatch = finalResult.output.match(/"route"\s*:\s*"([^"]+)"/);
        if (routeMatch) {
          const raw = routeMatch[1];
          route = raw.startsWith('http') ? raw : `https://${raw}`;
        }
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
  // Validação antecipada de credenciais
  const { ocpApiUrl, ocpToken } = deployState.config;
  if (!ocpApiUrl || !ocpToken) {
    const errMsg = "OCP API URL e/ou Token não configurados. Acesse ⚙️ Configurações antes de deployar.";
    console.error(`[deployAll] ❌ ${errMsg}`);
    broadcast({ type: "deploy-all-stopped", reason: errMsg });
    throw new Error(errMsg);
  }
  console.log(`[deployAll] ▶ Iniciando deploy completo (${COMPONENTS.length} componentes)`);

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
      return results;
    }
  }

  broadcast({ type: "deploy-all-complete", total: results.length });
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
  if (!ocpApiUrl || !ocpToken) return { success: false, error: "OCP não configurado" };

  // Login primeiro — e valida se o token funciona
  const loginResult = await runOcCommand(["login", ocpApiUrl, `--token=${ocpToken}`, "--insecure-skip-tls-verify=true"], ocpApiUrl, ocpToken);
  if (!loginResult.success) {
    const isExpired = (loginResult.output || "").includes("expired") || (loginResult.output || "").includes("invalid");
    return {
      success: false,
      error: isExpired
        ? "Token expirado ou inválido. Gere um novo token via 'oc login'."
        : `Falha no login: ${(loginResult.output || "").substring(0, 200)}`,
    };
  }

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

    // Verificar se há deployments/pods do app (busca cada tipo separado para evitar falhas de sintaxe)
    let hasResources = false;
    for (const resType of ["deploy", "dc", "buildconfig"]) {
      const resCheck = await runOcCommand(
        ["get", resType, "-n", ns, "-o", "name"],
        ocpApiUrl, ocpToken
      );
      if (resCheck.success && resCheck.output.trim()) {
        hasResources = true;
        break;
      }
    }

    if (!hasResources) {
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

    // Verificar rota (tenta pelo nome do app; se não achar, busca qualquer rota no namespace)
    let route = null;
    const routeCheck = await runOcCommand(
      ["get", "route", appName, "-n", ns, "-o", "jsonpath={.spec.host}"],
      ocpApiUrl, ocpToken
    );
    if (routeCheck.success && routeCheck.output.trim()) {
      route = `https://${routeCheck.output.trim()}`;
    } else {
      // Fallback: busca a primeira rota do namespace
      const anyRouteCheck = await runOcCommand(
        ["get", "routes", "-n", ns, "-o", "jsonpath={.items[0].spec.host}"],
        ocpApiUrl, ocpToken
      );
      if (anyRouteCheck.success && anyRouteCheck.output.trim()) {
        route = `https://${anyRouteCheck.output.trim()}`;
      }
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
  const results = [];
  let allOutput = "";

  const onOutput = (line) => {
    allOutput += line;
    broadcast({ type: "cleanup-output", data: line });
  };

  onOutput(`\n🗑️ Iniciando cleanup de ${namespaces.length} namespaces...\n`);

  for (const ns of namespaces) {
    onOutput(`\n═══ Excluindo namespace: ${ns} ═══\n`);
    const result = await runPlaybook("cleanup.yml", {
      ocp_api_url: ocpApiUrl,
      ocp_token: ocpToken,
      namespace: ns,
    }, onOutput);
    results.push({ namespace: ns, success: result.success, exitCode: result.exitCode });
    if (result.success) {
      onOutput(`✅ Namespace "${ns}" excluído com sucesso\n`);
    } else {
      onOutput(`⚠️ Falha ao excluir namespace "${ns}" (exit code: ${result.exitCode})\n`);
    }
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

  const failed = results.filter(r => !r.success);
  const summary = failed.length > 0
    ? `Cleanup parcial: ${results.length - failed.length}/${results.length} namespaces excluídos. Falhas: ${failed.map(f => f.namespace).join(", ")}`
    : `Cleanup completo: ${namespaces.length} namespaces excluídos: ${namespaces.join(", ")}`;
  onOutput(`\n${summary}\n`);

  broadcast({ type: "cleanup-complete", success: failed.length === 0, summary });
  return { success: failed.length === 0, output: summary, details: results };
}

/**
 * Limpa um componente individual (exclui o namespace).
 */
export async function cleanupComponent(componentId) {
  const { ocpApiUrl, ocpToken } = deployState.config;
  if (!ocpApiUrl || !ocpToken) throw new Error("OCP não configurado");

  const compDef = COMPONENTS.find((c) => c.id === componentId);
  if (!compDef) throw new Error(`Componente não encontrado: ${componentId}`);

  const ns = compDef.namespace || compDef.id;
  let allOutput = "";

  const onOutput = (line) => {
    allOutput += line;
    broadcast({ type: "cleanup-output", data: line });
  };

  onOutput(`\n🗑️ Limpando componente: ${compDef.name} (namespace: ${ns})...\n`);

  const result = await runPlaybook("cleanup.yml", {
    ocp_api_url: ocpApiUrl,
    ocp_token: ocpToken,
    namespace: ns,
  }, onOutput);

  if (result.success) {
    onOutput(`✅ Namespace "${ns}" excluído com sucesso\n`);
  } else {
    onOutput(`⚠️ Falha ao excluir namespace "${ns}" (exit code: ${result.exitCode})\n`);
  }

  // Reset estado do componente
  updateComponent(componentId, {
    status: "not-deployed",
    route: null,
    namespace: null,
    logs: "",
    startedAt: null,
    finishedAt: null,
    error: null,
  });

  // Se é o agent-ai, limpa o saToken também
  if (componentId === "agent-ai") {
    delete deployState.config.saToken;
  }
  saveState();

  broadcast({ type: "cleanup-complete", success: result.success, summary: `${compDef.name} removido` });
  return { success: result.success, output: `Cleanup de ${compDef.name} (${ns}): ${result.success ? 'OK' : 'falhou'}` };
}

/**
 * Deploy de uma oferta (pacote de componentes).
 * Deploys são executados em sequência segundo a order dos componentes.
 */
export async function deployOferta(ofertaId) {
  const oferta = OFERTAS.find((o) => o.id === ofertaId);
  if (!oferta) throw new Error(`Oferta desconhecida: ${ofertaId}`);

  // Validação antecipada de credenciais — falha rápido com mensagem clara
  const { ocpApiUrl, ocpToken } = deployState.config;
  if (!ocpApiUrl || !ocpToken) {
    const errMsg = !ocpApiUrl && !ocpToken
      ? "OCP API URL e Token não configurados. Acesse ⚙️ Configurações antes de deployar."
      : !ocpApiUrl
        ? "OCP API URL não configurado. Acesse ⚙️ Configurações."
        : "OCP Token não configurado. Acesse ⚙️ Configurações.";
    console.error(`[deployOferta:${ofertaId}] ❌ Credenciais ausentes — ${errMsg}`);
    console.error(`[deployOferta:${ofertaId}]    ocpApiUrl: ${ocpApiUrl ? '✓ configurado' : '✗ AUSENTE'}`);
    console.error(`[deployOferta:${ofertaId}]    ocpToken:  ${ocpToken  ? '✓ configurado' : '✗ AUSENTE'}`);
    broadcast({ type: "oferta-error", ofertaId, error: errMsg });
    throw new Error(errMsg);
  }

  console.log(`[deployOferta:${ofertaId}] ▶ Iniciando deploy da oferta "${oferta.name}" (${oferta.componentIds.length} componentes)`);
  console.log(`[deployOferta:${ofertaId}]   OCP API URL: ${ocpApiUrl}`);
  console.log(`[deployOferta:${ofertaId}]   Token: ***${ocpToken.slice(-6)}`);

  const sorted = oferta.componentIds
    .map((cid) => COMPONENTS.find((c) => c.id === cid))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);

  broadcast({ type: "oferta-start", ofertaId, total: sorted.length });
  const results = [];

  for (const comp of sorted) {
    console.log(`[deployOferta:${ofertaId}] ▸ Deployando componente: ${comp.name} (${comp.id})`);
    let job;
    try {
      job = await deployComponent(comp.id);
    } catch (err) {
      console.error(`[deployOferta:${ofertaId}] ❌ Erro ao iniciar deploy de "${comp.name}": ${err.message}`);
      broadcast({ type: "oferta-stopped", ofertaId, reason: `Erro ao iniciar "${comp.name}": ${err.message}` });
      broadcast({ type: "oferta-error", ofertaId, error: err.message });
      return results;
    }
    await waitForJob(job.jobId);
    results.push({ componentId: comp.id, jobId: job.jobId });

    const jobState = deployState.jobs[job.jobId];
    if (jobState && jobState.status === "failed") {
      console.error(`[deployOferta:${ofertaId}] ❌ Componente "${comp.name}" falhou. Interrompendo oferta.`);
      broadcast({ type: "oferta-stopped", ofertaId, reason: `Falha no componente: ${comp.name}` });
      return results;
    }
    console.log(`[deployOferta:${ofertaId}] ✅ Componente "${comp.name}" concluído.`);
  }

  broadcast({ type: "oferta-complete", ofertaId, total: results.length });
  return results;
}

/**
 * Cleanup de uma oferta (exclui os namespaces dos componentes da oferta).
 */
export async function cleanupOferta(ofertaId) {
  const oferta = OFERTAS.find((o) => o.id === ofertaId);
  if (!oferta) throw new Error(`Oferta desconhecida: ${ofertaId}`);

  const results = [];
  for (const cid of oferta.componentIds) {
    try {
      const result = await cleanupComponent(cid);
      results.push({ componentId: cid, ...result });
    } catch (e) {
      results.push({ componentId: cid, success: false, output: e.message });
    }
  }

  const failed = results.filter((r) => !r.success);
  broadcast({
    type: "oferta-cleanup-complete",
    ofertaId,
    success: failed.length === 0,
    summary: failed.length === 0
      ? `Oferta "${oferta.name}" removida com sucesso`
      : `Cleanup parcial: ${failed.map((f) => f.componentId).join(", ")} falharam`,
  });
  return { success: failed.length === 0, results };
}

export function getJob(jobId) {
  return deployState.jobs[jobId] || null;
}

/**
 * Atualiza o K8S_BEARER_TOKEN em todos os deployments que usam token.
 * Usa o token da configuração atual (ocpToken ou saToken).
 */
export async function refreshTokens() {
  const { ocpApiUrl, ocpToken } = deployState.config;
  if (!ocpApiUrl || !ocpToken) throw new Error("OCP não configurado");

  // Login
  await runOcCommand(["login", ocpApiUrl, `--token=${ocpToken}`, "--insecure-skip-tls-verify=true"], ocpApiUrl, ocpToken);

  const token = deployState.config.saToken || ocpToken;
  const results = [];

  for (const compDef of COMPONENTS) {
    // Só atualiza componentes que têm K8S_BEARER_TOKEN nas envVars
    const hasToken = compDef.envVars?.some((ev) => ev.key === "K8S_BEARER_TOKEN");
    if (!hasToken) continue;

    const ns = compDef.namespace || compDef.id;
    const appName = compDef.id;

    // Verificar se o deployment existe
    const dcCheck = await runOcCommand(
      ["get", "deploy,dc", appName, "-n", ns, "-o", "name"],
      ocpApiUrl, ocpToken
    );
    if (!dcCheck.success || !dcCheck.output.trim()) {
      results.push({ id: appName, status: "skipped", reason: "não deployado" });
      continue;
    }

    // Atualizar token
    const resourceName = dcCheck.output.trim().split("\n")[0];
    const setEnv = await runOcCommand(
      ["set", "env", resourceName, `K8S_BEARER_TOKEN=${token}`, `K8S_API_URL=${ocpApiUrl}`, "-n", ns],
      ocpApiUrl, ocpToken
    );

    results.push({ id: appName, namespace: ns, status: setEnv.success ? "updated" : "failed" });
  }

  return { success: true, results };
}
