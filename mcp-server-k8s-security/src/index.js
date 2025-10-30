import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import http from "http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import { toolsRegistry } from "./tools/registry.js";
import { K8S_API_URL } from "./utils/k8s.js";

// Inicializa o servidor MCP (apenas wiring)
const server = new Server({
  name: "mcp-server-k8s-security",
  version: "0.1.0",
}, {
  capabilities: { tools: {} }
});

// Identidade do cluster (via env var ou fallback ao host do K8S_API_URL)
const K8S_CLUSTER_NAME = process.env.K8S_CLUSTER_NAME || (K8S_API_URL ? (() => { try { return new URL(K8S_API_URL).hostname; } catch { return 'desconhecido'; } })() : 'desconhecido');

// Helpers
function getToolsList() {
  return { tools: toolsRegistry.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
}

async function executeToolCall(name, args) {
  try {
    const tool = toolsRegistry.find(t => t.name === name);
    if (!tool) return { content: [{ type: 'text', text: `Erro: ferramenta desconhecida: ${name}` }], isError: true };
    return await tool.handler(args || {});
  } catch (e) {
    const status = e?.statusCode || 500;
    const message = e?.message || 'Erro desconhecido';
    return { content: [{ type: 'text', text: `Erro (${status}): ${message}` }], isError: true };
  }
}

// Handlers MCP
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return getToolsList();
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params?.name;
  const args = (req.params?.arguments || {});
  return await executeToolCall(name, args);
});

// Transportes
const ENABLE_STDIO = (process.env.ENABLE_STDIO || "true").toLowerCase() !== "false";
if (ENABLE_STDIO) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] STDIO transport enabled');
}

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

// SSE sessions
const sseSessions = new Map();

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

    // JSON-RPC over HTTP (streamable)
    if (req.method === 'POST' && pathname === '/mcp') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      res.setHeader('Content-Type', 'application/json');
      try {
        const body = await readBody(req);
        const request = JSON.parse(body);
        console.error('[MCP] Received request:', JSON.stringify(request));
        let response;
        if (request.method === 'initialize') {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: { listChanged: true } },
              serverInfo: { name: 'mcp-server-k8s-security', version: '0.1.0' },
              instructions: `Servidor MCP para operações de segurança (NetworkPolicies, logs, namespaces) no cluster: ${K8S_CLUSTER_NAME}.`,
            },
          };
        } else if (request.method === 'notifications/initialized') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
          console.error('[MCP] Received initialized notification');
          return res.end();
        } else if (request.method && request.method.startsWith('notifications/')) {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
          console.error('[MCP] Received notification:', request.method);
          return res.end();
        } else if (request.method === 'ping') {
          response = { jsonrpc: '2.0', id: request.id, result: {} };
        } else if (request.method === 'tools/list') {
          response = { jsonrpc: '2.0', id: request.id, result: getToolsList() };
        } else if (request.method === 'tools/call') {
          const result = await executeToolCall(request.params?.name, request.params?.arguments || {});
          response = { jsonrpc: '2.0', id: request.id, result };
        } else {
          response = { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } };
        }
        console.error('[MCP] Sending response:', JSON.stringify(response));
        return sendJson(res, 200, response);
      } catch (e) {
        console.error('[MCP] Error processing request:', e);
        const errorResponse = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: e.message } };
        return sendJson(res, 400, errorResponse);
      }
    }

    // SSE endpoint
    if (req.method === 'GET' && pathname === '/mcp/sse') {
      const endpoint = '/mcp/messages';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      const sse = new SSEServerTransport(endpoint, res);
      await sse.start();
      sseSessions.set(sse.sessionId, sse);
      sse.onclose = () => { sseSessions.delete(sse.sessionId); };
      return;
    }

    if (req.method === 'POST' && pathname === '/mcp/messages') {
      const sessionId = u.searchParams.get('sessionId') || '';
      const sse = sseSessions.get(sessionId);
      if (!sse) {
        res.writeHead(404, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'mcp-protocol-version, mcp-session-id' });
        return res.end('Unknown session');
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      return sse.handlePostMessage(req, res);
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    return sendJson(res, 500, { error: 'Erro interno' });
  }
});

httpServer.listen(PORT, () => {
  console.error(`[MCP] HTTP server listening on :${PORT}`);
  console.error(`[MCP] Cluster alvo: ${K8S_CLUSTER_NAME}`);
  console.error(`[MCP] Available endpoints:`);
  console.error(`[MCP]   - POST http://localhost:${PORT}/mcp (Streamable HTTP/JSON-RPC)`);
  console.error(`[MCP]   - GET  http://localhost:${PORT}/mcp/sse (SSE transport)`);
  console.error(`[MCP]   - POST http://localhost:${PORT}/mcp/messages (SSE messages)`);
  console.error(`[MCP]   - GET  http://localhost:${PORT}/healthz (Health check)`);
});
