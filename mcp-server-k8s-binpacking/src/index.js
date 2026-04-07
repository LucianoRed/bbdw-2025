import http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { collectDefaultMetrics, register } from 'prom-client';

import { toolsRegistry } from './tools/registry.js';
import { K8S_API_URL } from './utils/k8s.js';

const server = new Server(
  {
    name: 'mcp-server-k8s-binpacking',
    version: '0.1.0',
  },
  {
    capabilities: { tools: {} },
  },
);

const K8S_CLUSTER_NAME = process.env.K8S_CLUSTER_NAME || (
  K8S_API_URL
    ? (() => {
        try {
          return new URL(K8S_API_URL).hostname;
        } catch {
          return 'desconhecido';
        }
      })()
    : 'desconhecido'
);

function getToolsList() {
  return {
    tools: toolsRegistry.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
}

try {
  collectDefaultMetrics({ labels: { cluster: K8S_CLUSTER_NAME } });
  console.error('[MCP] Prometheus metrics collection enabled');
} catch (e) {
  console.error('[MCP] Could not enable Prometheus metrics:', e);
}

async function executeToolCall(name, args) {
  try {
    const tool = toolsRegistry.find((item) => item.name === name);
    if (!tool) {
      return { content: [{ type: 'text', text: `Erro: ferramenta desconhecida: ${name}` }], isError: true };
    }
    return await tool.handler(args || {});
  } catch (e) {
    const status = e?.statusCode || 500;
    const message = e?.message || 'Erro desconhecido';
    return { content: [{ type: 'text', text: `Erro (${status}): ${message}` }], isError: true };
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => getToolsList());
server.setRequestHandler(CallToolRequestSchema, async (req) => (
  executeToolCall(req.params?.name, req.params?.arguments || {})
));

const ENABLE_STDIO = (process.env.ENABLE_STDIO || 'true').toLowerCase() !== 'false';
if (ENABLE_STDIO) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] STDIO transport enabled');
}

const PORT = Number(process.env.PORT || 3000);
const sseSessions = new Map();

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const httpServer = http.createServer(async (req, res) => {
  try {
    if (!req.url) return sendJson(res, 400, { error: 'Bad request' });
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version, mcp-session-id, Authorization',
        'Access-Control-Expose-Headers': 'mcp-protocol-version, mcp-session-id',
      });
      return res.end();
    }

    if (req.method === 'GET' && url.pathname === '/healthz') {
      return sendJson(res, 200, { status: 'ok' });
    }

    if (req.method === 'GET' && url.pathname === '/metrics') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      try {
        res.setHeader('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.writeHead(200);
        return res.end(metrics);
      } catch {
        return sendJson(res, 500, { error: 'Erro ao coletar metricas' });
      }
    }

    if (req.method === 'POST' && url.pathname === '/mcp') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      res.setHeader('Content-Type', 'application/json');

      const body = await readBody(req);
      const request = JSON.parse(body);
      let response;

      if (request.method === 'initialize') {
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: 'mcp-server-k8s-binpacking', version: '0.1.0' },
            instructions: `Servidor MCP read-only para binpacking e otimizacao de capacidade (cluster: ${K8S_CLUSTER_NAME}).`,
          },
        };
      } else if (request.method === 'notifications/initialized' || (request.method || '').startsWith('notifications/')) {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
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

      return sendJson(res, 200, response);
    }

    if (req.method === 'GET' && url.pathname === '/mcp/sse') {
      const endpoint = '/mcp/messages';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      const sse = new SSEServerTransport(endpoint, res);
      await sse.start();
      sseSessions.set(sse.sessionId, sse);
      sse.onclose = () => {
        sseSessions.delete(sse.sessionId);
      };
      return;
    }

    if (req.method === 'POST' && url.pathname === '/mcp/messages') {
      const sessionId = url.searchParams.get('sessionId') || '';
      const sse = sseSessions.get(sessionId);
      if (!sse) {
        res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
        return res.end('Unknown session');
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      return sse.handlePostMessage(req, res);
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || 'Erro interno' });
  }
});

httpServer.listen(PORT, () => {
  console.error(`[MCP] HTTP server listening on :${PORT}`);
  console.error(`[MCP] Cluster alvo: ${K8S_CLUSTER_NAME}`);
});
