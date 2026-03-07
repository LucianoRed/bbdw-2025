import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  listarUnidades,
  listarTiposProcesso,
  listarTiposDocumento,
  listarInteressados,
  listarProcessos,
  consultarProcesso,
  criarProcesso,
  listarDocumentosProcesso,
  consultarDocumento,
  conteudoDocumento,
  incluirDocumento,
  statusConfiguracao,
} from './sei-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Express (Web UI + API REST)
// ---------------------------------------------------------------------------
const app = express();
const HTTP_PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// JSON parsing apenas para /api
app.use('/api', express.json());

// Endpoints REST para a UI web
app.get('/api/config', (_req, res) => {
  res.json(statusConfiguracao());
});

app.get('/api/processos', async (req, res) => {
  try {
    const { situacao, pesquisa, id_tipo_processo, pagina, registros_por_pagina } = req.query;
    const resultado = await listarProcessos({ situacao, pesquisa, id_tipo_processo, pagina, registros_por_pagina });
    res.json(resultado || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/processos/:protocolo', async (req, res) => {
  try {
    const resultado = await consultarProcesso(req.params.protocolo);
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/processos/:protocolo/documentos', async (req, res) => {
  try {
    const resultado = await listarDocumentosProcesso(req.params.protocolo);
    res.json(resultado || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/processos', async (req, res) => {
  try {
    const resultado = await criarProcesso(req.body);
    res.status(201).json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/tipos-processo', async (_req, res) => {
  try {
    const resultado = await listarTiposProcesso();
    res.json(resultado || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/unidades', async (_req, res) => {
  try {
    const resultado = await listarUnidades();
    res.json(resultado || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/interessados', async (req, res) => {
  try {
    const { nome, id_tipo_contato, pagina, registros_por_pagina } = req.query;
    const resultado = await listarInteressados({ nome, id_tipo_contato, pagina, registros_por_pagina });
    res.json(resultado || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Servidor MCP
// ---------------------------------------------------------------------------
const server = new Server(
  { name: 'mcp-server-sei', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: 'sei_status_configuracao',
    description: 'Verifica se as credenciais do SEI (URL, token e unidade) estão configuradas corretamente.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'sei_listar_unidades',
    description: 'Lista as unidades organizacionais acessíveis com o token SEI configurado.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'sei_listar_tipos_processo',
    description: 'Lista os tipos de processo disponíveis na unidade configurada no SEI.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'sei_listar_tipos_documento',
    description: 'Lista os tipos de documento disponíveis na unidade configurada no SEI.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'sei_listar_processos',
    description: 'Lista processos da unidade no SEI. Permite filtrar por situação, tipo de processo ou texto de pesquisa.',
    inputSchema: {
      type: 'object',
      properties: {
        situacao: {
          type: 'string',
          enum: ['A', 'C', 'E'],
          description: "Situação do processo: 'A' = Aberto, 'C' = Concluído, 'E' = Em Bloqueio. Omitir para listar todos.",
        },
        pesquisa: {
          type: 'string',
          description: 'Texto para pesquisar no número, especificação ou interessados.',
        },
        id_tipo_processo: {
          type: 'string',
          description: 'ID do tipo de processo para filtrar. Use sei_listar_tipos_processo para obter os IDs.',
        },
        pagina: {
          type: 'integer',
          description: 'Número da página (padrão: 1).',
          default: 1,
        },
        registros_por_pagina: {
          type: 'integer',
          description: 'Quantidade de registros por página (padrão: 20, máximo: 100).',
          default: 20,
        },
      },
      required: [],
    },
  },
  {
    name: 'sei_consultar_processo',
    description: 'Recupera os detalhes completos de um processo específico pelo número de protocolo (ex: 00002.123456/2024-01) ou ID interno do SEI.',
    inputSchema: {
      type: 'object',
      properties: {
        protocolo: {
          type: 'string',
          description: "Número do processo (protocolo) ou ID interno. Exemplo: '00002.123456/2024-01'.",
        },
      },
      required: ['protocolo'],
    },
  },
  {
    name: 'sei_listar_interessados',
    description: 'Lista contatos/interessados cadastrados no SEI. Útil para buscar dados de contatos por nome.',
    inputSchema: {
      type: 'object',
      properties: {
        nome: {
          type: 'string',
          description: 'Filtro parcial pelo nome do contato/interessado (busca parcial).',
        },
        id_tipo_contato: {
          type: 'string',
          description: 'ID do tipo de contato para restringir a busca (ex: pessoa física, jurídica, unidade interna).',
        },
        pagina: {
          type: 'integer',
          description: 'Número da página (padrão: 1).',
          default: 1,
        },
        registros_por_pagina: {
          type: 'integer',
          description: 'Quantidade de registros por página (padrão: 1, máximo recomendado: 100).',
          default: 1,
        },
      },
      required: [],
    },
  },
  {
    name: 'sei_criar_processo',
    description: 'Abre um novo processo no SEI na unidade configurada. O campo interessados é opcional — pode ser omitido para abrir o processo sem interessados.',,
    inputSchema: {
      type: 'object',
      properties: {
        id_tipo_processo: {
          type: 'string',
          description: "ID do tipo de processo. Use sei_listar_tipos_processo para obter os IDs.",
        },
        especificacao: {
          type: 'string',
          description: 'Especificação ou assunto do processo (descrição resumida).',
        },
        nivel_acesso: {
          type: 'string',
          enum: ['0', '1', '2'],
          description: "Nível de acesso: '0' = Público, '1' = Restrito, '2' = Sigiloso. Padrão: '0'.",
          default: '0',
        },
        hipotese_legal: {
          type: 'string',
          description: 'Hipótese legal aplicável (obrigatória quando nível de acesso for 1 ou 2).',
        },
        observacoes: {
          type: 'string',
          description: 'Observações internas sobre o processo.',
        },
        interessados: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id:    { type: 'string', description: 'IdContato do interessado (obtido via sei_listar_interessados). Obrigatório para validação no SEI.' },
              nome:  { type: 'string', description: 'Nome do interessado (obtido via sei_listar_interessados).' },
              sigla: { type: 'string', description: 'Sigla da unidade interessada (obtida via sei_listar_interessados).' },
            },
            required: ['id', 'nome'],
          },
          description: 'Lista de interessados no processo. Opcional — se omitido ou vazio, o processo é aberto sem interessados. Quando informar, use os dados retornados por sei_listar_interessados (nome e sigla).',
        },
      },
      required: ['id_tipo_processo', 'especificacao'],
    },
  },
  {
    name: 'sei_listar_documentos_processo',
    description: 'Lista todos os documentos incluídos em um processo do SEI.',
    inputSchema: {
      type: 'object',
      properties: {
        protocolo: {
          type: 'string',
          description: "Número do processo ou ID interno.",
        },
      },
      required: ['protocolo'],
    },
  },
  {
    name: 'sei_consultar_documento',
    description: 'Retorna os metadados de um documento específico no SEI (tipo, data, assinaturas, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        id_documento: {
          type: 'string',
          description: 'ID interno do documento no SEI.',
        },
      },
      required: ['id_documento'],
    },
  },
  {
    name: 'sei_conteudo_documento',
    description: 'Recupera o conteúdo textual (HTML/texto) de um documento gerado no SEI.',
    inputSchema: {
      type: 'object',
      properties: {
        id_documento: {
          type: 'string',
          description: 'ID interno do documento no SEI.',
        },
      },
      required: ['id_documento'],
    },
  },
  {
    name: 'sei_incluir_documento',
    description: 'Inclui um documento externo (PDF, DOCX, etc.) em um processo já existente no SEI. O conteúdo do arquivo deve ser fornecido em Base64.',
    inputSchema: {
      type: 'object',
      properties: {
        protocolo: {
          type: 'string',
          description: 'Número do processo ou ID interno onde o documento será incluído.',
        },
        id_tipo_documento: {
          type: 'string',
          description: "ID do tipo de documento. Use sei_listar_tipos_documento para obter os IDs.",
        },
        nome: {
          type: 'string',
          description: 'Nome do arquivo do documento (ex: "contrato.pdf").',
        },
        data: {
          type: 'string',
          description: 'Data do documento no formato DD/MM/AAAA.',
        },
        nivel_acesso: {
          type: 'string',
          enum: ['0', '1', '2'],
          description: "Nível de acesso: '0' = Público, '1' = Restrito, '2' = Sigiloso. Padrão: '0'.",
          default: '0',
        },
        conteudo_base64: {
          type: 'string',
          description: 'Conteúdo do arquivo codificado em Base64.',
        },
        descricao: {
          type: 'string',
          description: 'Descrição adicional sobre o documento.',
        },
        remetente: {
          type: 'string',
          description: 'Nome do remetente do documento externo.',
        },
      },
      required: ['protocolo', 'id_tipo_documento', 'nome', 'data', 'conteudo_base64'],
    },
  },
];

// Handler para listar ferramentas
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// Handler para executar ferramentas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await executeToolCall(name, args || {});
});

// Habilita transporte STDIO
const ENABLE_STDIO = (process.env.ENABLE_STDIO || 'true').toLowerCase() !== 'false';
if (ENABLE_STDIO) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP SEI] STDIO transport enabled');
}

// ---------------------------------------------------------------------------
// Execução das ferramentas
// ---------------------------------------------------------------------------
async function executeToolCall(name, args) {
  try {
    switch (name) {

      case 'sei_status_configuracao': {
        const cfg = statusConfiguracao();
        const linhas = [
          `SEI URL:    ${cfg.sei_url}`,
          `Unidade:    ${cfg.sei_unidade}`,
          `Token:      ${cfg.sei_token}`,
          `Configurado: ${cfg.configurado ? '✅ Sim' : '❌ Não — defina SEI_URL, SEI_TOKEN e SEI_UNIDADE'}`,
        ];
        return { content: [{ type: 'text', text: linhas.join('\n') }] };
      }

      case 'sei_listar_unidades': {
        const resultado = await listarUnidades();
        return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
      }

      case 'sei_listar_tipos_processo': {
        const resultado = await listarTiposProcesso();
        return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
      }

      case 'sei_listar_tipos_documento': {
        const resultado = await listarTiposDocumento();
        return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
      }

      case 'sei_listar_processos': {
        const { situacao, pesquisa, id_tipo_processo, pagina, registros_por_pagina } = args;
        const resultado = await listarProcessos({ situacao, pesquisa, id_tipo_processo, pagina, registros_por_pagina });
        if (!resultado || (Array.isArray(resultado) && resultado.length === 0)) {
          return { content: [{ type: 'text', text: 'Nenhum processo encontrado com os filtros informados.' }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
      }

      case 'sei_consultar_processo': {
        const { protocolo } = args;
        if (!protocolo) throw new Error("O parâmetro 'protocolo' é obrigatório.");
        const resultado = await consultarProcesso(protocolo);
        return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
      }

      case 'sei_listar_interessados': {
        const { nome, id_tipo_contato, pagina, registros_por_pagina } = args;
        const resultado = (await listarInteressados({ nome, id_tipo_contato, pagina, registros_por_pagina: registros_por_pagina ?? 1 })).slice(0, 1);
        if (!resultado || resultado.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'Nenhum interessado encontrado com os filtros informados. Tente buscar pelo nome completo ou parcial do solicitante (pessoa física/jurídica), não pelo assunto do processo. Por exemplo, use o nome do funcionário ou da unidade responsável.',
            }],
          };
        }
        const resumo = resultado.map(c =>
          `• ${c.nome}${c.sigla ? ` (${c.sigla})` : ''}  [id: ${c.id}]`
        ).join('\n');
        return {
          content: [{
            type: 'text',
            text: `Interessados encontrados (${resultado.length}):\n\n${resumo}\n\nDados completos:\n${JSON.stringify(resultado, null, 2)}`,
          }],
        };
      }

      case 'sei_criar_processo': {
        const { id_tipo_processo, especificacao, nivel_acesso, hipotese_legal, observacoes, interessados } = args;
        if (!id_tipo_processo) throw new Error("O parâmetro 'id_tipo_processo' é obrigatório.");
        if (!especificacao)    throw new Error("O parâmetro 'especificacao' é obrigatório.");
        const interessadosEfetivos = (Array.isArray(interessados) && interessados.length > 0)
          ? interessados
          : [];
        if ((nivel_acesso === '1' || nivel_acesso === '2') && !hipotese_legal) {
          throw new Error("O parâmetro 'hipotese_legal' é obrigatório para processos com acesso restrito ou sigiloso.");
        }
        const resultado = await criarProcesso({ id_tipo_processo, especificacao, nivel_acesso, hipotese_legal, observacoes, interessados: interessadosEfetivos });
        return {
          content: [{ type: 'text', text: `Processo criado com sucesso!\n${JSON.stringify(resultado, null, 2)}` }],
        };
      }

      case 'sei_listar_documentos_processo': {
        const { protocolo } = args;
        if (!protocolo) throw new Error("O parâmetro 'protocolo' é obrigatório.");
        const resultado = await listarDocumentosProcesso(protocolo);
        if (!resultado || (Array.isArray(resultado) && resultado.length === 0)) {
          return { content: [{ type: 'text', text: `Nenhum documento encontrado no processo ${protocolo}.` }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
      }

      case 'sei_consultar_documento': {
        const { id_documento } = args;
        if (!id_documento) throw new Error("O parâmetro 'id_documento' é obrigatório.");
        const resultado = await consultarDocumento(id_documento);
        return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
      }

      case 'sei_conteudo_documento': {
        const { id_documento } = args;
        if (!id_documento) throw new Error("O parâmetro 'id_documento' é obrigatório.");
        const resultado = await conteudoDocumento(id_documento);
        const texto = typeof resultado === 'string'
          ? resultado
          : JSON.stringify(resultado, null, 2);
        return { content: [{ type: 'text', text: texto }] };
      }

      case 'sei_incluir_documento': {
        const { protocolo, id_tipo_documento, nome, data, nivel_acesso, conteudo_base64, descricao, remetente } = args;
        if (!protocolo)         throw new Error("O parâmetro 'protocolo' é obrigatório.");
        if (!id_tipo_documento) throw new Error("O parâmetro 'id_tipo_documento' é obrigatório.");
        if (!nome)              throw new Error("O parâmetro 'nome' é obrigatório.");
        if (!data)              throw new Error("O parâmetro 'data' é obrigatório (DD/MM/AAAA).");
        if (!conteudo_base64)   throw new Error("O parâmetro 'conteudo_base64' é obrigatório.");
        const resultado = await incluirDocumento(protocolo, { id_tipo_documento, nome, data, nivel_acesso, conteudo_base64, descricao, remetente });
        return {
          content: [{ type: 'text', text: `Documento incluído com sucesso!\n${JSON.stringify(resultado, null, 2)}` }],
        };
      }

      default:
        return { content: [{ type: 'text', text: `Ferramenta não encontrada: ${name}` }], isError: true };
    }
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Erro ao executar '${name}': ${e?.message || 'Erro desconhecido'}` }],
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Utilitários HTTP
// ---------------------------------------------------------------------------
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

function getToolsList() {
  return {
    tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  };
}

// ---------------------------------------------------------------------------
// HTTP Server (MCP + Express)
// ---------------------------------------------------------------------------
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
      return sendJson(res, 200, { status: 'ok', service: 'mcp-server-sei' });
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
              serverInfo: { name: 'mcp-server-sei', version: '1.0.0' },
              instructions: `Servidor MCP para integração com o SEI (Sistema Eletrônico de Informações). 
Permite listar, criar e consultar processos e documentos.
Configuração atual: ${JSON.stringify(statusConfiguracao())}`,
            },
          };
        } else if (request.method === 'notifications/initialized') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
          return res.end();
        } else if (request.method?.startsWith('notifications/')) {
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
        return sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: e?.message } });
      }
    }

    // SSE endpoint
    if (req.method === 'GET' && (pathname === '/mcp/sse' || pathname === '/sse')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      const sse = new SSEServerTransport('/mcp/messages', res);
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
        res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
        return res.end('Unknown session');
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-protocol-version, mcp-session-id');
      return sse.handlePostMessage(req, res);
    }

    // Demais rotas → Express (Web UI + /api)
    return app(req, res);
  } catch (e) {
    console.error('[MCP SEI] Erro interno:', e);
    return sendJson(res, 500, { error: 'Erro interno do servidor' });
  }
});

httpServer.listen(HTTP_PORT, () => {
  console.error(`[MCP SEI] Servidor iniciado na porta :${HTTP_PORT}`);
  console.error(`[MCP SEI] Web UI: http://localhost:${HTTP_PORT}`);
  console.error(`[MCP SEI] Endpoints MCP:`);
  console.error(`[MCP SEI]   POST http://localhost:${HTTP_PORT}/mcp         (JSON-RPC)`);
  console.error(`[MCP SEI]   GET  http://localhost:${HTTP_PORT}/mcp/sse     (SSE transport)`);
  console.error(`[MCP SEI]   POST http://localhost:${HTTP_PORT}/mcp/messages (SSE messages)`);
  console.error(`[MCP SEI]   GET  http://localhost:${HTTP_PORT}/healthz      (Health check)`);
  const cfg = statusConfiguracao();
  if (!cfg.configurado) {
    console.error('[MCP SEI] ⚠️  ATENÇÃO: SEI_URL, SEI_TOKEN e/ou SEI_UNIDADE não configurados!');
  } else {
    console.error(`[MCP SEI] ✅ Conectado ao SEI: ${cfg.sei_url} (unidade ${cfg.sei_unidade})`);
  }
});
