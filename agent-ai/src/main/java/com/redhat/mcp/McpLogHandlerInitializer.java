package com.redhat.mcp;

import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import java.util.logging.Logger;

/**
 * Inicializa o handler de logs do MCP na inicialização da aplicação
 */
@ApplicationScoped
public class McpLogHandlerInitializer {
    
    @Inject
    McpLogHandler mcpLogHandler;
    
    void onStart(@Observes StartupEvent ev) {
        // Obtém o logger do MCP Transport usando java.util.logging
        Logger mcpLogger = Logger.getLogger("io.quarkiverse.langchain4j.mcp.runtime.http.QuarkusStreamableHttpMcpTransport");
        
        // Adiciona nosso handler customizado
        mcpLogger.addHandler(mcpLogHandler);
        
        io.quarkus.logging.Log.info("MCP Log Handler inicializado com sucesso");
    }
}
