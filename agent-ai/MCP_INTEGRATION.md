# Integração de Servidores MCP Dinâmicos

Este documento explica como os servidores MCP dinâmicos funcionam e como integrá-los com AI Agents.

## 📋 Arquitetura

### Componentes Criados

1. **`McpManager`** - Gerenciador central de servidores MCP
   - Mantém mapa de clientes MCP em memória
   - Permite adicionar/remover servidores em runtime
   - Coleta tools de todos os servidores registrados
   - Executa tools delegando para o servidor correto

2. **`McpResource`** - API REST para gerenciamento
   - `GET /api/mcp/servers` - Lista servidores cadastrados
   - `POST /api/mcp/servers` - Adiciona novo servidor
   - `DELETE /api/mcp/servers/{name}` - Remove servidor

3. **`DynamicMcpToolExecutor`** - Executor de tools dinâmicas ✨ **NOVO!**
   - Bean CDI com métodos `@Tool` para integração com LangChain4j
   - Cache inteligente de tool specifications (TTL 30s)
   - Executa tools delegando para McpManager
   - Automaticamente descoberto pelos AI Services

4. **`DynamicMcpToolProvider`** - Provider de tools dinâmicas
   - Implementa interface `ToolProvider` do LangChain4j
   - Integra com DynamicMcpToolExecutor
   - Pode ser usado via `DynamicMcpToolProviderSupplier`

5. **`AgentWithDynamicMcp`** - AI Agent com integração completa ✨ **NOVO!**
   - Usa tanto MCP estático (@McpToolBox) quanto dinâmico (tools=)
   - Exemplo funcional de integração híbrida
   - Acessível via modelo "dynamic-mcp" na interface

6. **Interface Web** - UI para cadastro de servidores
   - Modal de formulário para adicionar servidores
   - Suporte para HTTP (StreamableHttpMcpTransport) e Stdio
   - Listagem e remoção de servidores
   - Configuração de logs por servidor
   - Novo modelo "🔌 Dynamic MCP" no seletor

## 🔧 Como Usar

### ⭐ Opção 1: Usar AgentWithDynamicMcp (MAIS SIMPLES!) ✨

A forma mais simples - agent pronto com integração completa!

**Via Interface Web:**
1. Cadastre seus servidores MCP na aba "🔌 MCP Servers"
2. Selecione o modelo **"🔌 Dynamic MCP"** no seletor
3. Digite sua mensagem e pronto! O agent usará as tools dinâmicas automaticamente

**Via API:**
```bash
curl -X POST http://localhost:8080/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Liste os pods no namespace default",
    "model": "dynamic-mcp",
    "sessionId": "session-123"
  }'
```

**Criando seu próprio Agent:**
```java
@RegisterAiService(
    modelName = "my-model",
    tools = DynamicMcpToolExecutor.class  // ← Tools dinâmicas integradas!
)
public interface MyCustomAgent {
    @SystemMessage("Você é um assistente com acesso a tools dinâmicas...")
    String chat(@MemoryId String memoryId, @UserMessage String message);
}
```

### Opção 2: Uso Programático (Máximo Controle)

Esta é a forma mais flexível quando você precisa de controle total:

```java
@Path("/chat")
public class ChatResource {
    
    @Inject
    McpManager mcpManager;
    
    @Inject
    ChatModel chatModel;
    
    @POST
    public String chat(String message) {
        // 1. Obtém todas as tools dos servidores dinâmicos
        List<ToolSpecification> tools = mcpManager.getAllTools();
        
        // 2. Cria request com as tools
        ChatRequest request = ChatRequest.builder()
            .messages(UserMessage.from(message))
            .toolSpecifications(tools)
            .build();
        
        // 3. Chama o modelo
        ChatResponse response = chatModel.chat(request);
        
        // 4. Se AI pediu execução de tool
        if (response.aiMessage().hasToolExecutionRequests()) {
            for (ToolExecutionRequest toolReq : response.aiMessage().toolExecutionRequests()) {
                // Executa via McpManager
                String result = mcpManager.executeTool(toolReq);
                
                // Adiciona resultado à conversa e continua...
            }
        }
        
        return response.aiMessage().text();
    }
}
```

### Opção 3: Via ToolProvider (Avançado)

Use o `DynamicMcpToolProviderSupplier` para controle programático:

```java
@RegisterAiService(
    toolProviderSupplier = DynamicMcpToolProviderSupplier.class
)
public interface MyAgent {
    String chat(String message);
}
```

### Opção 4: Híbrida (Melhor dos Dois Mundos)

Combine servidores estáticos (via properties) com dinâmicos (via McpManager):

