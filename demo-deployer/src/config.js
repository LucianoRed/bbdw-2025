// ============================================================
// demo-deployer/src/config.js — Configuração dos componentes
// ============================================================

export const COMPONENTS = [
  {
    id: "mcp-server-k8s-live",
    name: "MCP Server K8s Live",
    description: "Métricas, pods, deployments, eventos, VPA, bin packing do cluster",
    icon: "📊",
    category: "mcp",
    order: 0,
    namespace: "mcp-server-k8s-live",
    playbook: "deploy-component.yml",
    contextDir: "mcp-server-k8s-live",
    port: 3000,
    envVars: [
      { key: "K8S_API_URL", value: "{{ocp_api_url}}" },
      { key: "K8S_BEARER_TOKEN", value: "{{sa_token}}" },
      { key: "K8S_SKIP_TLS_VERIFY", value: "true" },
    ],
  },
  {
    id: "mcp-server-k8s-security",
    name: "MCP Server K8s Security",
    description: "NetworkPolicies, logs de segurança, namespaces",
    icon: "🛡️",
    category: "mcp",
    order: 1,
    namespace: "mcp-server-k8s-security",
    playbook: "deploy-component.yml",
    contextDir: "mcp-server-k8s-security",
    port: 3000,
    envVars: [
      { key: "K8S_API_URL", value: "{{ocp_api_url}}" },
      { key: "K8S_BEARER_TOKEN", value: "{{sa_token}}" },
      { key: "K8S_SKIP_TLS_VERIFY", value: "true" },
    ],
  },
  {
    id: "mcp-server-downdetector",
    name: "MCP Server Downdetector",
    description: "Verificação de status de websites (uptime/downtime)",
    icon: "🌐",
    category: "mcp",
    order: 2,
    namespace: "mcp-server-downdetector",
    playbook: "deploy-component.yml",
    contextDir: "mcp-server-downdetector",
    port: 3000,
  },
  {
    id: "mcp-server-saude",
    name: "MCP Server Saúde",
    description: "Dados de saúde escolar dos alunos",
    icon: "🏥",
    category: "mcp",
    order: 3,
    namespace: "mcp-server-saude",
    playbook: "deploy-component.yml",
    contextDir: "mcp-server-saude",
    port: 3001,
  },
  {
    id: "mcp-server-matriculas",
    name: "MCP Server Matrículas",
    description: "Dados de matrículas de alunos",
    icon: "🎓",
    category: "mcp",
    order: 4,
    namespace: "mcp-server-matriculas",
    playbook: "deploy-component.yml",
    contextDir: "mcp-server-matriculas",
    port: 3000,
  },
  {
    id: "imagem-crash",
    name: "Imagem Crash (Demo)",
    description: "Container que entra em CrashLoopBackOff para demonstração",
    icon: "💥",
    category: "demo",
    order: 5,
    namespace: "imagem-crash",
    playbook: "deploy-component.yml",
    contextDir: "imagem-crash",
    port: 8080,
  },
  {
    id: "agent-ai",
    name: "Agent AI (Chatbot)",
    description: "Chatbot Quarkus + LangChain4j com Redis, RBAC e orquestrador principal",
    icon: "🤖",
    category: "core",
    order: 6,
    namespace: "agent-ai",
    playbook: "deploy-component.yml",
    contextDir: "agent-ai",
    port: 8080,
    routeTimeout: true,
    envVars: [
      { key: "REDIS_URL", value: "redis://redis:6379" },
      { key: "K8S_API_URL", value: "{{ocp_api_url}}" },
      { key: "K8S_BEARER_TOKEN", value: "{{sa_token}}" },
      { key: "K8S_SKIP_TLS_VERIFY", value: "true" },
      { key: "OPENAI_API_KEY", value: "{{openai_api_key}}" },
    ],
    subSteps: [
      { id: "redis", name: "Redis", playbook: "deploy-redis.yml" },
      { id: "rbac", name: "RBAC / ServiceAccount", playbook: "setup-rbac.yml", extraVars: { sa_name: "mcp-sa" } },
      { id: "agent-ai-app", name: "Agent AI App", playbook: "deploy-component.yml", contextDir: "agent-ai" },
    ],
  },
  {
    id: "mcp-inspector",
    name: "MCP Inspector",
    description: "Interface gráfica para testar e depurar servidores MCP",
    icon: "🔍",
    category: "infra",
    order: 7,
    namespace: "mcp-inspector",
    playbook: "deploy-component.yml",
    contextDir: "mcp-inspector",
    port: 6274,
  },
];

export const CATEGORIES = {
  infra: { label: "Infraestrutura", color: "#2196F3" },
  mcp: { label: "MCP Servers", color: "#9C27B0" },
  demo: { label: "Demo", color: "#FF9800" },
  core: { label: "Core", color: "#4CAF50" },
};

// ============================================================
// Ofertas — pacotes pré-definidos de componentes para demos
// ============================================================

export const OFERTAS = [
  {
    id: "demo-governo",
    name: "Demo para Governo",
    description: "Demonstração completa para o setor público: agente de IA com acesso a dados de saúde e matrículas escolares.",
    icon: "🏛️",
    color: "#1976D2",
    // Componentes que fazem parte desta oferta (devem existir em COMPONENTS)
    componentIds: ["agent-ai", "mcp-inspector", "mcp-server-matriculas", "mcp-server-saude"],
    // Nodos na topologia (centro + satélites)
    topology: {
      center: { label: "Governo", icon: "🏛️", color: "#1976D2" },
      nodes: [
        { componentId: "agent-ai",              label: "Agent AI",    icon: "🤖", color: "#4CAF50" },
        { componentId: "mcp-inspector",         label: "MCP Inspector", icon: "🔍", color: "#FF9800" },
        { componentId: "mcp-server-matriculas", label: "Matrículas",  icon: "🎓", color: "#9C27B0" },
        { componentId: "mcp-server-saude",      label: "Saúde",       icon: "🏥", color: "#E91E63" },
      ],
    },
  },
];
