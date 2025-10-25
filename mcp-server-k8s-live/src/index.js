import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import https from "https";
import http from "http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// Configuração via variáveis de ambiente (compatível com liveData.php)
const K8S_API_URL = process.env.K8S_API_URL;
const K8S_BEARER_TOKEN = process.env.K8S_BEARER_TOKEN;
const K8S_SKIP_TLS_VERIFY = (process.env.K8S_SKIP_TLS_VERIFY || "").toLowerCase() === "true";

if (!K8S_API_URL || !K8S_BEARER_TOKEN) {
  // Não encerramos o processo para permitir handshake MCP; a ferramenta retornará erro amigável
  console.warn("K8S_API_URL e K8S_BEARER_TOKEN não definidos. Defina-os no ambiente do servidor MCP.");
}

// Helpers de parse (equivalentes ao PHP)
function parseCpuMillicores(v) {
  if (v == null || v === "") return 0;
  const s = String(v).trim();
  if (s.endsWith("m")) return parseInt(s.slice(0, -1), 10) || 0;
  if (s.endsWith("n")) {
    const n = parseFloat(s.slice(0, -1));
    return Math.round(n / 1_000_000.0);
  }
  if (!isNaN(Number(s))) return Math.round(Number(s) * 1000);
  return 0;
}

function parseMemBytes(v) {
  if (v == null || v === "") return 0;
  const s = String(v).trim();
  const map = new Map([
    ["Ki", 1024],
    ["Mi", 1024 * 1024],
    ["Gi", 1024 * 1024 * 1024],
    ["Ti", 1024 * 1024 * 1024 * 1024],
    ["Pi", 1024 * 1024 * 1024 * 1024 * 1024],
    ["k", 1000],
    ["M", 1000 * 1000],
    ["G", 1000 * 1000 * 1000],
  ]);
  for (const [suf, mul] of map.entries()) {
    if (s.endsWith(suf)) {
      const num = parseFloat(s.slice(0, -suf.length));
      return Math.round(num * mul);
    }
  }
  if (!isNaN(Number(s))) return Math.round(Number(s));
  return 0;
}

function bytesToMiB(b) { return Math.round(b / (1024 * 1024)); }

