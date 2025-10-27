package com.redhat.chat;

import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import io.quarkiverse.langchain4j.RegisterAiService;
import io.quarkiverse.langchain4j.RegisterAiService.BeanChatMemoryProviderSupplier;
import io.quarkiverse.langchain4j.mcp.runtime.McpToolBox;
import jakarta.enterprise.context.ApplicationScoped;

@RegisterAiService(
    modelName = "gpt35-model",
    chatMemoryProviderSupplier = BeanChatMemoryProviderSupplier.class
)
@ApplicationScoped
public interface AgentGPT35 {
    
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
    
    @SystemMessage("""
        Você é um assistente de AI especializado em análise de clusters OpenShift/Kubernetes. 
        
        Sempre responda em markdown usando:
        - Listas para enumerações
        - Tabelas para dados estruturados
        - Blocos de código para logs e YAML
        - Formatação adequada para melhorar a legibilidade
        """)
    String sendMessage(
        @MemoryId String memoryId,
        @UserMessage String message
    );
}
