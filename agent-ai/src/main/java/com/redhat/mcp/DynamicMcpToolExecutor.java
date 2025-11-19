package com.redhat.mcp;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/**
 * Executor que dinamicamente expõe e executa tools dos servidores MCP.
 * 
 * Esta classe age como um proxy dinâmico que:
 * 1. Consulta as tools disponíveis nos servidores MCP
 * 2. Executa as tools delegando para o McpManager
 * 
 * O LangChain4j descobrirá este bean e seus métodos @Tool automaticamente.
 */
@ApplicationScoped
public class DynamicMcpToolExecutor {

    @Inject
    McpManager mcpManager;
    
    /**
     * Cache de tool specifications para evitar consultas repetidas.
     * Key: tool name, Value: tool specification
     */
    private volatile Map<String, ToolSpecification> toolCache = new HashMap<>();
    
    /**
     * Timestamp da última atualização do cache
     */
    private volatile long lastCacheUpdate = 0;
    
    /**
     * Intervalo de cache em milissegundos (30 segundos)
     */
    private static final long CACHE_TTL = 30_000;

    /**
     * Método genérico que executa qualquer tool MCP dinâmica.
     * 
     * Este método NÃO é usado diretamente pelo AI - serve como fallback.
     * As tools reais são geradas dinamicamente pelo ToolProvider.
     */
    @Tool("""
        Execute a dynamic MCP tool by name with the provided arguments.
        This is a fallback method - specific tools should be called directly when available.
        """)
    public String executeMcpTool(String toolName, String arguments) {
        try {
            Log.debugf("Executando tool MCP dinâmica: %s", toolName);
            
            ToolExecutionRequest request = ToolExecutionRequest.builder()
                    .name(toolName)
                    .arguments(arguments)
                    .build();
            
            return mcpManager.executeTool(request);
            
        } catch (Exception e) {
            String error = String.format("Erro ao executar tool '%s': %s", toolName, e.getMessage());
            Log.error(error, e);
            return error;
        }
    }
    
    /**
     * Obtém todas as tool specifications disponíveis (com cache).
     */
    public List<ToolSpecification> getAvailableTools() {
        long now = System.currentTimeMillis();
        
        // Atualiza cache se expirou
        if (now - lastCacheUpdate > CACHE_TTL) {
            synchronized (this) {
                if (now - lastCacheUpdate > CACHE_TTL) {
                    List<ToolSpecification> tools = mcpManager.getAllTools();
                    Map<String, ToolSpecification> newCache = new HashMap<>();
                    for (ToolSpecification tool : tools) {
                        newCache.put(tool.name(), tool);
                    }
                    toolCache = newCache;
                    lastCacheUpdate = now;
                    Log.debugf("Cache de tools atualizado: %d tools disponíveis", tools.size());
                }
            }
        }
        
        return List.copyOf(toolCache.values());
    }
    
    /**
     * Limpa o cache forçando atualização na próxima chamada.
     */
    public void invalidateCache() {
        lastCacheUpdate = 0;
        Log.debug("Cache de tools MCP invalidado");
    }
}
