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

// Handler: tools/list
server.setRequestHandler(ListToolsRequestSchema, async () => {
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
      }
    ],
  };
});

// Handler: tools/call
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params?.name;
  const args = (req.params?.arguments || {});
  if (name !== "get_live_binpacking") {
    return {
      content: [ { type: "text", text: `Erro: ferramenta desconhecida: ${name}` } ],
      isError: true,
    };
  }
  const resourceRaw = typeof args.resource === 'string' ? args.resource : 'cpu';
  const resource = resourceRaw === 'memory' ? 'memory' : 'cpu';
  const ns = typeof args.ns === 'string' ? args.ns : '';
  try {
    const data = await buildLiveData({ resource, ns });
    const qs = new URLSearchParams({ resource, ns }).toString();
    return {
      content: [ {
        type: "resource",
        resource: {
          uri: `mcp://binpacking/live?${qs}`,
          mimeType: "application/json",
          text: JSON.stringify(data)
        }
      } ]
    };
  } catch (e) {
    const status = e?.statusCode || 500;
    const message = e?.message || "Erro desconhecido";
    return {
      content: [ { type: "text", text: `Erro (${status}): ${message}` } ],
      isError: true,
    };
  }
});

// Transporte stdio para clientes MCP
const ENABLE_STDIO = (process.env.ENABLE_STDIO || "true").toLowerCase() !== "false";
if (ENABLE_STDIO) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// HTTP server opcional para clientes que usam HTTP
const PORT = Number(process.env.PORT || 3000);

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function normalizeResource(value) {
  return value === 'memory' ? 'memory' : 'cpu';
}

// Sessões SSE ativas (sessionId -> transport)
const sseSessions = new Map();

const httpServer = http.createServer(async (req, res) => {
  try {
    if (!req.url) return sendJson(res, 400, { error: 'Bad request' });
    const u = new URL(req.url, 'http://localhost');
    const pathname = u.pathname;
    // CORS básico
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }
    if (req.method === 'GET' && pathname === '/healthz') {
      return sendJson(res, 200, { status: 'ok' });
    }
    // SSE endpoint para MCP
    if (req.method === 'GET' && pathname === '/mcp/sse') {
      const endpoint = '/mcp/messages';
      // CORS para EventSource cross-origin
      res.setHeader('Access-Control-Allow-Origin', '*');
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
        res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
        return res.end('Unknown session');
      }
      // Garante cabeçalhos CORS na resposta do handler
      res.setHeader('Access-Control-Allow-Origin', '*');
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
  // eslint-disable-next-line no-console
  console.log(`[mcp-server-k8s-live] HTTP listening on :${PORT}`);
});
