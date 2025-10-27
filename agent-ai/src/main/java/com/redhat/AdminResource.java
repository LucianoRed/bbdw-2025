package com.redhat;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

/**
 * Endpoints administrativos para gerenciamento do sistema
 * 
 * Este resource serve como índice para os endpoints administrativos.
 * Os endpoints foram separados em recursos específicos:
 * 
 * - /admin/rag/* - Gerenciamento RAG (ver RagResource.java)
 * - /admin/compaction/* - Gerenciamento de compactação de memória (ver CompactionResource.java)
 * - /admin/mcp/config - Configuração MCP Server
 */
@Path("/admin")
@Produces(MediaType.APPLICATION_JSON)
public class AdminResource {
    
    @Inject
    @ConfigProperty(name = "quarkus.langchain4j.mcp.k8s-server.url")
    String mcpServerUrl;
    
    @Inject
    @ConfigProperty(name = "quarkus.langchain4j.mcp.k8s-server.transport-type")
    String mcpTransportType;
    
    @Inject
    @ConfigProperty(name = "quarkus.langchain4j.mcp.k8s-server.log-requests")
    boolean mcpLogRequests;
    
    @Inject
    @ConfigProperty(name = "quarkus.langchain4j.mcp.k8s-server.log-responses")
    boolean mcpLogResponses;
    
    @Inject
    @ConfigProperty(name = "quarkus.langchain4j.mcp.k8s-server.tool-execution-timeout")
    String mcpToolTimeout;
    
    /**
     * Retorna informações sobre os endpoints administrativos disponíveis
     */
    @GET
    public AdminInfoResult getAdminInfo() {
        return new AdminInfoResult(
            "Admin API - BBDW 2025 Agent AI",
            "v1.0",
            new String[] {
                "GET /admin - Esta página",
                "GET /admin/mcp/config - Configuração MCP Server",
                "POST /admin/rag/ingest - Ingere documentos no vector store",
                "POST /admin/rag/reingest - Re-ingere todos os documentos",
                "GET /admin/rag/status - Status da ingestão",
                "POST /admin/rag/upload - Upload de documento",
                "GET /admin/rag/documents - Lista documentos",
                "DELETE /admin/rag/documents/{filename} - Remove documento",
                "POST /admin/compaction/force - Força compactação de memórias",
                "POST /admin/compaction/enable - Habilita job de compactação",
                "POST /admin/compaction/disable - Desabilita job de compactação",
                "GET /admin/compaction/status - Status do job de compactação",
                "GET /admin/compaction/redis/messages/{sessionId} - Mensagens de uma sessão",
                "GET /admin/compaction/redis/sessions - Lista todas as sessões"
            }
        );
    }
    
    /**
     * Retorna a configuração atual do MCP Server
     */
    @GET
    @Path("/mcp/config")
    public McpConfigResult getMcpConfig() {
        return new McpConfigResult(
            mcpServerUrl,
            mcpTransportType,
            mcpLogRequests,
            mcpLogResponses,
            mcpToolTimeout
        );
    }
    
    public record AdminInfoResult(String name, String version, String[] endpoints) {}
    
    public record McpConfigResult(
        String url,
        String transportType,
        boolean logRequests,
        boolean logResponses,
        String toolExecutionTimeout
    ) {}
}

