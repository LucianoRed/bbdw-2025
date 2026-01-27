import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import db, { COMMON_DISEASES } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuração do Servidor Express (Web UI + MCP SSE) ---
const app = express();
const HTTP_PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', express.json());

// --- API Endpoints para a interface Web ---
app.get('/api/health-records', (req, res) => {
  const query = req.query.q;
  if (query) {
    res.json(db.search(query));
  } else {
    res.json(db.getAll());
  }
});

app.get('/api/health-records/cpf/:cpf', (req, res) => {
  const records = db.searchByCpf(req.params.cpf);
  if (records.length === 0) {
    return res.status(404).json({ error: 'Nenhum registro encontrado para este CPF' });
  }
  res.json(records);
});

app.post('/api/health-records', (req, res) => {
  const { studentName, cpf, diseases, medications, observations, emergencyContact } = req.body;
  if (!studentName || !cpf || !diseases || diseases.length === 0) {
    return res.status(400).json({ error: 'Dados incompletos (nome, CPF e doenças são obrigatórios)' });
  }

  const newRecord = db.add({ 
    studentName, 
    cpf, 
    diseases, 
    medications: medications || 'Nenhum',
    observations: observations || '',
    emergencyContact: emergencyContact || ''
  });
  res.status(201).json(newRecord);
});

app.get('/api/diseases', (req, res) => {
  res.json(COMMON_DISEASES);
});

// --- Configuração do Servidor MCP ---
const server = new Server(
  {
    name: "mcp-server-saude",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Definição das Ferramentas
const TOOLS = [
  {
    name: "listar_registros_saude",
    description: "Lista todos os registros de saúde dos alunos.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "adicionar_registro_saude",
    description: `Adiciona um novo registro de saúde para um aluno. Doenças disponíveis: ${COMMON_DISEASES.join(', ')}.`,
    inputSchema: {
      type: "object",
      properties: {
        studentName: { type: "string", description: "Nome completo do aluno" },
        cpf: { type: "string", description: "CPF do aluno (formato: 000.000.000-00)" },
        diseases: { 
          type: "array", 
          items: { type: "string" },
          description: "Lista de doenças/condições de saúde" 
        },
        medications: { type: "string", description: "Medicações em uso" },
        observations: { type: "string", description: "Observações importantes" },
        emergencyContact: { type: "string", description: "Telefone de contato de emergência" }
      },
      required: ["studentName", "cpf", "diseases"]
    }
  },
  {
    name: "buscar_registro_por_cpf",
    description: "Busca registros de saúde pelo CPF do aluno.",
    inputSchema: {
      type: "object",
      properties: {
        cpf: { type: "string", description: "CPF do aluno para busca" }
      },
      required: ["cpf"]
    }
  },
  {
    name: "listar_doencas_monitoradas",
    description: "Lista todas as doenças comuns monitoradas pelo sistema escolar.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

// Handler para listar ferramentas
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handler para executar ferramentas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await executeToolCall(name, args || {});
});

// --- Transportes MCP ---
const ENABLE_STDIO = (process.env.ENABLE_STDIO || 'true').toLowerCase() !== 'false';
if (ENABLE_STDIO) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] STDIO transport enabled');
}

function getToolsList() {
  return {
    tools: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  };
}

