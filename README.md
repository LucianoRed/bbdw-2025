# bbdw-2025
Conjunto de demos e utilitários criados para a Sala Temática Red Hat BBDW 2025. O objetivo é combinar IA generativa, observabilidade e automação para auxiliar decisões de binpacking e escalabilidade em clusters Kubernetes/OpenShift.

## Visão Geral
- **Chat Agent (Quarkus + LangChain4j):** chatbot com memória em Redis, integrações MCP e RAG sobre documentação do OpenShift.
- **MCP Servers (Node.js):** serviços que expõem dados em tempo real do cluster (binpacking) e operações focadas em segurança (NetworkPolicies, logs).
- **Stacks de Modelos:** imagens de referência com vLLM e Ollama para disponibilizar endpoints compatíveis com OpenAI em CPU ou GPU.
- **Imagem CrashLoopBackOff:** container de demonstração para evidenciar problemas de configuração e acionar correções via MCP.

## Estrutura do Repositório
```
bbdw-2025/
├── agent-ai/                 # Aplicação Quarkus com agentes conversacionais
├── imagem-crash/             # Imagem exemplo que falha sem variáveis obrigatórias
├── llama-stack/              # Containers para vLLM e Ollama (API OpenAI-like)
├── mcp-server-k8s-live/      # MCP Server com métricas de cluster e binpacking
└── mcp-server-k8s-security/  # MCP Server focado em NetworkPolicies e logs
```

### agent-ai/
- **Tecnologias:** Quarkus 3, Java 21, LangChain4j, Redis, MCP.
- **Pontos-chave:**
	- múltiplos agentes (`AgentBBDW`, `AgentBBDWWithRAG`, `AgentGPT*`, `AgentGemini`).
	- integração com Redis para memória do chat e vetor store de documentos (`rag-documents/`).
	- templates de Docker em `src/main/docker/` (JVM, native e jar legacy).
	- UI estática em `src/main/resources/META-INF/resources/` (dashboard, feedback, chat).
	- configurações detalhadas em `src/main/resources/application.properties` (modelos, timeouts, auth e integração MCP).
- **Executar local:**
	```bash
	cd agent-ai
	./mvnw quarkus:dev
	```
	Variáveis mínimas: `OPENAI_API_KEY` ou `GOOGLE_API_KEY`; opcionalmente `MCP_SERVER` e `REDIS_URL`.

### imagem-crash/
- Container simples que falha com código 42 quando a variável obrigatória (padrão `APP_REQUIRED_TOKEN`) não está presente.
- Inclui `k8s/deployment.yaml` para reproduzir CrashLoopBackOff em clusters.
- Útil para demonstrar diagnósticos com os MCP servers e automações corretivas.

### llama-stack/
- Dockerfiles para dois cenários:
	- **`Dockerfile` (vLLM):** expõe servidor compatível com OpenAI (`/v1/*`). Usa `VLLM_DEVICE` para alternar entre `cpu` e `cuda`.
	- **`Dockerfile.ollama`:** empacota Ollama com modelo customizado (`ollama/Modelfile`), útil em ambientes apenas CPU.
- Scripts auxiliares: `start.sh` ajusta parâmetros do vLLM; `entrypoint-ollama.sh` inicializa o runtime Ollama.

### mcp-server-k8s-live/
- Servidor MCP (Node 18+) com ferramentas para:
	- obter binpacking (`get_live_binpacking`), deployments, services, storage, eventos, overview do cluster;
	- administrar MachineSets (`list_machinesets`, `set_machineset_replicas`) e pods (`delete_pod`, `delete_pods_by_selector`).
- Implementa transportes **STDIO**, **SSE** (`/mcp/sse`) e **HTTP JSON-RPC** (`/mcp`).
- Endpoints auxiliares: `/live` (dados para dashboards), `/healthz` (status).

### mcp-server-k8s-security/
- Servidor MCP especializado em controles de segurança:
	- listar namespaces, policies (`list_*`), criar/deletar templates (`create_np_template`).
	- coletar logs de pods (`get_pod_logs`).
- Também suporta STDIO, SSE e HTTP JSON-RPC, com mesmas variáveis de ambiente (`K8S_API_URL`, `K8S_BEARER_TOKEN`, etc.).

## Pré-requisitos Gerais
- Docker / Podman para build das imagens.
- Maven 3.9+ e Java 21 para o módulo Quarkus (`agent-ai`).
- Node.js 18+ para os MCP servers.
- Acesso a um cluster Kubernetes/OpenShift com token (para demonstrar os MCP servers) e, opcionalmente, Redis.

