import { Server }              from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport }   from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import http     from "http";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join }  from "path";

import { criarSessao, getConfig } from "./chatkit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT      = parseInt(process.env.PORT || "3000");
const TRANSPORT = process.env.MCP_TRANSPORT || "stdio"; // "stdio" | "sse"

// ---------------------------------------------------------------------------
// Ferramentas MCP
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: "sei_criar_sessao",
    description:
      "Cria uma sessão ChatKit no workflow do Agente SEI hospedado na OpenAI (AgentBuilder). " +
      "Retorna o client_secret que o widget ChatKit JS do browser usa para abrir uma conversa " +
      "diretamente com o workflow. Passe o valor ao frontend — não o armazene nem o reuse.",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description:
            "Identificador único do usuário (ex: email, UUID). " +
            "Use um valor consistente para o mesmo usuário.",
        },
      },
      required: ["user_id"],
    },
  },
  {
    name: "sei_status_config",
    description:
      "Retorna a configuração atual do servidor: workflow ID e status da API key. Útil para diagnóstico.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new Server(
  { name: "mcp-server-sei-agent", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "sei_criar_sessao") {
      const clientSecret = await criarSessao(args.user_id);
      return {
        content: [{ type: "text", text: JSON.stringify({ client_secret: clientSecret }, null, 2) }],
      };
    }

    if (name === "sei_status_config") {
      return {
        content: [{ type: "text", text: JSON.stringify(getConfig(), null, 2) }],
      };
    }

    throw new Error(`Tool desconhecida: ${name}`);
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: `Erro: ${err.message}` }] };
  }
});

// ---------------------------------------------------------------------------
// HTTP Server  (chat UI  +  session token endpoint  +  SSE transport)
// ---------------------------------------------------------------------------
const sseTransports = new Map();

function handleHttp(req, res) {
  // ── POST /api/chatkit/session  ──────────────────────────────────────────
  if (req.method === "POST" && req.url === "/api/chatkit/session") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { user_id } = JSON.parse(body || "{}");
        const userId = (user_id && String(user_id).trim()) || `anon-${Date.now()}`;
        const clientSecret = await criarSessao(userId);
        res.writeHead(200, {
          "Content-Type":                "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ client_secret: clientSecret }));
      } catch (err) {
        console.error("[http] /api/chatkit/session erro:", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── GET /health  ────────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", ...getConfig() }));
    return;
  }

  // ── SSE transport  ──────────────────────────────────────────────────────
  if (TRANSPORT === "sse") {
    if (req.method === "GET" && req.url === "/sse") {
      const transport = new SSEServerTransport("/message", res);
      sseTransports.set(res, transport);
      res.on("close", () => sseTransports.delete(res));
      server.connect(transport);
      return;
    }
    if (req.method === "POST" && req.url === "/message") {
      const transport = [...sseTransports.values()][0];
      if (transport) {
        transport.handlePostMessage(req, res);
      } else {
        res.writeHead(400);
        res.end("No active SSE session");
      }
      return;
    }
  }

  // ── GET /  (Chat UI)  ───────────────────────────────────────────────────
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    try {
      const html = readFileSync(join(__dirname, "public", "index.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end("Erro ao carregar a UI");
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function main() {
  const httpServer = http.createServer(handleHttp);

  httpServer.listen(PORT, () => {
    const cfg = getConfig();
    console.error(`[sei-agent] HTTP na porta ${PORT}`);
    console.error(`[sei-agent] Chat UI:      http://localhost:${PORT}/`);
    console.error(`[sei-agent] Session API:  POST http://localhost:${PORT}/api/chatkit/session`);
    console.error(`[sei-agent] Workflow ID:  ${cfg.workflow_id || "NÃO CONFIGURADO"}`);
    console.error(`[sei-agent] API Key:      ${cfg.api_key_configured ? "OK" : "NÃO CONFIGURADA"}`);
  });

  if (TRANSPORT === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[sei-agent] MCP via stdio pronto");
  }
}

main().catch((err) => {
  console.error("[sei-agent] Erro fatal:", err);
  process.exit(1);
});
