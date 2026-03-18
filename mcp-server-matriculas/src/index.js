import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import db, { ALLOWED_YEARS, schools } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuração do Servidor Express (Web UI + MCP SSE) ---
const app = express();
const HTTP_PORT = process.env.PORT || 3000;

app.use(cors());

// NOTA: body-parser.json() pode interferir na leitura manual do body do MCP se não configurado corretamente para rotas específicas.
// Para simplificar, usamos express.json() globalmente, mas para o SSE pode ser necessário cuidado.
// No caso da SDK do MCP, o handlePostMessage espera req/res crus do Node.js, ou compatíveis.
// O endpoint /messages do Express precisa lidar com isso.

app.use(express.static(path.join(__dirname, 'public')));
// IMPORTANTE: não use body parsing global aqui.
// Os endpoints MCP precisam do stream original do request (para SSE / handlePostMessage).
// Vamos aplicar JSON parsing apenas em /api.
app.use('/api', express.json());

// --- API Endpoints para a interface Web ---
app.get('/api/schools', (req, res) => {
  const need = req.query.necessidade;
  const bairro = req.query.bairro;
  if (need) return res.json(schools.getBySpecialNeed(need));
  if (bairro) return res.json(schools.getByBairro(bairro));
  res.json(schools.getAll());
});

app.get('/api/students', (req, res) => {
  const query = req.query.q;
  if (query) {
    res.json(db.search(query));
  } else {
    res.json(db.getAll());
  }
});

app.post('/api/students', (req, res) => {
  const { name, cpf, dob, year, escola_id } = req.body;
  if (!name || !cpf || !dob || !year) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  const yearNumber = Number(year);
  if (!Number.isInteger(yearNumber) || !ALLOWED_YEARS.includes(yearNumber)) {
    return res.status(400).json({ error: `Ano inválido. Use apenas: ${ALLOWED_YEARS.join(', ')}.` });
  }

  if (escola_id && !schools.getById(escola_id)) {
    return res.status(400).json({ error: `Escola com ID ${escola_id} não encontrada.` });
  }

  const studentData = { name, cpf, dob, year: yearNumber };
  if (escola_id) studentData.escola_id = Number(escola_id);
  const newStudent = db.add(studentData);
  res.status(201).json(newStudent);
});

app.delete('/api/students/:id', (req, res) => {
  const removed = db.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Aluno não encontrado.' });
  res.json({ message: `Matrícula de ${removed.name} cancelada com sucesso.` });
});

// --- Configuração do Servidor MCP ---
const server = new Server(
  {
    name: "mcp-server-matriculas",
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
    name: "listar_alunos",
    description: "Lista todos os alunos matriculados no sistema.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "matricular_aluno",
    description: `Realiza a matrícula de um novo aluno (anos permitidos: ${ALLOWED_YEARS.join(', ')}). Use listar_escolas ou buscar_escolas_por_necessidade para obter o id da escola antes de matricular.`,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome completo do aluno" },
        cpf: { type: "string", description: "CPF do aluno (formato: 000.000.000-00)" },
        dob: { type: "string", description: "Data de nascimento (DD/MM/AAAA)" },
        year: { type: "integer", enum: ALLOWED_YEARS, description: "Ano desejado (apenas 5, 6, 7 ou 8)" },
        escola_id: { type: "integer", description: "ID da escola onde o aluno será matriculado (opcional, obtido via listar_escolas)" }
      },
      required: ["name", "cpf", "dob", "year"]
    }
  },
  {
    name: "listar_escolas",
    description: "Lista todas as escolas disponíveis com seus bairros, endereços e suporte a necessidades especiais.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "buscar_escolas_por_necessidade",
    description: "Busca escolas que possuem atendimento especializado para uma necessidade específica (ex: TDAH, autismo, dislexia, deficiência visual, deficiência auditiva).",
    inputSchema: {
      type: "object",
      properties: {
        necessidade: { type: "string", description: "Necessidade especial a filtrar (ex: TDAH, autismo, dislexia)" }
      },
      required: ["necessidade"]
    }
  },
  {
    name: "buscar_escolas_por_bairro",
    description: "Lista as escolas de um determinado bairro.",
    inputSchema: {
      type: "object",
      properties: {
        bairro: { type: "string", description: "Nome do bairro (ex: Centro, Vila Nova, Bela Vista)" }
      },
      required: ["bairro"]
    }
  },
  {
    name: "buscar_aluno",
    description: "Busca alunos pelo nome.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nome ou parte do nome para busca" }
      },
      required: ["query"]
    }
  }
];

