package com.redhat;

import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import io.quarkiverse.langchain4j.RegisterAiService;
import io.quarkiverse.langchain4j.RegisterAiService.BeanChatMemoryProviderSupplier;
import io.quarkiverse.langchain4j.mcp.runtime.McpToolBox;
import io.smallrye.mutiny.Multi;
import jakarta.enterprise.context.ApplicationScoped;

@RegisterAiService(
    modelName = "my-model",
    chatMemoryProviderSupplier = BeanChatMemoryProviderSupplier.class
)
@SystemMessage("""
    Você é um assistente de AI especializado em análise de clusters OpenShift/Kubernetes. 
    
    Sempre responda em markdown usando:
    - Listas para enumerações
    - Tabelas para dados estruturados
    - Blocos de código para logs e YAML
    - Formatação adequada para melhorar a legibilidade
    """)
@ApplicationScoped
public interface AgentBBDW {
    
    // Métodos COM MCP Tools habilitado
    @McpToolBox("k8s-server")
    @SystemMessage("""
        Você é um assistente de AI especializado em análise de clusters OpenShift/Kubernetes. 
        Você tem acesso a ferramentas para consultar informações do cluster em tempo real.
        
        Sempre responda em markdown usando:
        - Listas para enumerações
        - Tabelas para dados estruturados
        - Blocos de código para logs e YAML
        - Formatação adequada para melhorar a legibilidade
        
        Ao analisar o cluster, seja proativo em buscar informações relevantes usando as ferramentas disponíveis.
        Só faça chamadas para o MCP k8s-server quando for necessário.
        """)
    String sendMessageWithMcp(
        @MemoryId String memoryId,
        @UserMessage String message
    );

    @McpToolBox("k8s-server")
    @SystemMessage("""
        Você é um assistente de AI especializado em análise de clusters OpenShift/Kubernetes. 
        Você tem acesso a ferramentas para consultar informações do cluster em tempo real.
        
        Sempre responda em markdown usando:
        - Listas para enumerações
        - Tabelas para dados estruturados
        - Blocos de código para logs e YAML
        - Formatação adequada para melhorar a legibilidade
        
        Ao analisar o cluster, seja proativo em buscar informações relevantes usando as ferramentas disponíveis.
        Só faça chamadas para o MCP k8s-server quando for necessário.
        """)
    Multi<String> sendMessageStreamingWithMcp(
        @MemoryId String memoryId,
        @UserMessage String message
    );
    
    // Métodos SEM MCP Tools (apenas chat)
    String sendMessage(
        @MemoryId String memoryId,
        @UserMessage String message
    );

    Multi<String> sendMessageStreaming(
        @MemoryId String memoryId,
        @UserMessage String message
    );
}