async function executeToolCall(name, args) {
  try {
    switch (name) {
      case 'listar_registros_saude': {
        const records = db.getAll();
        return { content: [{ type: 'text', text: JSON.stringify(records, null, 2) }] };
      }
      case 'adicionar_registro_saude': {
        const { studentName, cpf, diseases, medications, observations, emergencyContact } = args || {};
        if (!studentName || !cpf || !diseases) {
          throw new Error("Parâmetros 'studentName', 'cpf' e 'diseases' são obrigatórios.");
        }

        const record = db.add({ 
          studentName, 
          cpf, 
          diseases: Array.isArray(diseases) ? diseases : [diseases],
          medications: medications || 'Nenhum',
          observations: observations || '',
          emergencyContact: emergencyContact || ''
        });
        return { content: [{ type: 'text', text: `Registro de saúde criado com sucesso: ID ${record.id} - ${record.studentName}` }] };
      }
      case 'buscar_registro_por_cpf': {
        const { cpf } = args || {};
        if (!cpf) throw new Error("Parâmetro 'cpf' é obrigatório.");
        const results = db.searchByCpf(cpf);
        if (!results.length) return { content: [{ type: 'text', text: 'Nenhum registro encontrado para este CPF.' }] };
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }
      case 'listar_doencas_monitoradas': {
        return { content: [{ type: 'text', text: JSON.stringify(COMMON_DISEASES, null, 2) }] };
      }
      default:
        return { content: [{ type: 'text', text: `Ferramenta não encontrada: ${name}` }], isError: true };
    }
  } catch (e) {
    return { content: [{ type: 'text', text: `Erro ao executar ferramenta: ${e?.message || 'Erro desconhecido'}` }], isError: true };
  }
}

// --- SSE Endpoints ---
app.get('/sse', async (req, res) => {
  console.log('[SSE] Nova conexão iniciada');
  const transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  console.log('[SSE] Mensagem recebida');
  // A SDK do MCP lida com isso internamente
});

// --- Servidor HTTP com suporte completo a MCP ---
const sseSessions = new Map();

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const httpServer = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || '/', `http://${req.headers.host}`);
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

    // JSON-RPC over HTTP
    if (req.method === 'POST' && pathname === '/mcp') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      res.setHeader('Content-Type', 'application/json');
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
              capabilities: { tools: { listChanged: true } },
              serverInfo: { name: 'mcp-server-saude', version: '1.0.0' },
              instructions: `Servidor MCP para sistema de saúde escolar. Gerencia registros de saúde dos alunos vinculados por CPF. Doenças monitoradas: ${COMMON_DISEASES.join(', ')}.`,
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
        const errorResponse = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: e?.message } };
        return sendJson(res, 400, errorResponse);
      }
    }

    // SSE endpoint
    if (req.method === 'GET' && (pathname === '/mcp/sse' || pathname === '/sse')) {
      const endpoint = '/mcp/messages';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      const sse = new SSEServerTransport(endpoint, res);
      await sse.start();
      await server.connect(sse);
      sseSessions.set(sse.sessionId, sse);
      sse.onclose = () => { sseSessions.delete(sse.sessionId); };
      return;
    }

    if (req.method === 'POST' && (pathname === '/mcp/messages' || pathname === '/messages')) {
      const sessionId = u.searchParams.get('sessionId') || '';
      const sse = sseSessions.get(sessionId);
      if (!sse) {
        res.writeHead(404, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'mcp-protocol-version, mcp-session-id',
        });
        return res.end('Unknown session');
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      return sse.handlePostMessage(req, res);
    }

    // Demais rotas: delega para o Express (UI web + API)
    return app(req, res);
  } catch (e) {
    return sendJson(res, 500, { error: 'Erro interno' });
  }
});

httpServer.listen(HTTP_PORT, () => {
  console.error(`[MCP] HTTP server listening on :${HTTP_PORT}`);
  console.error(`[MCP] Web UI: http://localhost:${HTTP_PORT}`);
  console.error(`[MCP] Available endpoints:`);
  console.error(`[MCP]   - POST http://localhost:${HTTP_PORT}/mcp (Streamable HTTP/JSON-RPC)`);
  console.error(`[MCP]   - GET  http://localhost:${HTTP_PORT}/mcp/sse (SSE transport)`);
  console.error(`[MCP]   - POST http://localhost:${HTTP_PORT}/mcp/messages (SSE messages)`);
  console.error(`[MCP]   - GET  http://localhost:${HTTP_PORT}/healthz (Health check)`);
});
