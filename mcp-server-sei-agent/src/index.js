import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import http from "http";

import { seiAgentChat, clearSession, criarSessaoChatKit, getAgentConfig } from "./sei-agent.js";

// ---------------------------------------------------------------------------
// Definição das ferramentas MCP expostas
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: "sei_agent_chat",
    description:
      "Envia uma mensagem ao Agente SEI (Sistema Eletrônico de Informações) e retorna sua resposta. " +
      "Use esta ferramenta para qualquer pergunta ou ação relacionada ao SEI: consultar processos, " +
      "documentos, unidades, tipos de processo, tramitações, assinaturas e expedientes.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Mensagem ou pergunta para o Agente SEI",
        },
        session_id: {
          type: "string",
          description:
            "ID da sessão do usuário para manter o contexto de conversa. " +
            "Use o mesmo valor entre mensagens do mesmo usuário.",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "sei_limpar_sessao",
    description:
      "Limpa o histórico de conversa de uma sessão com o Agente SEI, iniciando um novo contexto do zero.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "ID da sessão a ser limpa",
        },
      },
      required: ["session_id"],
    },
  },
  {
    name: "sei_criar_sessao",
    description:
      "Cria uma sessão ChatKit com o workflow do Agente SEI hospedado na OpenAI e retorna o client_secret. " +
      "Use este token no widget ChatKit JS do BROWSER para iniciar uma conversa direta com o workflow. " +
      "NÃO use para chamadas server-to-server — use sei_agent_chat para isso.",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "Identificador único do usuário (ex: email, UUID). Usado para vincular a sessão ao usuário.",
        },
      },
      required: ["user_id"],
    },
  },
  {
    name: "sei_status_config",
    description:
      "Retorna a configuração atual do Agente SEI: modelo, workflow ID e status da API key. Útil para diagnóstico.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ---------------------------------------------------------------------------
// Servidor MCP
// ---------------------------------------------------------------------------
const server = new Server(
  { name: "mcp-server-sei-agent", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

async function executeTool(name, args = {}) {
  try {
    if (name === "sei_agent_chat") {
      const { message, session_id = "default" } = args;
      if (!message) {
        return { content: [{ type: "text", text: "Erro: parâmetro 'message' é obrigatório." }], isError: true };
      }
      const response = await seiAgentChat(message, session_id);
      return { content: [{ type: "text", text: response }] };
    }

    if (name === "sei_limpar_sessao") {
      const { session_id } = args;
      if (!session_id) {
        return { content: [{ type: "text", text: "Erro: parâmetro 'session_id' é obrigatório." }], isError: true };
      }
      clearSession(session_id);
      return { content: [{ type: "text", text: `Sessão '${session_id}' limpa com sucesso.` }] };
    }

    if (name === "sei_criar_sessao") {
      const { user_id } = args;
      if (!user_id) {
        return { content: [{ type: "text", text: "Erro: parâmetro 'user_id' é obrigatório." }], isError: true };
      }
      const clientSecret = await criarSessaoChatKit(user_id);
      return { content: [{ type: "text", text: `client_secret: ${clientSecret}\n\nUse este token no widget ChatKit JS do browser para conversar com o workflow SEI.` }] };
    }

    if (name === "sei_status_config") {
      const config = getAgentConfig();
      const lines = [
        `**Configuração do Agente SEI**`,
        `- API Key configurada: ${config.api_key_configured ? 'Sim' : 'NÃO — OPENAI_API_KEY ausente!'}`,
        `- sei_agent_chat: Responses API, modelo \`${config.model}\``,
        `- sei_criar_sessao (ChatKit/browser): ${config.workflow_id_for_chatkit ? `workflow \`${config.workflow_id_for_chatkit}\`` : 'indisponível — defina OPENAI_SEI_WORKFLOW_ID'}`,
      ];
      return { content: [{ type: "text", text: lines.join('\n') }] };
    }

    return { content: [{ type: "text", text: `Ferramenta desconhecida: ${name}` }], isError: true };
  } catch (err) {
    console.error(`[SEI-AGENT] Erro ao executar '${name}':`, err.message);
    return { content: [{ type: "text", text: `Erro: ${err.message}` }], isError: true };
  }
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  return executeTool(name, args);
});

// ---------------------------------------------------------------------------
// Transportes: STDIO + HTTP/SSE
// ---------------------------------------------------------------------------
const ENABLE_STDIO = (process.env.ENABLE_STDIO || "true").toLowerCase() !== "false";
if (ENABLE_STDIO) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[SEI-AGENT] STDIO transport habilitado");
}

const PORT = Number(process.env.PORT || 3000);

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "mcp-protocol-version, mcp-session-id",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const sseSessions = new Map();

const httpServer = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    const pathname = u.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, mcp-session-id, mcp-protocol-version, accept",
        "Access-Control-Expose-Headers": "mcp-protocol-version, mcp-session-id",
      });
      return res.end();
    }

    // Health check
    if (req.method === "GET" && (pathname === "/health" || pathname === "/healthz")) {
      return sendJson(res, 200, { status: "ok", service: "mcp-server-sei-agent" });
    }

    // MCP Streamable HTTP (POST /mcp)
    if (req.method === "POST" && pathname === "/mcp") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Expose-Headers", "mcp-protocol-version, mcp-session-id");
      try {
        const body = await readBody(req);
        const request = JSON.parse(body);
        let response;

        if (request.method === "initialize") {
          response = {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: { listChanged: true } },
              serverInfo: { name: "mcp-server-sei-agent", version: "1.0.0" },
              instructions: "Agente SEI — acesso ao Sistema Eletrônico de Informações do governo federal brasileiro.",
            },
          };
        } else if (request.method === "notifications/initialized" || (request.method && request.method.startsWith("notifications/"))) {
          res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
          return res.end();
        } else if (request.method === "ping") {
          response = { jsonrpc: "2.0", id: request.id, result: {} };
        } else if (request.method === "tools/list") {
          response = { jsonrpc: "2.0", id: request.id, result: { tools: TOOLS } };
        } else if (request.method === "tools/call") {
          const { name, arguments: args } = request.params || {};
          const toolRes = await executeTool(name, args);
          response = { jsonrpc: "2.0", id: request.id, result: toolRes };
        } else {
          response = { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } };
        }

        return sendJson(res, 200, response);
      } catch (e) {
        console.error("[SEI-AGENT] Erro ao processar request:", e);
        return sendJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error", data: e.message } });
      }
    }

    // SSE endpoint
    if (req.method === "GET" && pathname === "/mcp/sse") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Expose-Headers", "mcp-protocol-version, mcp-session-id");
      const transport = new SSEServerTransport("/mcp/messages", res);
      await transport.start();
      sseSessions.set(transport.sessionId, transport);
      transport.onclose = () => sseSessions.delete(transport.sessionId);
      return;
    }

    // SSE messages
    if (req.method === "POST" && pathname === "/mcp/messages") {
      const sessionId = u.searchParams.get("sessionId") || "";
      const transport = sseSessions.get(sessionId);
      if (!transport) {
        res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
        return res.end("Unknown session");
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      return transport.handlePostMessage(req, res);
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (e) {
    return sendJson(res, 500, { error: "Erro interno" });
  }
});

httpServer.listen(PORT, () => {
  console.error(`[SEI-AGENT] HTTP server escutando na porta ${PORT}`);
  console.error(`[SEI-AGENT] Endpoints:`);
  console.error(`[SEI-AGENT]   POST http://localhost:${PORT}/mcp  (Streamable HTTP/JSON-RPC)`);
  console.error(`[SEI-AGENT]   GET  http://localhost:${PORT}/mcp/sse  (SSE transport)`);
  console.error(`[SEI-AGENT]   POST http://localhost:${PORT}/mcp/messages  (SSE messages)`);
  console.error(`[SEI-AGENT]   GET  http://localhost:${PORT}/healthz  (Health check)`);
});
