# agent-ai

Chat AI com persistência em Redis para análise de clusters OpenShift/Kubernetes.

## Configuração

### Variáveis de Ambiente Obrigatórias

```bash
# OpenAI API Key
export QUARKUS_LANGCHAIN4J_OPENAI_API_KEY=your-api-key-here

# MCP Server URL
export QUARKUS_LANGCHAIN4J_MCP_K8S_SERVER_URL=https://your-mcp-server/mcp/sse

# Redis (opcional - padrão: localhost:6379)
export QUARKUS_REDIS_HOSTS=redis://localhost:6379
```

## Desenvolvimento Local

### 1. Iniciar Redis

```bash
docker-compose up -d
```

### 2. Executar a aplicação

```bash
./mvnw quarkus:dev
```

### 3. Acessar a interface

Abra o navegador em: http://localhost:8080

## Persistência da Memória

A aplicação usa Redis para persistir o histórico de conversas:

- **ChatMemoryStore**: Armazena mensagens no Redis
- **SessionId**: Cada sessão do chat tem um ID único
- **Retenção**: Últimas 30 mensagens por sessão (configurável)

### Estrutura no Redis

```
chat-memory:{sessionId} -> Lista de mensagens JSON
```

### Limpar memória de uma sessão

```bash
curl -X DELETE http://localhost:8080/chat/memory/{sessionId}
```

## Deploy no OpenShift

A aplicação precisa de um serviço Redis acessível:

```bash
# Criar Redis no OpenShift
oc new-app redis:7 -e REDIS_PASSWORD=secret

# Deploy da aplicação
oc new-app . --name=agent-ai \
  -e QUARKUS_LANGCHAIN4J_OPENAI_API_KEY=your-key \
  -e QUARKUS_REDIS_HOSTS=redis://redis:6379
```

### Configurar Timeout do Router (IMPORTANTE)

Para modelos que demoram mais de 30 segundos (como GPT-5 com MCP), você precisa aumentar o timeout do OpenShift Router:

```bash
# Anotar a rota para timeout de 10 minutos
oc annotate route agent-ai haproxy.router.openshift.io/timeout=600s
```

Ou via YAML da rota:

```yaml
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: agent-ai
  annotations:
    haproxy.router.openshift.io/timeout: 600s
spec:
  # ... resto da configuração
```

**Nota**: O timeout padrão do OpenShift Router é 30 segundos. Sem essa configuração, requisições longas retornarão `ERR_EMPTY_RESPONSE`.

## Endpoints

- `POST /chat/message` - Chat síncrono (com @RunOnVirtualThread)
- `POST /chat/stream` - Chat com SSE streaming
- `GET /chat/history/{sessionId}` - Recuperar histórico
- `DELETE /chat/memory/{sessionId}` - Limpar memória

## Features

- ✅ Persistência em Redis
- ✅ Virtual Threads para operações bloqueantes
- ✅ SSE Streaming
- ✅ MCP Tools para Kubernetes
- ✅ Interface web moderna
- ✅ Dark mode
