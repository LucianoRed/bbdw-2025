import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import http from "http";

import { seiAgentChat, clearSession } from "./sei-agent.js";

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
];

// ---------------------------------------------------------------------------
// Servidor MCP
// ---------------------------------------------------------------------------
const server = new Server(
  { name: "mcp-server-sei-agent", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

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

    return { content: [{ type: "text", text: `Ferramenta desconhecida: ${name}` }], isError: true };
  } catch (err) {
    console.error(`[SEI-AGENT] Erro ao executar '${name}':`, err.message);
    return { content: [{ type: "text", text: `Erro: ${err.message}` }], isError: true };
  }
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
  });
  res.end(body);
}

const sseTransports = {};

const httpServer = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, mcp-protocol-version, accept");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { status: "ok", service: "mcp-server-sei-agent" });
    return;
  }

  // SSE endpoint
  if (req.method === "GET" && req.url === "/sse") {
    const transport = new SSEServerTransport("/messages", res);
    sseTransports[transport.sessionId] = transport;
    res.on("close", () => delete sseTransports[transport.sessionId]);
    await server.connect(transport);
    return;
  }

  // Messages endpoint
  if (req.method === "POST" && req.url === "/messages") {
    const sessionId = req.headers["mcp-session-id"];
    const transport = sseTransports[sessionId];
    if (!transport) {
      sendJson(res, 400, { error: "Sessão MCP não encontrada" });
      return;
    }
    await transport.handlePostMessage(req, res);
    return;
  }

  // MCP Streamable HTTP (POST /)
  if (req.method === "POST" && (req.url === "/" || req.url === "/mcp")) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body);
        if (parsed.method === "tools/list") {
          sendJson(res, 200, { jsonrpc: "2.0", id: parsed.id, result: { tools: TOOLS } });
          return;
        }
        if (parsed.method === "tools/call") {
          const toolRes = await server.handleRequest(parsed);
          sendJson(res, 200, toolRes);
          return;
        }
        sendJson(res, 400, { error: "Método não suportado" });
      } catch (e) {
        sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

httpServer.listen(PORT, () => {
  console.error(`[SEI-AGENT] HTTP/SSE transport habilitado na porta ${PORT}`);
});
