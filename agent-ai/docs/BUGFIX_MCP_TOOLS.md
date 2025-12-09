# 🐛 Bugfix: MCP Tool Names Not Found

## Problema
```
Tool not found: binpacking
Tool not found: clusterStatus
```

## Causa Raiz

O AI Agent estava tentando chamar tools com nomes incorretos:
- ❌ `binpacking` → ✅ `get_live_binpacking`
- ❌ `clusterStatus` → ✅ `get_cluster_overview`

Além disso, o servidor MCP "teste" estava registrado apenas via API REST, mas não configurado no `application.properties`, impedindo que o `@McpToolBox` funcionasse.

## Solução Implementada

### 1. Configuração do Servidor MCP no application.properties

Adicionado no `application.properties`:

```properties
# ============================================================================
# MCP Teste Server Configuration (Dynamic Server Example)
# ============================================================================
quarkus.langchain4j.mcp.teste.url=https://bb-demo-mcp-server-optimization-bb-demo-mcp-server-optimization.apps.bbdw.sandbox1460.opentlc.com/mcp
quarkus.langchain4j.mcp.teste.transport-type=streamable-http
quarkus.langchain4j.mcp.teste.log-requests=true
quarkus.langchain4j.mcp.teste.log-responses=true
quarkus.langchain4j.mcp.teste.tool-execution-timeout=180s
```

### 2. Atualização do AgentWithDynamicMcp

**Antes:**
```java
@RegisterAiService(
    tools = DynamicMcpToolExecutor.class  // ❌ Não funciona para tools dinâmicas
)
```

**Depois:**
```java
@RegisterAiService(
    modelName = "my-model",
    chatMemoryProviderSupplier = BeanChatMemoryProviderSupplier.class
)
@ApplicationScoped
public interface AgentWithDynamicMcp {
    
    @McpToolBox("teste")  // ✅ Usa servidor configurado no application.properties
    @SystemMessage("""
        ... 
        IMPORTANTE: Use os nomes EXATOS das ferramentas:
        - get_live_binpacking (não 'binpacking')
        - get_cluster_overview (não 'clusterStatus')
        ...
        """)
    String chat(@MemoryId String memoryId, @UserMessage String message);
}
```

### 3. System Message Melhorado

O system message agora lista explicitamente as tools disponíveis com seus nomes exatos e parâmetros, instruindo o AI a usar os nomes corretos.

## Como Funciona Agora

### Arquitetura
```
┌─────────────────┐
│ AgentWithDynami │
│      cMcp       │
│                 │
│ @McpToolBox     │
│   ("teste")     │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ application.    │
│  properties     │
│                 │
│ quarkus.        │
│ langchain4j.mcp │
│ .teste.url=...  │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Streamable     │
│ HttpMcpTransport│
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   MCP Server    │
│   (Remote)      │
│                 │
│ - get_live_     │
│   binpacking    │
│ - get_cluster_  │
│   overview      │
│ - ...           │
└─────────────────┘
```

### Fluxo de Execução

1. **Usuário** pergunta: "qual o status do binpacking?"
2. **AI Agent** (com system message atualizado):
   - Entende que deve usar `get_live_binpacking`
   - Chama a tool com o nome correto
3. **Quarkus LangChain4j**:
   - Resolve `@McpToolBox("teste")` → config do application.properties
   - Cria `StreamableHttpMcpTransport` com a URL configurada
4. **MCP Transport**:
   - Envia requisição HTTP para o servidor MCP
   - Recebe resposta com dados JSON
5. **AI Agent**:
   - Processa a resposta
   - Formata em markdown para o usuário

## Verificação

### 1. Teste as Tools Disponíveis
```bash
curl http://localhost:8080/api/mcp/tools | jq '.[] | {name, description}' | head -20
```

**Resultado esperado:**
```json
{
  "name": "get_live_binpacking",
  "description": "Obtém o snapshot atual de binpacking..."
}
{
  "name": "get_cluster_overview",
  "description": "Obtém uma visão geral do cluster..."
}
```

### 2. Teste o Agent
```bash
curl -X POST http://localhost:8080/chat/send \
  -H "Content-Type: application/json" \
  -d '{
    "message": "qual o status do cluster?",
    "modelName": "dynamic-mcp",
    "userId": "test-user"
  }'
```

**Comportamento esperado:**
- ✅ AI chama `get_cluster_overview` (nome correto)
- ✅ Recebe dados do cluster
- ✅ Formata resposta em markdown

### 3. Verificar Logs
```
2025-11-18 23:XX:XX INFO  [io.qua.lan.mcp.run.Mcp...] Executing MCP tool: get_cluster_overview
2025-11-18 23:XX:XX DEBUG [com.red.chat.AgentWithDynamicMcp] Tool response received
```

## Limitações Atuais

### ⚠️ Configuração Estática Requerida

Atualmente, servidores MCP precisam estar configurados no `application.properties` para funcionar com `@McpToolBox`. 

**Servidores registrados APENAS via API REST não são descobertos automaticamente.**

### Roadmap para Suporte Totalmente Dinâmico

Para suportar servidores 100% dinâmicos (sem application.properties):

1. **Opção 1: Custom ToolProvider** ✨ Recomendado
   - Implementar `ToolProvider` que consulta `McpManager`
   - Retorna `ToolProviderResult` com specs dinâmicas
   - Requer `ToolExecutor` customizado
   
2. **Opção 2: Reflection + Proxy**
   - Gerar proxies dinâmicos em tempo de execução
   - Registrar tools via `@PostConstruct`
   - Mais complexo, menos maintainable

3. **Opção 3: Contribuir ao Quarkus LangChain4j**
   - Propor suporte nativo a MCP servers dinâmicos
   - PR no repositório oficial
   - Beneficia toda a comunidade

## Próximos Passos

### Para Usuários

1. **Configure no application.properties** qualquer servidor MCP que você registrar via UI
2. **Use nomes exatos** das tools conforme listado em `/api/mcp/tools`
3. **Teste primeiro** com curl antes de usar na UI

### Para Desenvolvedores

1. **Implementar ToolProvider dinâmico** completo (ver `DynamicMcpToolProvider.java`)
2. **Adicionar hot-reload** quando servidores são adicionados/removidos
3. **Criar UI** para visualizar tools disponíveis em tempo real
4. **Adicionar cache inteligente** das tool specifications

## Referências

- 📄 `MCP_INTEGRATION.md` - Documentação completa da integração
- 📄 `QUICK_TEST_GUIDE.md` - Guia rápido de testes
- 🔧 `McpManager.java` - Gerenciador de clientes MCP
- 🤖 `AgentWithDynamicMcp.java` - Agent com suporte MCP
- ⚙️ `application.properties` - Configuração dos servidores