```java
@RegisterAiService(modelName = "my-model")
public interface HybridAgent {
    
    @McpToolBox("k8s-server")  // Servidor estático do application.properties
    String chat(@MemoryId String memoryId, @UserMessage String message);
}
```

E quando precisar de tools dinâmicas:

```java
@Inject
HybridAgent agent;

@Inject
McpManager mcpManager;

public String chatWithDynamicTools(String message) {
    // Use agent normal OU integre programaticamente com mcpManager
    return agent.chat("session-123", message);
}
```

## 🌐 Cadastrando Servidores via UI

1. Acesse a aba **"🔌 MCP Servers"** na interface
2. Clique em **"➕ Adicionar Servidor"**
3. Preencha:
   - **Nome**: Identificador único (ex: `weather-api`)
   - **Tipo de Transporte**: 
     - `HTTP (Streamable)` para servidores remotos
     - `Stdio` para processos locais
   - **URL/Comando**: 
     - HTTP: `http://localhost:3001/mcp`
     - Stdio: `/usr/bin/npm exec @modelcontextprotocol/server-weather`
   - **Logs**: Marque para debug

4. O servidor estará imediatamente disponível para uso!

## 📝 Cadastrando via API

```bash
# Adicionar servidor HTTP
curl -X POST http://localhost:8080/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "weather-server",
    "url": "http://localhost:3001/mcp",
    "transportType": "http",
    "logRequests": true,
    "logResponses": true
  }'

# Adicionar servidor Stdio
curl -X POST http://localhost:8080/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "github-server",
    "url": "/usr/bin/npm exec @modelcontextprotocol/server-github",
    "transportType": "stdio",
    "logRequests": false,
    "logResponses": false
  }'

# Listar servidores
curl http://localhost:8080/api/mcp/servers

# Remover servidor
curl -X DELETE http://localhost:8080/api/mcp/servers/weather-server
```

## 🔍 Debugging

### Ver Tools Disponíveis

```java
@Inject
McpManager mcpManager;

public void debugTools() {
    List<ToolSpecification> tools = mcpManager.getAllTools();
    for (ToolSpecification tool : tools) {
        System.out.println("Tool: " + tool.name());
        System.out.println("Description: " + tool.description());
        System.out.println("Parameters: " + tool.parameters());
    }
}
```

### Ver Servidores Registrados

```bash
curl http://localhost:8080/api/mcp/servers | jq
```

### Logs

Ative logs detalhados no `application.properties`:

```properties
quarkus.log.category."com.redhat.mcp".level=DEBUG
```

## ✅ Recursos Implementados

1. **Integração Completa com AI Agents** ✨
   - ✅ Servidores dinâmicos totalmente integrados via `DynamicMcpToolExecutor`
   - ✅ Agent pronto: `AgentWithDynamicMcp` com modelo "dynamic-mcp"
   - ✅ Tools aparecem automaticamente usando `tools = DynamicMcpToolExecutor.class`
   - ✅ Cache inteligente de tool specifications (30s TTL)

2. **Interface Web Completa**
   - ✅ Cadastro de servidores via formulário
   - ✅ Suporte HTTP e Stdio
   - ✅ Listagem e remoção
   - ✅ Seletor de modelo com opção "Dynamic MCP"

3. **API REST Funcional**
   - ✅ GET/POST/DELETE para gerenciar servidores
   - ✅ Feedback em tempo real

## ⚠️ Limitações Conhecidas

2. **Tools não são persistidas**
   - Servidores são mantidos apenas em memória
   - Reiniciar a aplicação perde os registros
   - Solução futura: Persistir em Redis/Database

3. **Lifecycle dos clientes**
   - Clientes são criados mas não reinicializados automaticamente se falharem
   - Recomendado: Implementar health checks periódicos

4. **Cache de 30 segundos**
   - Tool specifications são cacheadas por 30s para performance
   - Novos servidores podem levar até 30s para aparecer
   - Use `DynamicMcpToolExecutor.invalidateCache()` para forçar atualização

## 🚀 Próximos Passos

1. **Persistência**: Salvar configurações de servidores no Redis
2. **Health Checks**: Monitoramento automático de saúde dos servidores
3. **Auto-discovery**: Descobrir servidores MCP na rede
4. **Tool Caching**: Cache inteligente de tool specifications
5. **Integração Nativa**: Melhorar integração com `@McpToolBox`

## 📚 Referências

- [Quarkus LangChain4j MCP](https://docs.quarkiverse.io/quarkus-langchain4j/dev/mcp.html)
- [LangChain4j MCP Client](https://docs.langchain4j.dev/tutorials/mcp)
- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
