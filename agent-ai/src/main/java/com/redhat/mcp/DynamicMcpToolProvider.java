package com.redhat.mcp;

import java.util.List;

import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.service.tool.ToolExecutor;
import dev.langchain4j.service.tool.ToolProvider;
import dev.langchain4j.service.tool.ToolProviderRequest;
import dev.langchain4j.service.tool.ToolProviderResult;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/**
 * Provider customizado que expõe as tools dos MCP servers dinâmicos
 * registrados no McpManager para os AI Agents do Quarkus LangChain4j.
 * 
 * Este provider:
 * 1. Retorna as tool specifications dos servidores MCP
 * 2. Fornece um executor que delega para o McpManager
 * 
 * Para usar este provider em um AI Service, configure:
 * @RegisterAiService(toolProviderSupplier = DynamicMcpToolProviderSupplier.class)
 */
@ApplicationScoped
public class DynamicMcpToolProvider implements ToolProvider {

    @Inject
    McpManager mcpManager;
    
    @Inject
    DynamicMcpToolExecutor toolExecutor;

    @Override
    public ToolProviderResult provideTools(ToolProviderRequest request) {
        try {
            // Verifica se há servidores MCP registrados
            if (mcpManager.listServers().isEmpty()) {
                Log.debug("Nenhum servidor MCP dinâmico registrado");
                // Retorna resultado vazio - sem tools disponíveis
                return ToolProviderResult.builder().build();
            }
            
            // Obtém todas as tools disponíveis (com cache de 30s)
            List<ToolSpecification> toolSpecs = toolExecutor.getAvailableTools();
            
            if (toolSpecs.isEmpty()) {
                Log.debug("Nenhuma tool MCP disponível nos servidores registrados");
                return ToolProviderResult.builder().build();
            }
            
            // Cria um builder e adiciona cada tool com seu executor
            var builder = ToolProviderResult.builder();
            for (ToolSpecification spec : toolSpecs) {
                builder.add(spec, new McpToolExecutor(spec, mcpManager));
            }
            
            Log.infof("DynamicMcpToolProvider disponibilizando %d tools dinâmicas", toolSpecs.size());
            
            return builder.build();
                    
        } catch (Exception e) {
            Log.errorf("Erro ao fornecer tools dinâmicas: %s", e.getMessage(), e);
            return ToolProviderResult.builder().build();
        }
    }
    
    /**
     * Executor que delega execução para o McpManager
     */
    private static class McpToolExecutor implements ToolExecutor {
        private final McpManager mcpManager;
        
        public McpToolExecutor(ToolSpecification spec, McpManager mcpManager) {
            // spec não é usado - mantido no construtor para compatibilidade
            this.mcpManager = mcpManager;
        }
        
        @Override
        public String execute(ToolExecutionRequest request, Object memoryId) {
            try {
                Log.debugf("Executando tool MCP: %s", request.name());
                return mcpManager.executeTool(request);
            } catch (Exception e) {
                String error = String.format("Erro ao executar tool '%s': %s", 
                                           request.name(), e.getMessage());
                Log.error(error, e);
                return error;
            }
        }
    }
}
