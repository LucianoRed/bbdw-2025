import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import http from "http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { register, collectDefaultMetrics } from 'prom-client';

import { checkStatusTool } from "./tools/status.js";
import { downdetectorTool } from "./tools/downdetector.js";

// Registro de ferramentas
const toolsRegistry = [checkStatusTool, downdetectorTool];

// Inicializa o servidor MCP
const server = new Server({
  name: "mcp-server-downdetector",
  version: "0.1.0",
}, {
  capabilities: { tools: {} }
});

// Métricas Prometheus
try {
  collectDefaultMetrics({ labels: { service: 'downdetector' } });
  console.error('[MCP] Prometheus metrics collection enabled');
} catch (e) {
  console.error('[MCP] Could not enable Prometheus metrics:', e);
}

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
    return { content: [{ type: 'text', text: `Erro: ${e.message}` }], isError: true };
  }
}

// Handlers MCP
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return getToolsList();
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  return await executeToolCall(req.params?.name, req.params?.arguments || {});
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
        'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version, mcp-session-id',
      });
      return res.end();
    }

    if (req.method === 'GET' && pathname === '/healthz') {
      return sendJson(res, 200, { status: 'ok' });
    }

    if (req.method === 'GET' && pathname === '/metrics') {
      try {
        res.setHeader('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.writeHead(200);
        return res.end(metrics);
      } catch (e) {
        return sendJson(res, 500, { error: 'Erro metrics' });
      }
    }

    // JSON-RPC over HTTP
    if (req.method === 'POST' && pathname === '/mcp') {
      try {
        const body = await readBody(req);
        const request = JSON.parse(body);
        let response;
        if (request.method === 'initialize') {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'mcp-server-downdetector', version: '0.1.0' }
            }
          };
        } else if (request.method === 'tools/list') {
          response = { jsonrpc: '2.0', id: request.id, result: getToolsList() };
        } else if (request.method === 'tools/call') {
          const result = await executeToolCall(request.params?.name, request.params?.arguments || {});
          response = { jsonrpc: '2.0', id: request.id, result };
        } else {
          // Fallback simples
          response = { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } };
        }
        return sendJson(res, 200, response);
      } catch (e) {
        return sendJson(res, 400, { error: 'Parse error' });
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
      const sessionId = u.searchParams.get('sessionId');
      const sse = sseSessions.get(sessionId);
      if (!sse) return sendJson(res, 404, { error: 'Session not found' });
      return sse.handlePostMessage(req, res);
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: 'Internal error' });
  }
});

httpServer.listen(PORT, () => {
  console.error(`[MCP] Downdetector server listening on :${PORT}`);
});
