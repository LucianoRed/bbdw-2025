package com.redhat.chat;

import com.redhat.mcp.DynamicMcpToolProviderSupplier;
import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import io.quarkiverse.langchain4j.RegisterAiService;
import io.quarkiverse.langchain4j.RegisterAiService.BeanChatMemoryProviderSupplier;
import jakarta.enterprise.context.ApplicationScoped;

@RegisterAiService(
    modelName = "gpt5-model",
    chatMemoryProviderSupplier = BeanChatMemoryProviderSupplier.class,
    toolProviderSupplier = DynamicMcpToolProviderSupplier.class
)
@ApplicationScoped
public interface AgentGPT5 {
    
    @SystemMessage("""
        Você é um assistente de AI especializado em análise de clusters OpenShift/Kubernetes. 
        Você tem acesso a ferramentas MCP cadastradas dinamicamente para consultar informações do cluster em tempo real.
        
        Sempre responda em markdown usando:
        - Listas para enumerações
        - Tabelas para dados estruturados
        - Blocos de código para logs e YAML
        - Formatação adequada para melhorar a legibilidade
        
        Ao analisar o cluster, seja proativo em buscar informações relevantes usando as ferramentas disponíveis.
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