// Handler para listar ferramentas
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handler para executar ferramentas (STDIO/SSE também usa isso)
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
      case 'listar_alunos': {
        const students = db.getAll();
        return { content: [{ type: 'text', text: JSON.stringify(students, null, 2) }] };
      }
      case 'matricular_aluno': {
        const { name: studentName, cpf, dob, year, escola_id } = args || {};
        if (!studentName || !cpf || !dob || !year) throw new Error("Parâmetros 'name', 'cpf', 'dob' e 'year' são obrigatórios.");

        const yearNumber = Number(year);
        if (!Number.isInteger(yearNumber) || !ALLOWED_YEARS.includes(yearNumber)) {
          throw new Error(`Ano inválido. Use apenas: ${ALLOWED_YEARS.join(', ')}.`);
        }

        let escola = null;
        if (escola_id) {
          escola = schools.getById(escola_id);
          if (!escola) throw new Error(`Escola com ID ${escola_id} não encontrada. Use listar_escolas para ver as opções.`);
        }

        const studentData = { name: studentName, cpf, dob, year: yearNumber };
        if (escola) studentData.escola_id = escola.id;
        const student = db.add(studentData);

        const escolaInfo = escola ? ` na ${escola.nome} (${escola.bairro})` : '';
        return { content: [{ type: 'text', text: `Aluno matriculado com sucesso: ID ${student.id} - ${student.name}${escolaInfo}` }] };
      }
      case 'listar_escolas': {
        const all = schools.getAll();
        return { content: [{ type: 'text', text: JSON.stringify(all, null, 2) }] };
      }
      case 'buscar_escolas_por_necessidade': {
        const { necessidade } = args || {};
        if (!necessidade) throw new Error("Parâmetro 'necessidade' é obrigatório.");
        const result = schools.getBySpecialNeed(necessidade);
        if (!result.length) return { content: [{ type: 'text', text: `Nenhuma escola encontrada com suporte a: ${necessidade}` }] };
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      case 'buscar_escolas_por_bairro': {
        const { bairro } = args || {};
        if (!bairro) throw new Error("Parâmetro 'bairro' é obrigatório.");
        const result = schools.getByBairro(bairro);
        if (!result.length) return { content: [{ type: 'text', text: `Nenhuma escola encontrada no bairro: ${bairro}` }] };
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      case 'buscar_aluno': {
        const { query } = args || {};
        if (!query) throw new Error("Parâmetro 'query' é obrigatório.");
        const results = db.search(query);
        if (!results.length) return { content: [{ type: 'text', text: 'Nenhum aluno encontrado.' }] };
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }
      default:
        return { content: [{ type: 'text', text: `Ferramenta não encontrada: ${name}` }], isError: true };
    }
  } catch (e) {
    return { content: [{ type: 'text', text: `Erro ao executar ferramenta: ${e?.message || 'Erro desconhecido'}` }], isError: true };
  }
}

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
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// SSE sessions (multi-sessão)
const sseSessions = new Map();

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

    // JSON-RPC over HTTP (igual aos outros MCPs do repo)
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
              serverInfo: { name: 'mcp-server-matriculas', version: '1.0.0' },
              instructions: `Servidor MCP para um sistema simples de matrículas escolares (listar/buscar/matricular). Importante: o campo 'year' aceita apenas ${ALLOWED_YEARS.join(', ')}.`,
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

    // SSE endpoint (padrão do repo: /mcp/sse e /mcp/messages)
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
