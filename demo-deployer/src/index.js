// ============================================================
// demo-deployer/src/index.js — Entry point: Express + WS + MCP
// ============================================================

import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

import {
  getState,
  getConfig,
  setConfig,
  deployComponent,
  deployAll,
  refreshStatus,
  cleanup,
  getComponentState,
  getJob,
  addWsListener,
  removeWsListener,
} from "./deploy-manager.js";
import { COMPONENTS, CATEGORIES } from "./config.js";
import { setupMcpSseEndpoints, startStdioTransport } from "./mcp-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Se invocado com --stdio, iniciar apenas MCP via STDIO
if (process.argv.includes("--stdio")) {
  startStdioTransport();
} else {
  const app = express();
  const server = http.createServer(app);
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  // ---- REST API ----

  // Configuração
  app.get("/api/config", (req, res) => res.json(getConfig()));
  app.post("/api/config", (req, res) => res.json(setConfig(req.body)));

  // Estado geral
  app.get("/api/state", (req, res) => res.json(getState()));

  // Componentes
  app.get("/api/components", (req, res) =>
    res.json({ components: COMPONENTS, categories: CATEGORIES })
  );

  app.get("/api/components/:id", (req, res) => {
    const state = getComponentState(req.params.id);
    const def = COMPONENTS.find((c) => c.id === req.params.id);
    if (!def) return res.status(404).json({ error: "Componente não encontrado" });
    res.json({ definition: def, state });
  });

  // Deploy
  app.post("/api/deploy/:id", async (req, res) => {
    try {
      const result = await deployComponent(req.params.id);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/deploy-all", async (req, res) => {
    try {
      // Inicia em background
      deployAll().catch((e) => console.error("deploy-all error:", e));
      res.json({ message: "Deploy completo iniciado" });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Status do cluster
  app.post("/api/refresh", async (req, res) => {
    const result = await refreshStatus();
    res.json(result);
  });

  // Cleanup
  app.post("/api/cleanup", async (req, res) => {
    try {
      const result = await cleanup();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Job status
  app.get("/api/jobs/:id", (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job não encontrado" });
    res.json(job);
  });

  // ---- MCP SSE Endpoints ----
  setupMcpSseEndpoints(app);

  // ---- WebSocket para real-time updates ----
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    console.log("[WS] Novo cliente conectado");

    // Envia estado atual
    ws.send(JSON.stringify({ type: "init", data: getState() }));

    const listener = (event) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(event));
      }
    };

    addWsListener(listener);

    ws.on("close", () => {
      removeWsListener(listener);
      console.log("[WS] Cliente desconectado");
    });
  });

  // ---- Health endpoints ----
  app.get("/healthz", (req, res) => res.json({ status: "ok" }));
  app.get("/live", (req, res) => res.json({ status: "ok" }));

  // ---- Start ----
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║           🚀 Demo Deployer — BBDW 2025                  ║
║──────────────────────────────────────────────────────────║
║  Dashboard:  http://localhost:${PORT}                      ║
║  API:        http://localhost:${PORT}/api                   ║
║  MCP (SSE):  http://localhost:${PORT}/mcp/sse               ║
║  WebSocket:  ws://localhost:${PORT}/ws                      ║
╚══════════════════════════════════════════════════════════╝
    `);
  });
}
