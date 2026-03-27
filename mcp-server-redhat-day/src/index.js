import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { toolsRegistry } from './tools/registry.js';
import { listDays, getDay, createDay, deleteDay, saveDay, addPresentation } from './db.js';
import { buildSchedule } from './tools/reports.js';
import { getProducts } from './products.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HTTP_PORT = Number(process.env.PORT || 3007);

// ------------------------------------------------------------------ Express (Web UI + REST API)

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', express.json());

app.get('/api/days', async (req, res, next) => {
  try { res.json(await listDays()); } catch (e) { next(e); }
});

app.get('/api/days/:id', async (req, res, next) => {
  try {
    const day = await getDay(req.params.id);
    if (!day) return res.status(404).json({ error: 'Não encontrado' });
    res.json(day);
  } catch (e) { next(e); }
});

app.post('/api/days', async (req, res, next) => {
  try {
    const { clientName, clientContact, date, type, clientInterests } = req.body || {};
    if (!clientName || !date || !type) {
      return res.status(400).json({ error: 'clientName, date e type são obrigatórios' });
    }
    const valid = ['full', 'morning', 'afternoon'];
    if (!valid.includes(type)) {
      return res.status(400).json({ error: `type deve ser: ${valid.join(' | ')}` });
    }
    const day = await createDay({ clientName, clientContact, date, type, clientInterests });
    res.status(201).json(day);
  } catch (e) { next(e); }
});

app.delete('/api/days/:id', async (req, res, next) => {
  try {
    const removed = await deleteDay(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ message: `Red Hat Day de ${removed.clientName} removido.` });
  } catch (e) { next(e); }
});

app.post('/api/days/:id/presentations', async (req, res, next) => {
  try {
    const day = await getDay(req.params.id);
    if (!day) return res.status(404).json({ error: 'Não encontrado' });
    const p = addPresentation(day, req.body);
    await saveDay(day);
    res.status(201).json(p);
  } catch (e) { next(e); }
});

app.get('/api/days/:id/schedule', async (req, res, next) => {
  try {
    const day = await getDay(req.params.id);
    if (!day) return res.status(404).json({ error: 'Não encontrado' });
    res.json(buildSchedule(day));
  } catch (e) { next(e); }
});

app.get('/api/products', async (req, res, next) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    res.json(await getProducts(forceRefresh));
  } catch (e) { next(e); }
});

app.post('/api/days/:id/auto-agenda', async (req, res, next) => {
  try {
    const day = await getDay(req.params.id);
    if (!day) return res.status(404).json({ error: 'Não encontrado' });

    const {
      durationMinutes   = 20,
      discussionMinutes = 10,
      coffeeBreakMinutes = 30,
      clearExisting      = true,
    } = req.body || {};

    if (clearExisting) day.presentations = [];

    const products  = await getProducts();
    const interests = day.clientInterests || [];

    // Score products by client interests
    const scored = products.map((p) => {
      let score = 0;
      const pName     = p.name.toLowerCase();
      const pCategory = (p.category || '').toLowerCase();
      for (const interest of interests) {
        const lower = interest.toLowerCase();
        if (pName.includes(lower))     score += 3;
        else if (pCategory.includes(lower)) score += 1;
        for (const kw of lower.split(/\s+/)) {
          if (kw.length > 3 && pName.includes(kw)) score += 2;
        }
      }
      return { ...p, score };
    });

    // Calculate how many slots fit given coffee breaks
    const AVAIL = { full: { raw: 390, coffeeBreaks: 2 }, morning: { raw: 180, coffeeBreaks: 1 }, afternoon: { raw: 210, coffeeBreaks: 1 } };
    const times = AVAIL[day.type] || AVAIL.full;
    const availableMinutes = times.raw - (times.coffeeBreaks * Number(coffeeBreakMinutes));
    const slotMinutes = Number(durationMinutes) + Number(discussionMinutes);
    const maxSlots = Math.max(1, Math.floor(availableMinutes / slotMinutes));

    const selected = scored
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, maxSlots);

    for (const product of selected) {
      addPresentation(day, { product: product.name, durationMinutes: Number(durationMinutes), discussionMinutes: Number(discussionMinutes) });
    }

    await saveDay(day);
    res.json({ day, totalAdded: selected.length, maxSlots, availableMinutes });
  } catch (e) { next(e); }
});

// JSON error handler — garante que erros nunca retornem HTML
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const msg = err?.message || 'Erro interno';
  const isRedis = msg.includes('enableOfflineQueue') || msg.includes('ECONNREFUSED') || msg.includes('Redis');
  const userMsg = isRedis
    ? `Redis não está disponível (${process.env.REDIS_URL || 'redis://localhost:6379'})`
    : msg;
  console.error('[RHD] API error:', msg);
  res.status(err.status || 500).json({ error: userMsg });
});

