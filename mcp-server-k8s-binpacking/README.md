# MCP Server: K8s Binpacking

Clone reduzido e estritamente read-only do `mcp-server-k8s-live`, focado em entendimento de binpacking, consolidacao de carga e analise de capacidade em clusters Kubernetes/OpenShift.

## Objetivo

Este servidor remove as ferramentas de escrita e deixa apenas um conjunto pequeno de leituras uteis para responder perguntas como:

- quais nos estao mais ociosos ou mais pressionados
- se os requests atuais permitem reduzir workers
- se o uso real dos pods confirma ou contradiz essa consolidacao
- como um no especifico esta distribuindo os pods e recursos

## Ferramentas

### `list_nodes`
Lista os nos com role, capacidade, requests, uso real e percentual de ocupacao.

### `describe_node`
Retorna um describe read-only de um no com labels, taints, condicoes, capacidade, requests, uso e pods alocados.

### `list_pod_usage`
Lista os pods com namespace, owner, no, requests e uso real. Serve para encontrar os maiores consumidores e validar margem de consolidacao.

### `get_binpacking`
Retorna um snapshot de binpacking por `cpu` ou `memory`, incluindo `nodes`, `bins`, `pending` e agregados.

### `get_binpacking_optimization`
Simula remocao progressiva de workers com base em requests atuais, mostra o que precisaria ser redistribuido e aponta a maior reducao viavel.

Observacoes:

- a recomendacao de reducao e baseada em requests; o uso real dos pods entra como evidencia adicional
- se `metrics.k8s.io` nao estiver disponivel, o servidor continua funcionando, mas sem validacao de uso real
- nos `master/control-plane` e `infra` nao entram na simulacao de remocao

## Variaveis de ambiente

- `K8S_API_URL` obrigatoria
- `K8S_BEARER_TOKEN` obrigatoria
- `K8S_SKIP_TLS_VERIFY` opcional
- `K8S_CLUSTER_NAME` opcional
- `PORT` opcional, padrao `3000`
- `ENABLE_STDIO` opcional, padrao `true`

## Execucao

```sh
npm install
npm start
```

Exemplo:

```sh
K8S_API_URL=https://seu-cluster:6443 \
K8S_BEARER_TOKEN=... \
K8S_SKIP_TLS_VERIFY=true \
npm start
```

## Endpoints

- `POST /mcp`
- `GET /mcp/sse`
- `POST /mcp/messages?sessionId=<id>`
- `GET /healthz`
- `GET /metrics`

## Docker

```sh
docker build -t mcp-server-k8s-binpacking:latest .
docker run --rm -it \
  -e K8S_API_URL="https://seu-cluster:6443" \
  -e K8S_BEARER_TOKEN="<token>" \
  -e K8S_SKIP_TLS_VERIFY="true" \
  -p 3000:3000 \
  mcp-server-k8s-binpacking:latest
```
