# BBDW 2025 — Central de Demos Red Hat

> Conjunto de componentes criados para a **Sala Temática Red Hat · BBDW 2025**, combinando **IA Generativa**, **automação com Ansible**, **observabilidade de clusters** e **Model Context Protocol (MCP)** para demonstrar decisões inteligentes em ambientes Kubernetes/OpenShift.

---

## Começando — Deploy Automatizado

A forma mais rápida de colocar tudo no ar é via o **Demo Deployer**: uma aplicação web que orquestra o deploy de todos os componentes no OpenShift com um clique, usando Ansible por baixo dos panos.

### Deploy do Demo Deployer no OpenShift

```bash
# 1. Criar o projeto
oc new-project demo-deployer

# 2. Criar a aplicação
oc new-app --name=demo-deployer \
  --strategy=docker \
  --context-dir=demo-deployer \
  https://github.com/LucianoRed/bbdw-2025.git

# 3. Acompanhar o build
oc logs -f bc/demo-deployer

# 4. Criar PVC (salve como pvc-demo-deployer.yaml e aplique com oc create -f)
# 5. Montar o PVC
oc set volume deployment/demo-deployer \
  --add --name=demo-deployer-data \
  --type=pvc --claim-name=demo-deployer-data \
  --mount-path=/app/data

# 6. Expor a rota e habilitar TLS
oc expose svc/demo-deployer
oc annotate route demo-deployer kubernetes.io/tls-acme=true --overwrite

# 7. Obter a URL
oc get route demo-deployer -o jsonpath='{.spec.host}'
```

**PVC (pvc-demo-deployer.yaml):**

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: demo-deployer-data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

### O que o Demo Deployer faz

Acesse o dashboard e configure as credenciais do cluster (API URL, token, namespace e Git URL).

| # | Componente | Categoria | Descrição |
|---|---|---|---|
| 0 | Namespace | infra | Cria o projeto no OpenShift |
| 1 | Redis | infra | Cache e vector store para RAG |
| 2 | RBAC | infra | ServiceAccount + permissões para os MCP servers |
| 3 | MCP K8s Live | mcp | Métricas, pods, eventos do cluster |
| 4 | MCP K8s Security | mcp | NetworkPolicies, logs de segurança |
| 5 | MCP Downdetector | mcp | Status de websites externos |
| 6 | MCP Saúde | mcp | Registros de saúde escolar |
| 7 | MCP Matrículas | mcp | Sistema de matrículas escolares |
| 8 | Imagem Crash | demo | Container CrashLoopBackOff para demo |
| 9 | Agent AI | core | Chatbot Quarkus + LangChain4j |

### MCP Server do Demo Deployer

O próprio Demo Deployer expõe um MCP Server para que o agente de IA execute deploys de forma autônoma:

| Ferramenta | Descrição |
|---|---|
| `configure` | Configura API URL, token, namespace e git URL |
| `get_status` | Estado de todos os componentes no cluster |
| `list_components` | Lista os componentes disponíveis |
| `deploy_component` | Faz o deploy de um componente específico |
| `deploy_all` | Deploy completo de todos os componentes |
| `get_component_details` | Detalhes e logs de um componente |
| `refresh_cluster_status` | Consulta o status real no cluster |
| `cleanup` | Remove todos os recursos do namespace |

**Conexão SSE:** `http://<demo-deployer-url>/mcp/sse`

> A imagem Docker inclui **Node.js**, **Ansible Core**, **oc CLI**, **kubectl**, **Python 3** e **Git** sobre base **Red Hat UBI 9 Minimal**.

Para mais detalhes: [demo-deployer/README.md](demo-deployer/README.md)