// HTTP helper contra API do Kubernetes
async function k8sGet(path, { optional = false } = {}) {
  if (!K8S_API_URL || !K8S_BEARER_TOKEN) {
    if (optional) return null;
    const msg = "Defina K8S_API_URL e K8S_BEARER_TOKEN no ambiente do servidor MCP.";
    const err = new Error(msg);
    err.statusCode = 500;
    throw err;
  }
  const url = `${K8S_API_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const headers = {
    "Accept": "application/json",
    "Authorization": `Bearer ${K8S_BEARER_TOKEN}`,
  };
  const agent = new https.Agent({ rejectUnauthorized: !K8S_SKIP_TLS_VERIFY });
  return await new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers,
      agent,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          if (optional) return resolve(null);
          const err = new Error(`Falha HTTP ${res.statusCode} em ${path}`);
          err.statusCode = res.statusCode;
          return reject(err);
        }
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          if (optional) return resolve(null);
          const err = new Error("Resposta inválida da API Kubernetes.");
          err.statusCode = 500;
          reject(err);
        }
      });
    });
    req.on('error', (e) => {
      if (optional) return resolve(null);
      const err = new Error(`Erro ao consultar API: ${e.message}`);
      err.statusCode = 502;
      reject(err);
    });
    req.end();
  });
}

// Helper para POST/CREATE na API Kubernetes
async function k8sPost(path, body) {
  if (!K8S_API_URL || !K8S_BEARER_TOKEN) {
    const msg = "Defina K8S_API_URL e K8S_BEARER_TOKEN no ambiente do servidor MCP.";
    const err = new Error(msg);
    err.statusCode = 500;
    throw err;
  }
  const url = `${K8S_API_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": `Bearer ${K8S_BEARER_TOKEN}`,
  };
  const agent = new https.Agent({ rejectUnauthorized: !K8S_SKIP_TLS_VERIFY });
  return await new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers,
      agent,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`Falha HTTP ${res.statusCode} em ${path}: ${data}`);
          err.statusCode = res.statusCode;
          return reject(err);
        }
        try {
          const json = data ? JSON.parse(data) : {};
          resolve(json);
        } catch (e) {
          const err = new Error("Resposta inválida da API Kubernetes.");
          err.statusCode = 500;
          reject(err);
        }
      });
    });
    req.on('error', (e) => {
      const err = new Error(`Erro ao consultar API: ${e.message}`);
      err.statusCode = 502;
      reject(err);
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

// Constrói JSON idêntico ao binpacking-live/liveData.php
async function buildLiveData({ resource = "cpu", ns = "" }) {
  const nsFilter = ns
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const nodes = await k8sGet("/api/v1/nodes");
  const pods = await k8sGet("/api/v1/pods");
  const podMetrics = await k8sGet("/apis/metrics.k8s.io/v1beta1/pods", { optional: true });

  const podUsage = new Map(); // key: ns/name -> {cpu_m, mem_b}
  if (podMetrics && Array.isArray(podMetrics.items)) {
    for (const m of podMetrics.items) {
      const ns = m?.metadata?.namespace || "";
      const name = m?.metadata?.name || "";
      if (!ns || !name) continue;
      let cpu_m = 0, mem_b = 0;
      for (const c of (m.containers || [])) {
        cpu_m += parseCpuMillicores(c?.usage?.cpu ?? "0");
        mem_b += parseMemBytes(c?.usage?.memory ?? "0");
      }
      podUsage.set(`${ns}/${name}`, { cpu_m, mem_b });
    }
  }

  const nodeOrder = [];
  const nodeInfo = new Map(); // name -> info
  const pendingPods = [];

  for (const n of (nodes.items || [])) {
    const name = n?.metadata?.name || "unknown";
    const labels = n?.metadata?.labels || {};
    const alloc = n?.status?.allocatable || {};
    const addresses = n?.status?.addresses || [];
    const cpu_m = parseCpuMillicores(alloc.cpu ?? "0");
    const mem_b = parseMemBytes(alloc.memory ?? "0");

    let role = "Worker";
    if (labels["node-role.kubernetes.io/master"] || labels["node-role.kubernetes.io/control-plane"] || labels["node-role.kubernetes.io/controlplane"]) {
      role = "Master";
    } else if ((labels["machine-type"] === "infra-node") || labels["node-role.kubernetes.io/infra"]) {
      role = "InfraNode";
    }

    let ip = "N/A";
    for (const addr of addresses) {
      if (addr?.type === "InternalIP") { ip = addr?.address || "N/A"; break; }
    }
    if (ip === "N/A") {
      for (const addr of addresses) { if (addr?.type === "ExternalIP") { ip = addr?.address || "N/A"; break; } }
    }

    nodeOrder.push(name);
    nodeInfo.set(name, {
      name,
      role,
      ip,
      alloc_cpu_m: cpu_m,
      alloc_mem_b: mem_b,
      used_cpu_m: 0,
      used_mem_b: 0,
      used_eff_cpu_m: 0,
      used_eff_mem_b: 0,
      pods: [],
    });
  }

  for (const p of (pods.items || [])) {
    const phase = p?.status?.phase || "";
    if (["Succeeded", "Failed"].includes(phase)) continue;
    const namespace = p?.metadata?.namespace || "default";
    if (nsFilter.length && !nsFilter.includes(namespace)) continue;
    const podName = p?.metadata?.name || "pod";
    const nodeName = p?.spec?.nodeName || null;
    const isTerminating = !!p?.metadata?.deletionTimestamp;

    let creating = false;
    for (const cs of (p?.status?.containerStatuses || [])) {
      const reason = cs?.state?.waiting?.reason || "";
      if (reason === "ContainerCreating") { creating = true; break; }
    }
    if (!creating) {
      for (const cs of (p?.status?.initContainerStatuses || [])) {
        const reason = cs?.state?.waiting?.reason || "";
        if (reason === "PodInitializing" || reason === "ContainerCreating") { creating = true; break; }
      }
    }

    let req_cpu_m = 0, req_mem_b = 0;
    for (const c of (p?.spec?.containers || [])) {
      const req = c?.resources?.requests || {};
      req_cpu_m += parseCpuMillicores(req.cpu ?? "0");
      req_mem_b += parseMemBytes(req.memory ?? "0");
    }

    const key = `${namespace}/${podName}`;
    const eff = podUsage.get(key) || { cpu_m: 0, mem_b: 0 };

    const pod = {
      id: key,
      ns: namespace,
      name: podName,
      cpu_m: req_cpu_m,
      mem_b: req_mem_b,
      terminating: isTerminating,
      phase,
      creating,
      eff_cpu_m: eff.cpu_m || 0,
      eff_mem_b: eff.mem_b || 0,
    };

    const info = nodeName ? nodeInfo.get(nodeName) : null;
    if (!info) {
      pendingPods.push(pod);
    } else {
      info.pods.push(pod);
      info.used_cpu_m += req_cpu_m;
      info.used_mem_b += req_mem_b;
      info.used_eff_cpu_m += (pod.eff_cpu_m || 0);
      info.used_eff_mem_b += (pod.eff_mem_b || 0);
    }
  }

  const bins = [];
  let totalAvailUnits = 0, totalUsedUnits = 0, perBinAllowedUnits = 0;
  const nodesOut = [];

  for (const n of nodeOrder) {
    const info = nodeInfo.get(n);
    if (!info) continue;

    if (resource === "cpu") {
      const capUnits = Math.ceil((info.alloc_cpu_m || 0) / 100);
      const usedUnits = Math.ceil((info.used_cpu_m || 0) / 100);
      const usedPct = capUnits > 0 ? Math.round((usedUnits / capUnits) * 100) : 0;

      const effUnits = Math.ceil((info.used_eff_cpu_m || 0) / 100);
      const usedEffPct = capUnits > 0 ? Math.round((effUnits / capUnits) * 100) : null;

      nodesOut.push({
        name: n,
        role: info.role || "Worker",
        ip: info.ip || "N/A",
        capacityHuman: `CPU ${((info.alloc_cpu_m || 0) / 1000).toFixed(2)} cores`,
        usedPct,
        usedEffPct,
      });

      perBinAllowedUnits = capUnits;
      totalAvailUnits += capUnits;
      totalUsedUnits += usedUnits;

      const items = [];
      for (const pod of info.pods) {
        const units = Math.max(0, Math.ceil((pod.cpu_m || 0) / 100));
        const cpuHuman = `${pod.cpu_m || 0}m (${((pod.cpu_m || 0) / 1000).toFixed(2)} cores)`;
        const memHuman = `${bytesToMiB(pod.mem_b || 0)} Mi`;
        items.push({
          id: pod.id,
          shortId: pod.name,
          sizeUnits: units,
          sizeHuman: `${pod.cpu_m || 0}m`,
          cpu_m: Number(pod.cpu_m || 0),
          mem_b: Number(pod.mem_b || 0),
          cpuHuman,
          memHuman,
          terminating: !!pod.terminating,
          phase: pod.phase || "",
          creating: !!pod.creating,
        });
      }
      bins.push(items);
    } else {
      const unitSize = 256 * 1024 * 1024;
      const capUnits = Math.ceil((info.alloc_mem_b || 0) / unitSize);
      const usedUnits = Math.ceil((info.used_mem_b || 0) / unitSize);
      const usedPct = capUnits > 0 ? Math.round((usedUnits / capUnits) * 100) : 0;

      const effUnits = Math.ceil((info.used_eff_mem_b || 0) / unitSize);
      const usedEffPct = capUnits > 0 ? Math.round((effUnits / capUnits) * 100) : null;

      nodesOut.push({
        name: n,
        role: info.role || "Worker",
        ip: info.ip || "N/A",
        capacityHuman: `Mem ${bytesToMiB(info.alloc_mem_b || 0)} Mi`,
        usedPct,
        usedEffPct,
      });

      perBinAllowedUnits = capUnits;
      totalAvailUnits += capUnits;
      totalUsedUnits += usedUnits;

      const items = [];
      for (const pod of info.pods) {
        const units = Math.max(0, Math.ceil((pod.mem_b || 0) / unitSize));
        const cpuHuman = `${pod.cpu_m || 0}m (${((pod.cpu_m || 0) / 1000).toFixed(2)} cores)`;
        const memHuman = `${bytesToMiB(pod.mem_b || 0)} Mi`;
        items.push({
          id: pod.id,
          shortId: pod.name,
          sizeUnits: units,
          sizeHuman: `${bytesToMiB(pod.mem_b || 0)} Mi`,
          cpu_m: Number(pod.cpu_m || 0),
          mem_b: Number(pod.mem_b || 0),
          cpuHuman,
          memHuman,
          terminating: !!pod.terminating,
          phase: pod.phase || "",
          creating: !!pod.creating,
        });
      }
      bins.push(items);
    }
  }

  const pendingOut = [];
  if (resource === "cpu") {
    for (const pod of pendingPods) {
      const units = Math.max(0, Math.ceil((pod.cpu_m || 0) / 100));
      pendingOut.push({
        id: pod.id,
        sizeUnits: units,
        cpu_m: Number(pod.cpu_m || 0),
        mem_b: Number(pod.mem_b || 0),
        cpuHuman: `${pod.cpu_m || 0}m (${((pod.cpu_m || 0) / 1000).toFixed(2)} cores)`,
        memHuman: `${bytesToMiB(pod.mem_b || 0)} Mi`,
      });
    }
  } else {
    const unitSize = 256 * 1024 * 1024;
    for (const pod of pendingPods) {
      const units = Math.max(0, Math.ceil((pod.mem_b || 0) / unitSize));
      pendingOut.push({
        id: pod.id,
        sizeUnits: units,
        cpu_m: Number(pod.cpu_m || 0),
        mem_b: Number(pod.mem_b || 0),
        cpuHuman: `${pod.cpu_m || 0}m (${((pod.cpu_m || 0) / 1000).toFixed(2)} cores)`,
        memHuman: `${bytesToMiB(pod.mem_b || 0)} Mi`,
      });
    }
  }

  const binPackRatio = totalAvailUnits > 0 ? Math.round((totalUsedUnits / totalAvailUnits) * 100) / 100 : 0;

  return {
    nodes: nodesOut,
    bins,
    perBinAllowedUnits,
    totalUsedUnits,
    totalAvailableUnits: totalAvailUnits,
    binPackRatio,
    pending: pendingOut,
  };
}

// Inicializa o servidor MCP com a ferramenta get_live_binpacking
const server = new Server({
  name: "mcp-server-k8s-live",
  version: "0.1.0",
}, {
  capabilities: {
    tools: {},
  }
});

// Funções auxiliares para métricas adicionais
async function getDeploymentsMetrics(ns = "") {
  const nsFilter = ns.split(",").map(s => s.trim()).filter(s => s.length > 0);
  const deployments = await k8sGet("/apis/apps/v1/deployments");
  
  const result = [];
  for (const d of (deployments.items || [])) {
    const namespace = d?.metadata?.namespace || "default";
    if (nsFilter.length && !nsFilter.includes(namespace)) continue;
    
    const name = d?.metadata?.name || "unknown";
    const replicas = d?.spec?.replicas || 0;
    const readyReplicas = d?.status?.readyReplicas || 0;
    const availableReplicas = d?.status?.availableReplicas || 0;
    const updatedReplicas = d?.status?.updatedReplicas || 0;
    
    result.push({
      namespace,
      name,
      replicas,
      readyReplicas,
      availableReplicas,
      updatedReplicas,
      status: readyReplicas === replicas ? "Ready" : "Not Ready",
      conditions: d?.status?.conditions || [],
    });
  }
  return result;
}

async function getServicesMetrics(ns = "") {
  const nsFilter = ns.split(",").map(s => s.trim()).filter(s => s.length > 0);
  const services = await k8sGet("/api/v1/services");
  
  const result = [];
  for (const s of (services.items || [])) {
    const namespace = s?.metadata?.namespace || "default";
    if (nsFilter.length && !nsFilter.includes(namespace)) continue;
    
    const name = s?.metadata?.name || "unknown";
    const type = s?.spec?.type || "ClusterIP";
    const clusterIP = s?.spec?.clusterIP || "None";
    const ports = (s?.spec?.ports || []).map(p => ({
      name: p?.name || "",
      port: p?.port || 0,
      targetPort: p?.targetPort || "",
      protocol: p?.protocol || "TCP",
    }));
    
    result.push({
      namespace,
      name,
      type,
      clusterIP,
      ports,
      selector: s?.spec?.selector || {},
    });
  }
  return result;
}

async function getStorageMetrics(ns = "") {
  const nsFilter = ns.split(",").map(s => s.trim()).filter(s => s.length > 0);
  
  // PersistentVolumes (cluster-wide)
  const pvs = await k8sGet("/api/v1/persistentvolumes");
  const pvList = (pvs.items || []).map(pv => ({
    name: pv?.metadata?.name || "unknown",
    capacity: pv?.spec?.capacity?.storage || "0",
    accessModes: pv?.spec?.accessModes || [],
    storageClass: pv?.spec?.storageClassName || "default",
    status: pv?.status?.phase || "Unknown",
    claimRef: pv?.spec?.claimRef ? `${pv.spec.claimRef.namespace}/${pv.spec.claimRef.name}` : null,
  }));
  
  // PersistentVolumeClaims
  const pvcs = await k8sGet("/api/v1/persistentvolumeclaims");
  const pvcList = [];
  for (const pvc of (pvcs.items || [])) {
    const namespace = pvc?.metadata?.namespace || "default";
    if (nsFilter.length && !nsFilter.includes(namespace)) continue;
    
    pvcList.push({
      namespace,
      name: pvc?.metadata?.name || "unknown",
      status: pvc?.status?.phase || "Unknown",
      volume: pvc?.spec?.volumeName || null,
      capacity: pvc?.status?.capacity?.storage || "0",
      requestedStorage: pvc?.spec?.resources?.requests?.storage || "0",
      accessModes: pvc?.spec?.accessModes || [],
      storageClass: pvc?.spec?.storageClassName || "default",
    });
  }
  
  return { persistentVolumes: pvList, persistentVolumeClaims: pvcList };
}

async function getEventsMetrics(ns = "", limit = 50) {
  const nsFilter = ns.split(",").map(s => s.trim()).filter(s => s.length > 0);
  const events = await k8sGet("/api/v1/events");
  
  const result = [];
  for (const e of (events.items || [])) {
    const namespace = e?.metadata?.namespace || "default";
    if (nsFilter.length && !nsFilter.includes(namespace)) continue;
    
    result.push({
      namespace,
      name: e?.metadata?.name || "",
      type: e?.type || "Normal",
      reason: e?.reason || "",
      message: e?.message || "",
      involvedObject: {
        kind: e?.involvedObject?.kind || "",
        name: e?.involvedObject?.name || "",
      },
      firstTimestamp: e?.firstTimestamp || null,
      lastTimestamp: e?.lastTimestamp || null,
      count: e?.count || 1,
    });
  }
  
  // Ordenar por lastTimestamp (mais recente primeiro)
  result.sort((a, b) => {
    const tA = a.lastTimestamp || a.firstTimestamp || "";
    const tB = b.lastTimestamp || b.firstTimestamp || "";
    return tB.localeCompare(tA);
  });
  
  return result.slice(0, limit);
}

async function getClusterOverview() {
  const nodes = await k8sGet("/api/v1/nodes");
  const pods = await k8sGet("/api/v1/pods");
  const namespaces = await k8sGet("/api/v1/namespaces");
  const deployments = await k8sGet("/apis/apps/v1/deployments");
  const services = await k8sGet("/api/v1/services");
  
  // Contagem de nós por role
  let masterCount = 0, workerCount = 0, infraCount = 0;
  let totalCpu = 0, totalMemory = 0;
  
  for (const n of (nodes.items || [])) {
    const labels = n?.metadata?.labels || {};
    if (labels["node-role.kubernetes.io/master"] || labels["node-role.kubernetes.io/control-plane"]) {
      masterCount++;
    } else if (labels["machine-type"] === "infra-node" || labels["node-role.kubernetes.io/infra"]) {
      infraCount++;
    } else {
      workerCount++;
    }
    
    const alloc = n?.status?.allocatable || {};
    totalCpu += parseCpuMillicores(alloc.cpu || "0");
    totalMemory += parseMemBytes(alloc.memory || "0");
  }
  
  // Contagem de pods por status
  let runningPods = 0, pendingPods = 0, failedPods = 0, succeededPods = 0;
  for (const p of (pods.items || [])) {
    const phase = p?.status?.phase || "";
    switch (phase) {
      case "Running": runningPods++; break;
      case "Pending": pendingPods++; break;
      case "Failed": failedPods++; break;
      case "Succeeded": succeededPods++; break;
    }
  }
  
  return {
    cluster: {
      totalNodes: nodes.items?.length || 0,
      masterNodes: masterCount,
      workerNodes: workerCount,
      infraNodes: infraCount,
      totalCpuCores: (totalCpu / 1000).toFixed(2),
      totalMemoryGiB: (totalMemory / (1024 * 1024 * 1024)).toFixed(2),
    },
    pods: {
      total: pods.items?.length || 0,
      running: runningPods,
      pending: pendingPods,
      failed: failedPods,
      succeeded: succeededPods,
    },
    namespaces: {
      total: namespaces.items?.length || 0,
      active: namespaces.items?.filter(ns => ns?.status?.phase === "Active").length || 0,
    },
    deployments: {
      total: deployments.items?.length || 0,
    },
    services: {
      total: services.items?.length || 0,
    },
  };
}

// Função auxiliar para obter a lista de tools
function getToolsList() {
  return {
    tools: [
      {
        name: "get_live_binpacking",
        description: "Obtém o snapshot atual de binpacking do cluster Kubernetes, retornando JSON idêntico ao binpacking-live/liveData.php. Inclui nós (name, role, ip, capacityHuman, usedPct, usedEffPct), bins (pods alocados por nó com cpu/mem requests e flags), pending (pods não alocados) e agregados (perBinAllowedUnits, totalUsedUnits, totalAvailableUnits, binPackRatio). Use resource=cpu|memory e ns=ns1,ns2 para filtrar.",
        inputSchema: {
          type: "object",
          properties: {
            resource: { type: "string", enum: ["cpu", "memory"], default: "cpu", description: "Recurso de referência para dimensionar bins e cálculos de uso: 'cpu' (padrão) ou 'memory'." },
            ns: { type: "string", description: "Namespaces separados por vírgula para filtrar os pods (opcional). Ex.: 'default,kube-system'." },
          },
          additionalProperties: false,
        },
      },
      {
        name: "get_deployments",
        description: "Obtém métricas de todos os Deployments do cluster, incluindo status de réplicas, disponibilidade e condições.",
        inputSchema: {
          type: "object",
          properties: {
            ns: { type: "string", description: "Namespaces separados por vírgula para filtrar (opcional)." },
          },
          additionalProperties: false,
        },
      },
      {
        name: "get_services",
        description: "Obtém dados de todos os Services do cluster, incluindo tipo, ClusterIP, portas e seletores.",
        inputSchema: {
          type: "object",
          properties: {
            ns: { type: "string", description: "Namespaces separados por vírgula para filtrar (opcional)." },
          },
          additionalProperties: false,
        },
      },
      {
        name: "get_storage",
        description: "Obtém dados de armazenamento do cluster, incluindo PersistentVolumes e PersistentVolumeClaims com capacidades e status.",
        inputSchema: {
          type: "object",
          properties: {
            ns: { type: "string", description: "Namespaces separados por vírgula para filtrar PVCs (opcional)." },
          },
          additionalProperties: false,
        },
      },
      {
        name: "get_events",
        description: "Obtém eventos recentes do cluster, incluindo tipo, razao, mensagem e objeto envolvido.",
        inputSchema: {
          type: "object",
          properties: {
            ns: { type: "string", description: "Namespaces separados por vírgula para filtrar (opcional)." },
            limit: { type: "number", default: 50, description: "Número máximo de eventos a retornar (padrão: 50)." },
          },
          additionalProperties: false,
        },
      },
      {
        name: "get_cluster_overview",
        description: "Obtém uma visão geral do cluster com estatísticas agregadas de nós, pods, namespaces, deployments e services.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: "create_vpa",
        description: "Cria um VerticalPodAutoscaler (VPA) para um Deployment específico. Requer confirmação explícita (confirm: true). Suporta dryRun para testes.",
        inputSchema: {
          type: "object",
          properties: {
            namespace: { type: "string", description: "Namespace do Deployment." },
            deployment: { type: "string", description: "Nome do Deployment alvo." },
            name: { type: "string", description: "(Opcional) Nome do VPA a criar. Se omitido, será <deployment>-vpa." },
            confirm: { type: "boolean", description: "Confirmação obrigatória para operações de escrita. Deve ser true para criar o VPA." },
            updateMode: { type: "string", enum: ["Off","Initial","Auto"], default: "Auto", description: "Modo de update do VPA. 'Auto' aplicará recomendações automaticamente." },
            dryRun: { type: "boolean", description: "Se true, faz uma criação em dry-run (server-side) usando ?dryRun=All." },
          },
          required: ["namespace","deployment","confirm"],
          additionalProperties: false,
        },
      },
    ],
  };
}

// Função auxiliar para executar tools
async function executeToolCall(name, args) {
  try {
    switch (name) {
      case "get_live_binpacking": {
        const resourceRaw = typeof args.resource === 'string' ? args.resource : 'cpu';
        const resource = resourceRaw === 'memory' ? 'memory' : 'cpu';
        const ns = typeof args.ns === 'string' ? args.ns : '';
        const data = await buildLiveData({ resource, ns });
        return {
          content: [{
            type: "text",
            text: JSON.stringify(data, null, 2)
          }]
        };
      }
      
      case "get_deployments": {
        const ns = typeof args.ns === 'string' ? args.ns : '';
        const data = await getDeploymentsMetrics(ns);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ deployments: data, total: data.length }, null, 2)
          }]
        };
      }
      
      case "get_services": {
        const ns = typeof args.ns === 'string' ? args.ns : '';
        const data = await getServicesMetrics(ns);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ services: data, total: data.length }, null, 2)
          }]
        };
      }
      
      case "get_storage": {
        const ns = typeof args.ns === 'string' ? args.ns : '';
        const data = await getStorageMetrics(ns);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(data, null, 2)
          }]
        };
      }
      
      case "get_events": {
        const ns = typeof args.ns === 'string' ? args.ns : '';
        const limit = typeof args.limit === 'number' ? args.limit : 50;
        const data = await getEventsMetrics(ns, limit);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ events: data, total: data.length }, null, 2)
          }]
        };
      }
      
      case "get_cluster_overview": {
        const data = await getClusterOverview();
        return {
          content: [{
            type: "text",
            text: JSON.stringify(data, null, 2)
          }]
        };
      }
      
      case "create_vpa": {
        const ns = typeof args.namespace === 'string' ? args.namespace : '';
        const deployment = typeof args.deployment === 'string' ? args.deployment : '';
        const confirm = !!args.confirm;
        const vpaName = typeof args.name === 'string' && args.name ? args.name : `${deployment}-vpa`;
        const updateModeRaw = typeof args.updateMode === 'string' ? args.updateMode : 'Auto';
        const updateMode = ['Off','Initial','Auto'].includes(updateModeRaw) ? updateModeRaw : 'Auto';
        const dryRun = !!args.dryRun;

        if (!ns) {
          return { content: [{ type: 'text', text: 'Erro: parâmetro "namespace" obrigatório.' }], isError: true };
        }
        if (!deployment) {
          return { content: [{ type: 'text', text: 'Erro: parâmetro "deployment" obrigatório.' }], isError: true };
        }
        if (!confirm) {
          return { content: [{ type: 'text', text: 'Confirmação de escrita necessária: defina "confirm": true para criar o VPA.' }], isError: true };
        }

        // Checar se o grupo/autoscaling VPA está disponível (CRD/API)
        try {
          const apiCheck = await k8sGet('/apis/autoscaling.k8s.io', { optional: true });
          if (!apiCheck) {
            return {
              content: [{ type: 'text', text: 'Erro: o grupo API autoscaling.k8s.io (VPA) não está disponível no cluster. Verifique se o CRD VerticalPodAutoscaler está instalado.' }],
              isError: true,
            };
          }
        } catch (e) {
          // Se a checagem falhar, propagar mensagem amigável
          return { content: [{ type: 'text', text: `Erro ao verificar API VPA: ${e.message}` }], isError: true };
        }

        // Construir manifest básico do VPA
        const manifest = {
          apiVersion: 'autoscaling.k8s.io/v1',
          kind: 'VerticalPodAutoscaler',
          metadata: {
            name: vpaName,
            namespace: ns,
          },
          spec: {
            targetRef: {
              apiVersion: 'apps/v1',
              kind: 'Deployment',
              name: deployment,
            },
            updatePolicy: {
              updateMode: updateMode,
            },
          },
        };

        try {
          let path = `/apis/autoscaling.k8s.io/v1/namespaces/${ns}/verticalpodautoscalers`;
          if (dryRun) path += '?dryRun=All';
          const result = await k8sPost(path, manifest);
          return { content: [{ type: 'text', text: JSON.stringify({ created: !dryRun, dryRun, result }, null, 2) }] };
        } catch (e) {
          const status = e?.statusCode || 500;
          return { content: [{ type: 'text', text: `Erro (${status}): ${e.message}` }], isError: true };
        }
      }
      
      default:
        return {
          content: [{ type: "text", text: `Erro: ferramenta desconhecida: ${name}` }],
          isError: true,
        };
    }
  } catch (e) {
    const status = e?.statusCode || 500;
    const message = e?.message || "Erro desconhecido";
    return {
      content: [{ type: "text", text: `Erro (${status}): ${message}` }],
      isError: true,
    };
  }
}

