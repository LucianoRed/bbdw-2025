package com.redhat.mcp;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.mcp.client.DefaultMcpClient;
import dev.langchain4j.mcp.client.McpClient;
import dev.langchain4j.mcp.client.transport.McpTransport;
import dev.langchain4j.mcp.client.transport.http.StreamableHttpMcpTransport;
import dev.langchain4j.mcp.client.transport.stdio.StdioMcpTransport;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class McpManager {

    private final Map<String, McpClient> clients = new ConcurrentHashMap<>();
    private final Map<String, McpServerConfig> configs = new ConcurrentHashMap<>();
    
    @Inject
    McpEventService mcpEventService;

    public void addServer(McpServerConfig config) {
        try {
            McpTransport transport;
            if ("stdio".equalsIgnoreCase(config.transportType())) {
                // Assuming url contains the command for stdio
                List<String> cmd = List.of(config.url().split(" "));
                transport = new StdioMcpTransport.Builder()
                        .command(cmd)
                        .logEvents(config.logRequests())
                        .build();
            } else {
                // Default to HTTP
                transport = new StreamableHttpMcpTransport.Builder()
                        .url(config.url())
                        .logRequests(config.logRequests())
                        .logResponses(config.logResponses())
                        .build();
            }

            McpClient client = new DefaultMcpClient.Builder()
                    .transport(transport)
                    .build();

            // Initialize/Check health if possible, or just store it
            // client.initialize(); // Some versions require this

            clients.put(config.name(), client);
            configs.put(config.name(), config);
            Log.infof("MCP Server added: %s", config.name());
        } catch (Exception e) {
            Log.errorf("Failed to add MCP server %s: %s", config.name(), e.getMessage());
            throw new RuntimeException(e);
        }
    }

    public void removeServer(String name) {
        McpClient client = clients.remove(name);
        configs.remove(name);
        if (client != null) {
            try {
                client.close();
            } catch (Exception e) {
                Log.errorf("Error closing MCP client %s: %s", name, e.getMessage());
            }
        }
    }

    public List<McpServerConfig> listServers() {
        return new ArrayList<>(configs.values());
    }

    public List<ToolSpecification> getAllTools() {
        List<ToolSpecification> allTools = new ArrayList<>();
        for (Map.Entry<String, McpClient> entry : clients.entrySet()) {
            try {
                List<ToolSpecification> tools = entry.getValue().listTools();
                allTools.addAll(tools);
            } catch (Exception e) {
                Log.errorf("Error listing tools for client %s: %s", entry.getKey(), e.getMessage());
            }
        }
        return allTools;
    }

    public String executeTool(ToolExecutionRequest request) {
        // We need to find which client has this tool.
        // This is inefficient if we have many clients/tools.
        // A better way is to cache tool->client mapping.
        
        Exception lastException = null;
        boolean toolFound = false;
        
        for (Map.Entry<String, McpClient> entry : clients.entrySet()) {
            try {
                // Check if client has the tool
                // Optimization: Cache this
                List<ToolSpecification> tools = entry.getValue().listTools();
                boolean hasTool = tools.stream().anyMatch(t -> t.name().equals(request.name()));
                
                if (hasTool) {
                    toolFound = true;
                    
                    // Registra início da execução
                    String requestId = mcpEventService.getCurrentRequestId();
                    Log.infof("🔍 Executando tool '%s' - RequestId atual no thread: %s", request.name(), requestId);
                    
                    if (requestId != null) {
                        McpCallEvent callingEvent = new McpCallEvent(requestId, request.name(), "calling");
                        mcpEventService.addEvent(callingEvent);
                        Log.infof("[MCP-EVENT] Tool iniciada: %s (RequestId: %s)", request.name(), requestId);
                    } else {
                        Log.warnf("⚠️ RequestId é null ao executar tool '%s' - eventos MCP não serão registrados", request.name());
                    }
                    
                    try {
                        // Executa a tool e retorna o resultado (mesmo que seja um erro do servidor MCP)
                        String result = entry.getValue().executeTool(request);
                        Log.debugf("Tool '%s' executada com sucesso no servidor '%s'", request.name(), entry.getKey());
                        
                        // Registra conclusão
                        if (requestId != null) {
                            McpCallEvent completedEvent = new McpCallEvent(requestId, request.name(), "completed");
                            mcpEventService.addEvent(completedEvent);
                            Log.infof("[MCP-EVENT] Tool completada: %s (RequestId: %s)", request.name(), requestId);
                        }
                        
                        return result;
                    } catch (Exception e) {
                        // Registra erro
                        if (requestId != null) {
                            McpCallEvent errorEvent = new McpCallEvent(requestId, request.name(), "error");
                            mcpEventService.addEvent(errorEvent);
                            Log.errorf("[MCP-EVENT] Tool com erro: %s (RequestId: %s)", request.name(), requestId);
                        }
                        throw e;
                    }
                }
            } catch (Exception e) {
                // Se a tool foi encontrada mas houve erro na execução, guarda a exceção
                if (toolFound) {
                    lastException = e;
                    Log.errorf("Erro ao executar tool '%s' no cliente %s: %s", request.name(), entry.getKey(), e.getMessage());
                } else {
                    // Se ainda está procurando a tool, apenas loga
                    Log.debugf("Tool '%s' não encontrada no cliente %s ou erro ao listar tools", request.name(), entry.getKey());
                }
            }
        }
        
        // Se a tool foi encontrada mas houve erro na execução, lança a exceção original
        if (toolFound && lastException != null) {
            throw new RuntimeException("Erro ao executar tool '" + request.name() + "': " + lastException.getMessage(), lastException);
        }
        
        // Tool não encontrada em nenhum servidor
        throw new RuntimeException("Tool not found: " + request.name());
    }
}
