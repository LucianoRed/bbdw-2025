import { Server }                        from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport }          from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import http            from "http";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join }  from "path";

import { criarSessao, getConfig } from "./chatkit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT      = parseInt(process.env.PORT || "3000");
const USE_STDIO = process.env.MCP_TRANSPORT === "stdio";

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
// MCP Server factory  (uma instância por sessão HTTP)
// ---------------------------------------------------------------------------
function makeMcpServer() {
  const s = new Server(
    { name: "mcp-server-sei-agent", version: "2.0.0" },
    { capabilities: { tools: {} } }
  );

  s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  s.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      if (name === "sei_criar_sessao") {
        const clientSecret = await criarSessao(args.user_id);
        return { content: [{ type: "text", text: JSON.stringify({ client_secret: clientSecret }, null, 2) }] };
      }
      if (name === "sei_status_config") {
        return { content: [{ type: "text", text: JSON.stringify(getConfig(), null, 2) }] };
      }
      throw new Error(`Tool desconhecida: ${name}`);
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: `Erro: ${err.message}` }] };
    }
  });

  return s;
}

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------
function setCORSHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "null")); }
      catch { resolve(null); }
    });
  });
}

// ---------------------------------------------------------------------------
// Sessões StreamableHTTP  (sessionId → transport)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------
async function handleHttp(req, res) {
  setCORSHeaders(res);

  // ── Preflight CORS ─────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split("?")[0];

  // ── MCP  StreamableHTTP  (/mcp) — Stateless mode ──────────────────────
  // Uma nova instância de transport + server por requisição (stateless).
  // Evita o erro "Server already initialized" em reconexões.
  if (url === "/mcp") {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — sem session tracking
    });
    const mcpServer = makeMcpServer();
    await mcpServer.connect(transport);
    const body = req.method === "POST" ? await readBody(req) : undefined;
    await transport.handleRequest(req, res, body);
    return;
  }

  // ── POST /api/chatkit/session ──────────────────────────────────────────
  if (req.method === "POST" && url === "/api/chatkit/session") {
    const body = await readBody(req);
    try {
      const userId = (body?.user_id && String(body.user_id).trim()) || `anon-${Date.now()}`;
      const clientSecret = await criarSessao(userId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ client_secret: clientSecret }));
    } catch (err) {
      console.error("[http] /api/chatkit/session erro:", err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── GET /health ────────────────────────────────────────────────────────
  if (req.method === "GET" && url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", ...getConfig() }));
    return;
  }

  // ── GET /  (Chat UI) ──────────────────────────────────────────────────
  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
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
  const httpServer = http.createServer((req, res) => {
    handleHttp(req, res).catch((err) => {
      console.error("[http] Erro não tratado:", err);
      if (!res.headersSent) { res.writeHead(500); res.end("Internal server error"); }
    });
  });

  httpServer.listen(PORT, () => {
    const cfg = getConfig();
    console.error(`[sei-agent] HTTP na porta ${PORT}`);
    console.error(`[sei-agent] Chat UI:     http://localhost:${PORT}/`);
    console.error(`[sei-agent] Session API: POST http://localhost:${PORT}/api/chatkit/session`);
    console.error(`[sei-agent] MCP HTTP:    http://localhost:${PORT}/mcp`);
    console.error(`[sei-agent] Workflow ID: ${cfg.workflow_id || "NÃO CONFIGURADO"}`);
    console.error(`[sei-agent] API Key:     ${cfg.api_key_configured ? "OK" : "NÃO CONFIGURADA"}`);
  });

  if (USE_STDIO) {
    const transport = new StdioServerTransport();
    await makeMcpServer().connect(transport);
    console.error("[sei-agent] MCP via stdio pronto");
  }
}

main().catch((err) => {
  console.error("[sei-agent] Erro fatal:", err);
  process.exit(1);
});
