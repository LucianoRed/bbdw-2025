package com.redhat.chat;

import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import io.quarkiverse.langchain4j.RegisterAiService;
import io.quarkiverse.langchain4j.RegisterAiService.BeanChatMemoryProviderSupplier;
import io.quarkiverse.langchain4j.mcp.runtime.McpToolBox;
import jakarta.enterprise.context.ApplicationScoped;

/**
 * Agent que usa servidor MCP "teste" cadastrado dinamicamente.
 * 
 * NOTA: Este servidor precisa estar configurado no application.properties
 * para que o @McpToolBox funcione. Servidores puramente dinâmicos (sem config)
 * requerem uma abordagem diferente usando ToolProvider.
 */
@RegisterAiService(
    modelName = "gpt5-mini-model",
    chatMemoryProviderSupplier = BeanChatMemoryProviderSupplier.class
)
@ApplicationScoped
public interface AgentWithDynamicMcp {
    
    @McpToolBox("teste")  // Servidor MCP configurado no application.properties
    @SystemMessage("""
        Você é um assistente de AI especializado que tem acesso a ferramentas
        para consultar informações em tempo real sobre clusters Kubernetes.
        
        Você tem acesso a ferramentas (tools) de servidores MCP (Model Context Protocol).
        
        As ferramentas disponíveis incluem:
        - get_live_binpacking: Obtém snapshot de binpacking do cluster  
          Parâmetros: resource (cpu ou memory), ns (opcional, namespaces separados por vírgula)
          
        - get_cluster_overview: Visão geral do cluster com estatísticas
          Sem parâmetros
          
        - get_deployments: Métricas de deployments
          Parâmetros: ns (opcional, namespaces)
          
        - get_services: Informações sobre services
          Parâmetros: ns (opcional, namespaces)
          
        - get_pod_logs: Logs de pods
          Parâmetros obrigatórios: namespace, name
          Parâmetros opcionais: container, tailLines, sinceSeconds, previous, timestamps
          
        - E muitas outras ferramentas de gerenciamento Kubernetes
        
        IMPORTANTE: Use os nomes EXATOS das ferramentas conforme listado acima.
        Por exemplo, para ver binpacking, use 'get_live_binpacking', não 'binpacking'.
        Para ver status do cluster, use 'get_cluster_overview', não 'clusterStatus'.
        
        Sempre responda em português do Brasil, usando markdown com:
        - Listas para enumerações
        - Tabelas para dados estruturados
        - Blocos de código para logs e YAML
        - Formatação adequada para melhorar a legibilidade
        
        Ao analisar informações, seja proativo em buscar dados usando as ferramentas disponíveis.
        """)
    String chat(
        @MemoryId String memoryId,
        @UserMessage String message
    );
}
