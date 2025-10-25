package com.redhat;

import dev.langchain4j.mcp.client.McpClient;
import io.quarkiverse.langchain4j.mcp.runtime.McpClientName;
import io.quarkus.logging.Log;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;

/**
 * Força a inicialização do MCP client na startup da aplicação
 * para evitar timeouts durante streaming.
 */
@ApplicationScoped
public class McpStartup {

    @Inject
    @McpClientName("k8s-server")
    McpClient mcpClient;

    void onStart(@Observes StartupEvent ev) {
        Log.info("Inicializando MCP client de forma eager...");
        try {
            // Força a inicialização do bean chamando checkHealth
            mcpClient.checkHealth();
            Log.info("MCP client inicializado com sucesso!");
        } catch (Exception e) {
            Log.warn("Falha ao inicializar MCP client: " + e.getMessage());
            Log.warn("O MCP estará disponível apenas para requisições não-streaming.");
        }
    }
}
