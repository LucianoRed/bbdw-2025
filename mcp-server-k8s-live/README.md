# MCP Server: K8s Live (binpacking)

Servidor MCP que expõe ferramentas para monitoramento e métricas de clusters Kubernetes/OpenShift, incluindo binpacking de recursos, deployments, services, storage, eventos e visão geral do cluster.

## Protocolos Suportados

Este servidor MCP suporta **três protocolos de transporte**:

### 1. **STDIO** (padrão)
Comunicação via stdin/stdout, ideal para integração com clientes MCP locais.

```sh
node src/index.js
```

### 2. **SSE (Server-Sent Events)**
Streaming unidirecional do servidor para o cliente via HTTP.

- Endpoint: `GET http://localhost:3000/mcp/sse`
- Mensagens: `POST http://localhost:3000/mcp/messages?sessionId=<id>`

### 3. **HTTP Streamable (JSON-RPC)**
JSON-RPC sobre HTTP com suporte a streaming de respostas.

- Endpoint: `POST http://localhost:3000/mcp`
- Content-Type: `application/json`
- Body: mensagens JSON-RPC 2.0

Exemplo de requisição:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

## Variáveis de ambiente

- `K8S_API_URL` (obrigatório): URL base da API do Kubernetes. Ex.: `https://$CLUSTER:6443`
- `K8S_BEARER_TOKEN` (obrigatório): Token Bearer para autenticação.
- `K8S_SKIP_TLS_VERIFY` (opcional): `true` para ignorar verificação de TLS (self-signed etc.).
- `PORT` (opcional): Porta HTTP (padrão: 3000)
- `ENABLE_STDIO` (opcional): `true` (padrão) para habilitar transporte stdio

## Pré-requisitos

- Node.js 18 ou superior.

## Execução

Instale as dependências e inicie o servidor MCP:

```sh
npm install
npm start
```

> Dica: você pode rodar com as variáveis de ambiente, por exemplo:
>
> ```sh
> K8S_API_URL=https://... K8S_BEARER_TOKEN=... K8S_SKIP_TLS_VERIFY=true npm start
> ```

## Docker

Build da imagem (na pasta `mcp-server-k8s-live/`):
## Como gerar/atualizar o conteúdo de `src/`


```sh
docker build -t mcp-server-k8s-live:latest .
```

Execução HTTP (rodando como usuário não-root dentro da imagem):

```sh
docker run --rm -it \
  -e K8S_API_URL="https://seu-cluster:6443" \
  -e K8S_BEARER_TOKEN="<token>" \
  -e K8S_SKIP_TLS_VERIFY="true" \
  -e PORT=3000 \
  -p 3000:3000 \
  mcp-server-k8s-live:latest
```

Rotas HTTP disponíveis:

- **MCP Endpoints:**
  - `POST /mcp` → JSON-RPC 2.0 (Streamable HTTP transport)
  - `GET /mcp/sse` → SSE transport initialization
  - `POST /mcp/messages?sessionId=<id>` → SSE message posting
- **Data Endpoints:**
  - `GET /live?resource=cpu|memory&ns=ns1,ns2` → Binpacking data (compatível com liveData.php)
- **Health:**
  - `GET /healthz` → Health check `{ status: "ok" }`

### CORS
Todos os endpoints HTTP possuem CORS liberado (`Access-Control-Allow-Origin: *`).

Observação: além do HTTP, o processo também expõe o protocolo MCP via stdio (útil para clientes MCP). Se você só precisa de HTTP, basta usar o `-p` e consumir as rotas acima.

## Integração com cliente MCP

No cliente MCP (ex.: configurações que aceitem servidores MCP via `command`), registre o servidor apontando para `node` e `src/index.js`:

- command: `node`
- args: `["src/index.js"]`
- env: `K8S_API_URL`, `K8S_BEARER_TOKEN`, `K8S_SKIP_TLS_VERIFY`
- cwd: `mcp-server-k8s-live/`

## Ferramentas disponíveis

### 1. get_live_binpacking
Snapshot de binpacking do cluster (compatível com binpacking-live/liveData.php).

**Parâmetros:**
- `resource`: `"cpu"` (padrão) ou `"memory"`
- `ns`: namespaces separados por vírgula (opcional)

**Retorno:** `nodes`, `bins`, `perBinAllowedUnits`, `totalUsedUnits`, `totalAvailableUnits`, `binPackRatio`, `pending`

### 2. get_deployments
Métricas de Deployments do cluster.

**Parâmetros:**
- `ns`: namespaces separados por vírgula (opcional)

**Retorno:** Lista de deployments com status de réplicas, disponibilidade e condições

### 3. get_services
Métricas de Services do cluster.

**Parâmetros:**
- `ns`: namespaces separados por vírgula (opcional)

**Retorno:** Lista de services com tipo, ClusterIP, portas e seletores

### 4. get_storage
Métricas de armazenamento (PVs e PVCs).

**Parâmetros:**
- `ns`: namespaces separados por vírgula para filtrar PVCs (opcional)

**Retorno:** `persistentVolumes` (cluster-wide) e `persistentVolumeClaims` por namespace

### 5. get_events
Eventos recentes do cluster.

**Parâmetros:**
- `ns`: namespaces separados por vírgula (opcional)
- `limit`: número máximo de eventos (padrão: 50)

**Retorno:** Lista de eventos ordenados por timestamp (mais recentes primeiro)

### 6. get_cluster_overview
Visão geral do cluster com estatísticas agregadas.

**Retorno:** Estatísticas de nós, pods, namespaces, deployments e services

### 7. delete_pod
Remove (mata) um Pod específico por nome e namespace. Útil após resolver issues de alocação/agendamento, para forçar realocação.

**Parâmetros:**
- `namespace` (string, obrigatório)
- `name` (string, obrigatório)
- `confirm` (boolean, obrigatório): deve ser `true` para executar a deleção
- `dryRun` (boolean, opcional): se `true`, simula sem aplicar
- `gracePeriodSeconds` (integer, opcional): `0` para matar imediatamente
- `propagationPolicy` (string, opcional): `Foreground` | `Background` | `Orphan`

**Retorno:** Detalhes da deleção.

### 8. delete_pods_by_selector
Remove (mata) todos os Pods de um namespace que correspondem a um `labelSelector`. Ideal para reiniciar rapidamente todos os pods de um Deployment/DaemonSet/StatefulSet.

**Parâmetros:**
- `namespace` (string, obrigatório)
- `labelSelector` (string, obrigatório), ex.: `app=myapp,component=api`
- `confirm` (boolean, obrigatório): deve ser `true`
- `dryRun` (boolean, opcional)
- `gracePeriodSeconds` (integer, opcional)
- `propagationPolicy` (string, opcional): `Foreground` | `Background` | `Orphan`
- `previewOnly` (boolean, opcional): se `true`, apenas lista os pods correspondentes

**Retorno:** Lista de pods afetados e resultado da deleção (ou preview).

