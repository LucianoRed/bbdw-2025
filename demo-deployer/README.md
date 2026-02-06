# Demo Deployer — BBDW 2025

Aplicação web para deploy automatizado de todos os componentes da demo BBDW 2025 no OpenShift, com automação via **Ansible** e integração **MCP Server**.

## Funcionalidades

- **Dashboard Web** — Interface para gerenciar deploys com um clique
- **Ansible Automation** — Playbooks para deploy de cada componente
- **MCP Server** — Tools acessíveis via MCP (SSE/STDIO) para IA
- **Real-time** — WebSocket para acompanhar logs e status em tempo real
- **Batch Deploy** — Deploy de todos os componentes em ordem com 1 clique

## Arquitetura

```
┌──────────────────────────────────────────────┐
│              demo-deployer                    │
│  ┌────────────┐  ┌───────────┐  ┌─────────┐ │
│  │  Express    │  │ MCP Server│  │ Ansible │ │
│  │  REST API   │──│ SSE/STDIO │──│Playbooks│ │
│  │  WebSocket  │  │ 8 tools   │  │ 6 roles │ │
│  └─────┬──────┘  └───────────┘  └────┬────┘ │
│        │  Dashboard (HTML/JS)        │      │
│        │  Porta 3000                 │      │
└────────┼─────────────────────────────┼──────┘
         │                             │
         ▼                             ▼
    Navegador                    OpenShift API
                                     (oc CLI)
```

## Componentes Deployáveis

| # | Componente | Categoria | Descrição |
|---|-----------|-----------|-----------|
| 0 | Namespace | infra | Cria projeto no OpenShift |
| 1 | Redis | infra | Cache e vector store para RAG |
| 2 | RBAC | infra | ServiceAccount + permissões para MCP servers |
| 3 | MCP K8s Live | mcp | Métricas, pods, eventos do cluster |
| 4 | MCP K8s Security | mcp | NetworkPolicies, logs de segurança |
| 5 | MCP Downdetector | mcp | Status de websites |
| 6 | MCP Saúde | mcp | Dados de saúde escolar |
| 7 | MCP Matrículas | mcp | Dados de matrículas |
| 8 | Imagem Crash | demo | Container CrashLoopBackOff (demo) |
| 9 | Agent AI | core | Chatbot Quarkus + LangChain4j |

## Como Usar

### Rodando localmente

```bash
cd demo-deployer
npm install
npm start
# Acesse http://localhost:3000
```

### Rodando como container

```bash
# Build
podman build -t demo-deployer .

# Run
podman run -p 3000:3000 \
  -e PORT=3000 \
  demo-deployer
```

### No OpenShift

```bash
oc new-app --name=demo-deployer \
  --strategy=docker \
  --context-dir=demo-deployer \
  https://github.com/SEU_USUARIO/bbdw-2025.git

oc expose svc/demo-deployer
```

## Configuração

Pela interface web, configure:

1. **OpenShift API URL** — `https://api.cluster.example.com:6443`
2. **Token** — Token de autenticação (`oc whoami -t`)
3. **Namespace** — Projeto onde os componentes serão deployados (default: `bbdw-demo`)
4. **Git Repo URL** — URL do repositório com os fontes

## MCP Server

O demo-deployer expõe um MCP server com 8 tools:

| Tool | Descrição |
|------|-----------|
| `configure` | Configura API URL, token, namespace e git URL |
| `get_status` | Estado de todos os componentes |
| `list_components` | Lista componentes disponíveis |
| `deploy_component` | Deploy de um componente específico |
| `deploy_all` | Deploy completo de todos |
| `get_component_details` | Detalhes de um componente |
| `refresh_cluster_status` | Consulta status real no cluster |
| `cleanup` | Remove todos os recursos |

### Conectando via MCP

**SSE (HTTP):**
```
URL: http://localhost:3000/mcp/sse
```

**STDIO (CLI):**
```bash
node src/index.js --stdio
```

**No agent-ai (Quarkus):** Cadastre como MCP server no dashboard dinâmico.

## API REST

```
GET  /api/state              — Estado completo
GET  /api/config             — Configuração atual
POST /api/config             — Salvar configuração
GET  /api/components         — Lista de componentes
GET  /api/components/:id     — Detalhes de um componente
POST /api/deploy/:id         — Deploy de um componente
POST /api/deploy-all         — Deploy de todos
POST /api/refresh            — Atualizar status do cluster
POST /api/cleanup            — Limpar namespace
GET  /api/jobs/:id           — Status de um job
```

## Estrutura

```
demo-deployer/
├── Dockerfile                  # Node.js + Ansible + oc CLI
├── package.json
├── README.md
├── src/
│   ├── index.js               # Express + WebSocket + MCP
│   ├── config.js              # Definição dos componentes
│   ├── deploy-manager.js      # Gerencia estado e deploys
│   ├── ansible-runner.js      # Executa playbooks Ansible
│   ├── mcp-server.js          # MCP Server (SSE + STDIO)
│   └── public/
│       └── index.html         # Dashboard web
└── ansible/
    ├── inventory
    ├── deploy-component.yml   # Deploy genérico
    ├── deploy-redis.yml       # Deploy Redis
    ├── deploy-all.yml         # Deploy completo
    ├── setup-rbac.yml         # RBAC para MCP servers
    ├── get-status.yml         # Status do cluster
    ├── cleanup.yml            # Limpeza do namespace
    └── roles/
        ├── common/            # Login + namespace
        ├── deploy-app/        # Deploy via oc new-app
        ├── deploy-redis/      # Deploy do Redis
        ├── setup-rbac/        # ServiceAccount + roles
        ├── get-status/        # Consulta recursos
        └── cleanup/           # Remove recursos
```

## Container

A imagem contém:
- **Node.js 20** — App web + MCP server
- **Ansible Core** — Automação dos deploys
- **oc CLI** — OpenShift Client para interagir com o cluster
- **kubectl** — Kubernetes Client (incluído no pacote oc)
- **Python 3** — Runtime do Ansible
- **Git** — Para builds source-to-image

Base: **Red Hat UBI 9 Minimal**