const mcpServer = new Server(
  { name: 'mcp-server-redhat-day', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

function getToolsList() {
  return {
    tools: toolsRegistry.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  };
}

async function executeToolCall(name, args) {
  try {
    const tool = toolsRegistry.find((t) => t.name === name);
    if (!tool) {
      return { content: [{ type: 'text', text: `Ferramenta não encontrada: ${name}` }], isError: true };
    }
    return await tool.handler(args || {});
  } catch (e) {
    const msg = e?.message || 'Erro desconhecido';
    const isRedis = msg.includes('enableOfflineQueue') || msg.includes('ECONNREFUSED') || msg.includes('Redis');
    const userMsg = isRedis
      ? 'Redis não está disponível. Verifique se o Redis está rodando (REDIS_URL=' + (process.env.REDIS_URL || 'redis://localhost:6379') + ')'
      : `Erro ao executar ferramenta: ${msg}`;
    return { content: [{ type: 'text', text: userMsg }], isError: true };
  }
}

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => getToolsList());
mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
  return await executeToolCall(req.params?.name, req.params?.arguments || {});
});

// STDIO transport (optional)
const ENABLE_STDIO = (process.env.ENABLE_STDIO || 'false').toLowerCase() === 'true';
if (ENABLE_STDIO) {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('[RHD] STDIO transport enabled');
}

// ------------------------------------------------------------------ HTTP helpers

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
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const sseSessions = new Map();

// ------------------------------------------------------------------ HTTP Server

const httpServer = http.createServer(async (req, res) => {
  try {
    if (!req.url) return sendJson(res, 400, { error: 'Bad request' });
    const u = new URL(req.url, 'http://localhost');
    const pathname = u.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version, mcp-session-id, Authorization',
        'Access-Control-Expose-Headers': 'mcp-protocol-version, mcp-session-id',
      });
      return res.end();
    }

    if (req.method === 'GET' && pathname === '/healthz') {
      return sendJson(res, 200, { status: 'ok', service: 'mcp-server-redhat-day' });
    }

    // JSON-RPC over HTTP (Streamable — compatível com StreamableHttpMcpTransport do agent-ai)
    if (req.method === 'POST' && pathname === '/mcp') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      res.setHeader('Content-Type', 'application/json');
      try {
        const body = await readBody(req);
        const request = JSON.parse(body);
        console.error('[RHD] MCP request:', request.method, request.id ?? '');
        let response;

        if (request.method === 'initialize') {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: { listChanged: true } },
              serverInfo: { name: 'mcp-server-redhat-day', version: '1.0.0' },
              instructions:
                'Servidor MCP para planejar Red Hat Days: apresentações de produtos Red Hat para clientes. ' +
                'Use criar_redhat_day para iniciar, listar_produtos_redhat para ver o catálogo, ' +
                'sugerir_agenda para sugestões automáticas e gerar_relatorio para o schedule completo.',
            },
          };
        } else if (request.method === 'notifications/initialized') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
          return res.end();
        } else if (request.method && request.method.startsWith('notifications/')) {
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
      } catch (e) {
        console.error('[RHD] MCP error:', e.message);
        return sendJson(res, 400, {
          jsonrpc: '2.0', id: null,
          error: { code: -32700, message: 'Parse error', data: e.message },
        });
      }
    }

    // SSE transport
    if (req.method === 'GET' && (pathname === '/mcp/sse' || pathname === '/sse')) {
      const endpoint = '/mcp/messages';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      const sse = new SSEServerTransport(endpoint, res);
      await sse.start();
      await mcpServer.connect(sse);
      sseSessions.set(sse.sessionId, sse);
      sse.onclose = () => { sseSessions.delete(sse.sessionId); };
      return;
    }

    if (req.method === 'POST' && (pathname === '/mcp/messages' || pathname === '/messages')) {
      const sessionId = u.searchParams.get('sessionId') || '';
      const sse = sseSessions.get(sessionId);
      if (!sse) {
        res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
        return res.end('Unknown session');
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      return sse.handlePostMessage(req, res);
    }

    // Delegate to Express (Web UI + REST API)
    return app(req, res);
  } catch (e) {
    console.error('[RHD] Unhandled error:', e.message);
    return sendJson(res, 500, { error: 'Erro interno' });
  }
});

httpServer.listen(HTTP_PORT, () => {
  console.error(`[RHD] Red Hat Day Planner listening on :${HTTP_PORT}`);
  console.error(`[RHD] Web UI:  http://localhost:${HTTP_PORT}`);
  console.error(`[RHD] MCP:     POST http://localhost:${HTTP_PORT}/mcp`);
  console.error(`[RHD] SSE:     GET  http://localhost:${HTTP_PORT}/mcp/sse`);
  console.error(`[RHD] Health:  GET  http://localhost:${HTTP_PORT}/healthz`);
  console.error(`[RHD] API:     GET  http://localhost:${HTTP_PORT}/api/days`);
});