---

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│         BBDW 2025 — Central de Demos                      │
│                                                             │
│  agent-ai  (Quarkus + LangChain4j + Redis)                 │
│    │ MCP                                                  │
│    ├── mcp-k8s-live       (binpacking / cluster live)        │
│    ├── mcp-k8s-security   (NetworkPolicies / logs)           │
│    ├── mcp-sei            (SEI — Gov BR)                     │
│    ├── mcp-matriculas     (matrículas escolares)             │
│    ├── mcp-saude          (saúde escolar)                    │
│    └── mcp-downdetector   (status de websites)               │
│                                                             │
│  demo-deployer  (Ansible + MCP + Dashboard Web)            │
│  Orquestra o deploy de todos os componentes acima          │
└─────────────────────────────────────────────────────────────┘
```

---

## Componentes do Repositório

### 🤖 agent-ai — Chatbot com IA Generativa

Aplicação **Quarkus 3 + LangChain4j** com múltiplos agentes conversacionais, memória persistente em Redis e RAG sobre documentação do OpenShift.

**Agentes disponíveis:** `AgentBBDW`, `AgentBBDWWithRAG`, `AgentGPT*`, `AgentGemini`

**Destaques:**
- Memória de chat e vector store via Redis
- Interface web completa em `src/main/resources/META-INF/resources/`
- Integração dinâmica com qualquer MCP server via painel de configuração
- Suporte a OpenAI, Google Gemini e modelos locais (vLLM/Ollama)

```bash
cd agent-ai
./mvnw quarkus:dev
# Acesse http://localhost:8080
```

Variáveis mínimas: `OPENAI_API_KEY` ou `GOOGLE_API_KEY`. Opcionalmente: `MCP_SERVER`, `REDIS_URL`.

---

### 🔧 demo-deployer — Orquestrador de Deploy

> **Ponto de entrada principal da demo.** Veja a seção [Começando](#começando--deploy-automatizado) acima para o deploy no OpenShift.

```bash
cd demo-deployer
npm install && npm start
# Acesse http://localhost:3000
```

---

### 📡 mcp-server-k8s-live — Observabilidade do Cluster

MCP Server com ferramentas para métricas e gerenciamento do cluster em tempo real.

**Ferramentas:** `get_live_binpacking`, `list_deployments`, `list_services`, `list_pods`, `list_storage`, `get_cluster_overview`, `list_events`, `list_machinesets`, `set_machineset_replicas`, `delete_pod`, `delete_pods_by_selector`

**Endpoints extras:** `/live` (dados para dashboards), `/healthz`

```bash
cd mcp-server-k8s-live
npm install && npm start
```
Variáveis: `K8S_API_URL`, `K8S_BEARER_TOKEN`

---

### 🔒 mcp-server-k8s-security — Segurança do Cluster

MCP Server focado em controles de segurança: NetworkPolicies, namespaces e coleta de logs.

**Ferramentas:** `list_namespaces`, `list_network_policies`, `create_np_template`, `delete_network_policy`, `get_pod_logs`

```bash
cd mcp-server-k8s-security
npm install && npm start
```
Variáveis: `K8S_API_URL`, `K8S_BEARER_TOKEN`

---

### 🏛️ mcp-server-sei — SEI (Governo Brasileiro)

MCP Server para integração com o **SEI — Sistema Eletrônico de Informações**, sistema de gestão de documentos e processos do governo federal (distribuído pelo MGI/SEGES).

| Ferramenta | Descrição |
|---|---|
| `sei_status_configuracao` | Verifica as credenciais configuradas |
| `sei_listar_unidades` | Lista unidades acessíveis pelo token |
| `sei_listar_tipos_processo` | Tipos de processo disponíveis |
| `sei_listar_processos` | Lista processos (filtros: situação, tipo, pesquisa) |
| `sei_consultar_processo` | Detalhes de um processo pelo número de protocolo |
| `sei_criar_processo` | Abre novo processo no SEI |
| `sei_listar_documentos_processo` | Lista documentos de um processo |
| `sei_consultar_documento` | Metadados de um documento |
| `sei_conteudo_documento` | Conteúdo textual de um documento |
| `sei_incluir_documento` | Inclui documento externo (Base64) em um processo |

```bash
cd mcp-server-sei
npm install

