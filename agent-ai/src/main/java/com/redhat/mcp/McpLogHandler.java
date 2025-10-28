package com.redhat.mcp;

import io.quarkus.logging.Log;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.logging.Handler;
import java.util.logging.LogRecord;

/**
 * Handler customizado para interceptar logs do MCP Transport
 * Monitora logs da classe QuarkusStreamableHttpMcpTransport
 */
@ApplicationScoped
public class McpLogHandler extends Handler {
    
    @Inject
    McpEventService mcpEventService;
    
    private static final String MCP_TRANSPORT_LOGGER = "io.quarkiverse.langchain4j.mcp.runtime.http.QuarkusStreamableHttpMcpTransport";
    
    @Override
    public void publish(LogRecord record) {
        // Só processa logs do MCP Transport
        if (record.getLoggerName() != null && 
            record.getLoggerName().equals(MCP_TRANSPORT_LOGGER)) {
            
            String message = record.getMessage();
            if (message != null) {
                // Passa a linha de log para o serviço processar
                try {
                    mcpEventService.processLogLine(message);
                } catch (Exception e) {
                    Log.errorf(e, "Erro ao processar log do MCP: %s", message);
                }
            }
        }
    }
    
    @Override
    public void flush() {
        // Não precisa fazer nada
    }
    
    @Override
    public void close() throws SecurityException {
        // Não precisa fazer nada
    }
}