// Handler: tools/list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return getToolsList();
});

// Handler: tools/call
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params?.name;
  const args = (req.params?.arguments || {});
  return await executeToolCall(name, args);
});

// ============================================================================
// TRANSPORTES MCP SUPORTADOS
// ============================================================================
// 1. STDIO: Comunicação via stdin/stdout (padrão para CLI)
// 2. SSE (Server-Sent Events): Streaming unidirecional do servidor para cliente
// 3. HTTP Streamable: JSON-RPC sobre HTTP com suporte a streaming
// ============================================================================

// Transporte stdio para clientes MCP
const ENABLE_STDIO = (process.env.ENABLE_STDIO || "true").toLowerCase() !== "false";
if (ENABLE_STDIO) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] STDIO transport enabled');
}

// HTTP server opcional para clientes que usam HTTP
const PORT = Number(process.env.PORT || 3000);

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'mcp-protocol-version, mcp-session-id',
  });
  res.end(body);
}

function normalizeResource(value) {
  return value === 'memory' ? 'memory' : 'cpu';
}

// Sessões SSE ativas (sessionId -> transport)
const sseSessions = new Map();

// Função auxiliar para ler corpo da requisição
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const httpServer = http.createServer(async (req, res) => {
  try {
    if (!req.url) return sendJson(res, 400, { error: 'Bad request' });
    const u = new URL(req.url, 'http://localhost');
    const pathname = u.pathname;
    // CORS completo para MCP
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version, mcp-session-id, Authorization',
        'Access-Control-Expose-Headers': 'mcp-protocol-version, mcp-session-id',
      });
      return res.end();
    }
    if (req.method === 'GET' && pathname === '/healthz') {
      return sendJson(res, 200, { status: 'ok' });
    }
    
    // Streamable HTTP endpoint para MCP (JSON-RPC sobre HTTP)
    if (req.method === 'POST' && pathname === '/mcp') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      res.setHeader('Content-Type', 'application/json');
      
      try {
        const body = await readBody(req);
        const request = JSON.parse(body);
        
        // Log para debug
        console.error('[MCP] Received request:', JSON.stringify(request));
        
        // Processar requisição MCP
        let response;
        if (request.method === 'initialize') {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { 
                tools: {
                  listChanged: true
                },
              },
              serverInfo: {
                name: 'mcp-server-k8s-live',
                version: '0.1.0',
              },
              instructions: 'Servidor MCP para obter métricas e dados ao vivo de clusters Kubernetes/OpenShift. Fornece 6 ferramentas para consultar binpacking, deployments, services, storage, eventos e visão geral do cluster.',
            },
          };
        } else if (request.method === 'notifications/initialized') {
          // Cliente enviou notificação de inicialização completa
          // Não precisa responder a notificações
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
          });
          console.error('[MCP] Received initialized notification');
          return res.end();
        } else if (request.method && request.method.startsWith('notifications/')) {
          // Outras notificações do cliente
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
          });
          console.error('[MCP] Received notification:', request.method);
          return res.end();
        } else if (request.method === 'ping') {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {},
          };
        } else if (request.method === 'tools/list') {
          // Usar a função auxiliar que retorna a lista de tools
          const result = getToolsList();
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result,
          };
        } else if (request.method === 'tools/call') {
          // Usar a função auxiliar que executa as tools
          const result = await executeToolCall(
            request.params?.name,
            request.params?.arguments || {}
          );
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result,
          };
        } else {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: 'Method not found',
            },
          };
        }
        
        console.error('[MCP] Sending response:', JSON.stringify(response));
        return sendJson(res, 200, response);
      } catch (e) {
        console.error('[MCP] Error processing request:', e);
        const errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
            data: e.message,
          },
        };
        return sendJson(res, 400, errorResponse);
      }
    }
    
    // SSE endpoint para MCP
    if (req.method === 'GET' && pathname === '/mcp/sse') {
      const endpoint = '/mcp/messages';
      // CORS para EventSource cross-origin
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      const sse = new SSEServerTransport(endpoint, res);
      await sse.start();
      sseSessions.set(sse.sessionId, sse);
      // Quando fecha, remover
      sse.onclose = () => { sseSessions.delete(sse.sessionId); };
      return; // conexão mantida aberta
    }
    // Post de mensagens MCP
    if (req.method === 'POST' && pathname === '/mcp/messages') {
      const sessionId = u.searchParams.get('sessionId') || '';
      const sse = sseSessions.get(sessionId);
      if (!sse) {
        res.writeHead(404, { 
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'mcp-protocol-version, mcp-session-id'
        });
        return res.end('Unknown session');
      }
      // Garante cabeçalhos CORS na resposta do handler
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      return sse.handlePostMessage(req, res);
    }
    if (req.method !== 'GET') {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    if (pathname === '/live') {
      const resource = normalizeResource(u.searchParams.get('resource') || 'cpu');
      const ns = u.searchParams.get('ns') || '';
      try {
        const data = await buildLiveData({ resource, ns });
        return sendJson(res, 200, data);
      } catch (e) {
        const status = e?.statusCode || 500;
        return sendJson(res, status, { error: e?.message || 'Erro interno' });
      }
    }
    return sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    return sendJson(res, 500, { error: 'Erro interno' });
  }
});

httpServer.listen(PORT, () => {
  console.error(`[MCP] HTTP server listening on :${PORT}`);
  console.error(`[MCP] Available endpoints:`);
  console.error(`[MCP]   - POST http://localhost:${PORT}/mcp (Streamable HTTP/JSON-RPC)`);
  console.error(`[MCP]   - GET  http://localhost:${PORT}/mcp/sse (SSE transport)`);
  console.error(`[MCP]   - POST http://localhost:${PORT}/mcp/messages (SSE messages)`);
  console.error(`[MCP]   - GET  http://localhost:${PORT}/live?resource=cpu&ns= (Binpacking data)`);
  console.error(`[MCP]   - GET  http://localhost:${PORT}/healthz (Health check)`);
});