SEI_URL="https://sei.orgao.gov.br" \\
SEI_TOKEN="seu_token" \\
SEI_UNIDADE="110000123" \\
npm start
```
Variáveis obrigatórias: `SEI_URL`, `SEI_TOKEN`, `SEI_UNIDADE`

---

### 🏥 mcp-server-saude — Registros de Saúde

MCP Server com dados de saúde escolar e interface web para visualização.

```bash
cd mcp-server-saude && npm install && npm start
```

---

### 🎓 mcp-server-matriculas — Sistema de Matrículas

MCP Server para matrículas escolares (anos 5 ao 8), com interface web e ferramentas MCP.

**Ferramentas:** `listar_alunos`, `matricular_aluno`, `buscar_aluno`

```bash
cd mcp-server-matriculas && npm install && npm start
```

---

### 🌐 mcp-server-downdetector — Status de Websites

MCP Server que consulta disponibilidade de serviços externos e APIs públicas.

```bash
cd mcp-server-downdetector && npm install && npm start
```

---

### 💥 imagem-crash — Demo de CrashLoopBackOff

Container que falha intencionalmente (código 42) quando `APP_REQUIRED_TOKEN` não está definida. Demonstra diagnósticos com os MCP servers.

```bash
cd imagem-crash
docker build -t imagem-crash:latest .
kubectl apply -f k8s/deployment.yaml
```

---

### 🦙 llama-stack — Modelos de IA Locais

Imagens Docker para servir modelos com API compatível com OpenAI:

- **`Dockerfile` (vLLM):** endpoint `/v1/*`. `VLLM_DEVICE` alterna entre `cpu` e `cuda`.
- **`Dockerfile.ollama`:** Ollama com modelo customizado, ideal para CPU.

```bash
cd llama-stack
docker build -t llama-stack:cpu .
docker run --rm -p 8000:8000 llama-stack:cpu
```

---

### 🔍 mcp-inspector

Ferramenta de inspeção e teste de MCP servers. Útil para validar ferramentas e respostas antes de conectar ao agente.

---

## Pré-requisitos

| Componente | Requisito |
|---|---|
| `agent-ai` | Java 21, Maven 3.9+ |
| MCP Servers (Node.js) | Node.js 18+ |
| `demo-deployer` | Node.js 18+, acesso ao cluster OpenShift |
| Builds Docker | Docker ou Podman |
| Cluster demos | Kubernetes/OpenShift com token de acesso |
| Modelos de IA | `OPENAI_API_KEY` ou `GOOGLE_API_KEY` (ou vLLM/Ollama local) |

---

## Fluxos de Demonstração

### 1. Deploy Rápido — tudo de uma vez
```
1. Suba o demo-deployer no OpenShift (seção "Começando")
2. Configure as credenciais do cluster no dashboard
3. Clique em "Deploy All" e aguarde os componentes ficarem verdes
```

### 2. Observabilidade de Binpacking
```
1. Suba o agent-ai e o mcp-server-k8s-live
2. Configure o mcp-k8s-live como MCP server no painel do agent-ai
3. Pergunte ao agente sobre nós, pods e recursos do cluster
4. O agente consultará dados reais em tempo real via MCP
```

### 3. Diagnóstico de Incidente com IA
```
1. Faça deploy da imagem-crash sem APP_REQUIRED_TOKEN
2. O pod entrará em CrashLoopBackOff
3. Use o agente + mcp-k8s-live para identificar o problema
4. Use mcp-k8s-security para verificar NetworkPolicies e coletar logs
```

### 4. Integração com SEI (Governo)
```
1. Suba o mcp-server-sei com as credenciais do órgão
2. Configure como MCP server no agent-ai
3. O agente poderá consultar processos, criar novos e ler documentos
4. Combine com outros MCPs para workflows governamentais completos
```

---

## Estrutura do Repositório

```
bbdw-2025/
├── agent-ai/                   # Chatbot Quarkus + LangChain4j + Redis
├── demo-deployer/              # Orquestrador de deploy (Ansible + MCP + Web)
├── imagem-crash/               # Container de demo CrashLoopBackOff
├── llama-stack/                # vLLM e Ollama (API OpenAI-compatible)
├── mcp-inspector/              # Ferramenta de inspeção de MCP servers
├── mcp-server-downdetector/    # MCP: status de websites
├── mcp-server-k8s-live/        # MCP: observabilidade e binpacking do cluster
├── mcp-server-k8s-security/    # MCP: segurança, NetworkPolicies e logs
├── mcp-server-matriculas/      # MCP: sistema de matrículas escolares
├── mcp-server-quarkus/         # MCP: servidor base em Quarkus
├── mcp-server-saude/           # MCP: registros de saúde escolar
├── mcp-server-sei/             # MCP: integração com SEI (Gov BR)
└── ansible/                    # Playbooks Ansible auxiliares
```

---

*Sala Temática Red Hat · BBDW 2025*
