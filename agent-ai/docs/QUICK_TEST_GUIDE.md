# Guia Rápido de Teste - MCP Dinâmico

## 🚀 Testando a Integração Completa

### Passo 1: Iniciar a Aplicação

```bash
./mvnw quarkus:dev
```

### Passo 2: Cadastrar um Servidor MCP

**Via Interface Web:**
1. Acesse: http://localhost:8080/index.html
2. Vá para aba **"🔌 MCP Servers"**
3. Clique em **"➕ Adicionar Servidor"**
4. Preencha:
   - **Nome**: `test-server`
   - **Tipo**: HTTP (Streamable)
   - **URL**: `http://localhost:3001/mcp`
   - Marque **Log Requests** e **Log Responses**
5. Clique em **"Adicionar Servidor"**

**Via cURL:**
```bash
curl -X POST http://localhost:8080/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-server",
    "url": "http://localhost:3001/mcp",
    "transportType": "http",
    "logRequests": true,
    "logResponses": true
  }'
```

### Passo 3: Verificar Tools Disponíveis

```bash
# Listar servidores cadastrados
curl http://localhost:8080/api/mcp/servers | jq

# Listar todas as tools disponíveis
curl http://localhost:8080/api/mcp/tools | jq
```

**Resposta esperada:**
```json
[
  {
    "name": "list_pods",
    "description": "List pods in a namespace",
    "parameters": "{...}"
  },
  {
    "name": "get_pod_logs",
    "description": "Get logs from a pod",
    "parameters": "{...}"
  }
]
```

### Passo 4: Testar com o AI Agent

**Via Interface Web:**
1. Selecione o modelo **"🔌 Dynamic MCP (Experimental)"**
2. Digite: `"Liste os pods no namespace default"`
3. O agent usará automaticamente as tools dinâmicas!

**Via cURL:**
```bash
curl -X POST http://localhost:8080/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Liste os pods no namespace default",
    "model": "dynamic-mcp",
    "sessionId": "test-session-123"
  }'
```

**Resposta esperada:**
```json
"Aqui estão os pods no namespace default:

| Nome | Status | Restarts |
|------|--------|----------|
| pod-1 | Running | 0 |
| pod-2 | Running | 0 |
..."
```

### Passo 5: Verificar Logs

Nos logs da aplicação você verá:
```
INFO  [com.redhat.mcp.McpManager] MCP Server added: test-server
INFO  [com.redhat.mcp.DynamicMcpToolProvider] DynamicMcpToolProvider disponibilizando 5 tools dinâmicas via executor
DEBUG [com.redhat.mcp.DynamicMcpToolExecutor] Executando tool MCP dinâmica: list_pods
```

## 🧪 Testes Avançados

### Teste 1: Adicionar Múltiplos Servidores

```bash
# Servidor 1: K8s
curl -X POST http://localhost:8080/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "k8s-server",
    "url": "http://localhost:3001/mcp",
    "transportType": "http",
    "logRequests": true,
    "logResponses": true
  }'

# Servidor 2: Weather API
curl -X POST http://localhost:8080/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "weather-server",
    "url": "http://localhost:3002/mcp",
    "transportType": "http",
    "logRequests": false,
    "logResponses": false
  }'

# Verificar ambos estão registrados
curl http://localhost:8080/api/mcp/servers | jq
```

### Teste 2: Agent com Tools Combinadas

O agent `AgentWithDynamicMcp` usa TANTO tools estáticas (@McpToolBox) quanto dinâmicas:

```bash
curl -X POST http://localhost:8080/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Liste os pods E me diga qual o clima em São Paulo",
    "model": "dynamic-mcp",
    "sessionId": "multi-tool-test"
  }'
```

O agent usará:
- Tools dinâmicas do `k8s-server` para listar pods
- Tools dinâmicas do `weather-server` para clima
- Tools estáticas do `@McpToolBox("k8s-server")` se necessário

### Teste 3: Remover e Re-adicionar Servidor

```bash
# Remove servidor
curl -X DELETE http://localhost:8080/api/mcp/servers/test-server

# Verifica remoção
curl http://localhost:8080/api/mcp/servers | jq

# Re-adiciona
curl -X POST http://localhost:8080/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-server",
    "url": "http://localhost:3001/mcp",
    "transportType": "http",
    "logRequests": true,
    "logResponses": true
  }'
```

### Teste 4: Verificar Cache

```bash
# Primeira chamada - cache miss
curl http://localhost:8080/api/mcp/tools

# Segunda chamada imediata - cache hit (mais rápido)
time curl http://localhost:8080/api/mcp/tools

# Aguardar 30 segundos e chamar novamente - cache expirado
sleep 30
time curl http://localhost:8080/api/mcp/tools
```

## 🐛 Troubleshooting

### Problema: Tools não aparecem

**Solução 1: Verificar servidores**
```bash
curl http://localhost:8080/api/mcp/servers
```

**Solução 2: Verificar tools diretamente**
```bash
curl http://localhost:8080/api/mcp/tools
```

**Solução 3: Ver logs**
```bash
# Ative debug no application.properties
quarkus.log.category."com.redhat.mcp".level=DEBUG
```

### Problema: Agent não usa as tools

**Solução: Verificar modelo selecionado**
- Certifique-se de estar usando o modelo **"dynamic-mcp"**
- Outros modelos não têm as tools dinâmicas integradas

### Problema: Erro de conexão com servidor MCP

**Solução: Verificar URL do servidor**
```bash
# Teste se o servidor MCP está acessível
curl http://localhost:3001/mcp/health

# Verifique logs do servidor MCP
# Certifique-se que está usando StreamableHTTP, não SSE
```

## 📊 Métricas e Monitoramento

### Ver estatísticas

```bash
# Total de servidores
curl http://localhost:8080/api/mcp/servers | jq length

# Total de tools
curl http://localhost:8080/api/mcp/tools | jq length

# Tools por servidor
curl http://localhost:8080/api/mcp/tools | jq 'group_by(.name) | length'
```

## ✅ Checklist de Sucesso

- [ ] Aplicação iniciada sem erros
- [ ] Servidor MCP cadastrado via UI ou API
- [ ] Servidores aparecem em `/api/mcp/servers`
- [ ] Tools aparecem em `/api/mcp/tools`
- [ ] Modelo "Dynamic MCP" disponível no seletor
- [ ] Agent responde usando as tools dinâmicas
- [ ] Logs mostram execução das tools
- [ ] Cache funciona (verificar tempo de resposta)

Se todos os itens estão OK, a integração está funcionando perfeitamente! 🎉