## Fluxos de Demonstração Recomendada
1. **Observabilidade de Binpacking:**
	 - Executar `mcp-server-k8s-live` apontando para o cluster.
	 - Consumir os dados via SSE ou HTTP (`/live?resource=cpu`).
2. **Chat Agent Inteligente:**
	 - Subir `agent-ai` em modo dev (`./mvnw quarkus:dev`).
	 - Acessar `http://localhost:8080` e interagir com o agente BBDW ou variantes GPT/Gemini.
	 - Ativar integrações MCP para que o agente consulte dados do cluster em tempo real.
3. **Correção de Incidentes:**
	 - Fazer deploy da `imagem-crash` sem a variável obrigatória para gerar CrashLoopBackOff.
	 - Usar o MCP de segurança para criar uma NetworkPolicy padrão ou ajustar configurações.

## Build e Execução Rápida

### Agent AI (Quarkus)
```bash
cd agent-ai
./mvnw package -DskipTests
docker build -f src/main/docker/Dockerfile.jvm -t agent-ai:latest .
```

### MCP Servers
```bash
# Live
cd mcp-server-k8s-live
npm install
npm start

# Security
cd ../mcp-server-k8s-security
npm install
npm start
```

### Imagem Crash
```bash
cd imagem-crash
docker build -t imagem-crash:latest .
kubectl apply -f k8s/deployment.yaml
```

### Llama Stack
```bash
cd llama-stack
docker build -t llama-stack:cpu .
docker run --rm -p 8000:8000 llama-stack:cpu
```

## Próximos Passos
- Criar dashboards específicos consumindo `/live` e `/mcp` para visualizações em tempo real.
- Ajustar agentes para decisões automatizadas de escalabilidade (MachineSets, eviction de pods) com confirmação humana.
- Integrar testes automatizados (Java e Node) e pipelines de CI/CD conforme práticas da equipe.

---

## Demo Deployer

Aplicação web para deploy automatizado de todos os componentes da demo no OpenShift, com automação via **Ansible** e integração **MCP Server**. Permite deployar cada componente com um clique pela interface ou via chamadas MCP.

### Deploy no OpenShift

```bash
# 1. Criar projeto
oc new-project demo-deployer

# 2. Criar a app a partir do Dockerfile
oc new-app --name=demo-deployer \
  --strategy=docker \
  --context-dir=demo-deployer \
  https://github.com/LucianoRed/bbdw-2025.git

# 3. Acompanhar o build
oc logs -f bc/demo-deployer

# 4. Criar PVC para persistência de estado
oc create -f - <<EOF
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
EOF

# 5. Montar PVC no deployment
oc set volume deployment/demo-deployer \
  --add \
  --name=demo-deployer-data \
  --type=pvc \
  --claim-name=demo-deployer-data \
  --mount-path=/app/data

# 6. Expor a rota
oc expose svc/demo-deployer

# 7. Anotar rota com TLS
oc annotate route demo-deployer kubernetes.io/tls-acme=true --overwrite

# 8. Pegar a URL
oc get route demo-deployer -o jsonpath='{.spec.host}'
```

### Funcionalidades
- **Dashboard Web** — Interface para gerenciar deploys com status em tempo real (WebSocket)
- **Ansible Automation** — Playbooks para deploy de cada componente (namespace, Redis, RBAC, MCP servers, Agent AI)
- **MCP Server** — 8 tools acessíveis via SSE (`/mcp/sse`) ou STDIO para integração com IA
- **Persistência** — Estado salvo em PVC, sobrevive a restarts do pod

### MCP Server — Tools Disponíveis

| Tool | Descrição |
|------|-----------|
| `configure` | Configura API URL, token, namespace e git URL |
| `get_status` | Estado de todos os componentes |
| `list_components` | Lista componentes disponíveis |
| `deploy_component` | Deploy de um componente específico |
| `deploy_all` | Deploy completo de todos |
| `get_component_details` | Detalhes e logs de um componente |
| `refresh_cluster_status` | Consulta status real no cluster |
| `cleanup` | Remove todos os recursos |

### Container
A imagem inclui **Node.js**, **Ansible Core**, **oc CLI**, **kubectl**, **Python 3** e **Git** sobre base **Red Hat UBI 9 Minimal**.

Para mais detalhes, veja o [README do demo-deployer](demo-deployer/README.md).


