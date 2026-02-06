// ============================================================
// demo-deployer/src/mcp-server.js — MCP Server para o Demo Deployer
// ============================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getState,
  getConfig,
  setConfig,
  deployComponent,
  deployAll,
  refreshStatus,
  cleanup,
  getComponentState,
} from "./deploy-manager.js";
import { COMPONENTS } from "./config.js";

// ---- Definição das tools ----

const tools = [
  {
    name: "configure",
    description:
      "Configura o endereço da API do OpenShift/Kubernetes e o token de autenticação para os deploys. " +
      "Parâmetros: ocp_api_url (URL da API, ex: https://api.cluster.example.com:6443), " +
      "ocp_token (token Bearer), namespace (opcional, default: bbdw-demo), " +
      "git_repo_url (URL do repositório Git com os fontes da demo).",
    inputSchema: {
      type: "object",
      properties: {
        ocp_api_url: { type: "string", description: "URL da API do OpenShift" },
        ocp_token: { type: "string", description: "Token de autenticação" },
        namespace: { type: "string", description: "Namespace/Projeto (default: bbdw-demo)" },
        git_repo_url: { type: "string", description: "URL do repositório Git" },
      },
      required: ["ocp_api_url", "ocp_token"],
    },
  },
  {
    name: "get_status",
    description:
      "Retorna o estado atual de todos os componentes da demo: quais estão deployados, " +
      "suas rotas, status e última atualização.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_components",
    description:
      "Lista todos os componentes disponíveis para deploy na demo BBDW 2025, " +
      "com nome, descrição, categoria e ordem de deploy.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "deploy_component",
    description:
      "Faz o deploy de um componente específico da demo no OpenShift. " +
      "Usa Ansible para criar os recursos necessários (BuildConfig, Deployment, Service, Route). " +
      "Componentes disponíveis: namespace, redis, rbac, mcp-server-k8s-live, " +
      "mcp-server-k8s-security, mcp-server-downdetector, mcp-server-saude, " +
      "mcp-server-matriculas, imagem-crash, agent-ai.",
    inputSchema: {
      type: "object",
      properties: {
        component_id: {
          type: "string",
          description: "ID do componente para deploy",
          enum: COMPONENTS.map((c) => c.id),
        },
      },
      required: ["component_id"],
    },
  },
  {
    name: "deploy_all",
    description:
      "Faz o deploy completo de todos os componentes da demo na ordem correta: " +
      "namespace → Redis → RBAC → MCP Servers → Imagem Crash → Agent AI. " +
      "Para se um componente obrigatório falhar.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_component_details",
    description:
      "Retorna detalhes de um componente específico: status, rota, logs do deploy e erros.",
    inputSchema: {
      type: "object",
      properties: {
        component_id: {
          type: "string",
          description: "ID do componente",
          enum: COMPONENTS.map((c) => c.id),
        },
      },
      required: ["component_id"],
    },
  },
  {
    name: "refresh_cluster_status",
    description:
      "Consulta o cluster OpenShift/Kubernetes para atualizar o status real de todos os " +
      "componentes (pods, services, routes, deployments).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "cleanup",
    description:
      "Remove todos os recursos deployados no namespace da demo. " +
      "ATENÇÃO: esta ação é destrutiva e remove tudo.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ---- Handlers ----

async function handleToolCall(name, args) {
  switch (name) {
    case "configure":
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              setConfig({
                ocpApiUrl: args.ocp_api_url,
                ocpToken: args.ocp_token,
                namespace: args.namespace || "bbdw-demo",
                gitRepoUrl: args.git_repo_url || getConfig().gitRepoUrl,
              }),
              null,
              2
            ),
          },
        ],
      };

    case "get_status":
      return {
        content: [{ type: "text", text: JSON.stringify(getState(), null, 2) }],
      };

    case "list_components":
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              COMPONENTS.map((c) => ({
                id: c.id,
                name: c.name,
                description: c.description,
                category: c.category,
                order: c.order,
              })),
              null,
              2
            ),
          },
        ],
      };

    case "deploy_component": {
      const result = await deployComponent(args.component_id);
      return {
        content: [
          {
            type: "text",
            text: `Deploy iniciado para '${args.component_id}'. Job ID: ${result.jobId}. ` +
              `Acompanhe o progresso pelo dashboard ou via get_component_details.`,
          },
        ],
      };
    }

    case "deploy_all": {
      // Executar em background e retornar imediato
      deployAll().catch((e) => console.error("deploy_all error:", e));
      return {
        content: [
          {
            type: "text",
            text: "Deploy completo de todos os componentes iniciado. " +
              "Use get_status para acompanhar o progresso.",
          },
        ],
      };
    }

    case "get_component_details": {
      const state = getComponentState(args.component_id);
      const def = COMPONENTS.find((c) => c.id === args.component_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ definition: def, state }, null, 2),
          },
        ],
      };
    }

    case "refresh_cluster_status": {
      const result = await refreshStatus();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "cleanup": {
      const result = await cleanup();
      return {
        content: [
          {
            type: "text",
            text: result.success
              ? "Cleanup concluído. Todos os recursos foram removidos."
              : `Cleanup falhou: ${result.output}`,
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Tool desconhecida: ${name}` }],
        isError: true,
      };
  }
}

// ---- Setup do MCP Server ----

export function createMcpServer() {
  const server = new Server(
    { name: "demo-deployer", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, args || {});
  });

  return server;
}

// ---- Transportes SSE para Express ----

const sseTransports = {};

export function setupMcpSseEndpoints(app) {
  // Endpoint SSE
  app.get("/mcp/sse", async (req, res) => {
    const transport = new SSEServerTransport("/mcp/messages", res);
    sseTransports[transport.sessionId] = transport;
    const server = createMcpServer();

    res.on("close", () => {
      delete sseTransports[transport.sessionId];
    });

    await server.connect(transport);
  });

  // Endpoint para receber mensagens JSON-RPC
  app.post("/mcp/messages", async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = sseTransports[sessionId];
    if (!transport) {
      return res.status(404).json({ error: "Session not found" });
    }
    await transport.handlePostMessage(req, res);
  });
}

// ---- Transporte STDIO (para uso via CLI) ----

export async function startStdioTransport() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] Rodando em modo STDIO");
}
