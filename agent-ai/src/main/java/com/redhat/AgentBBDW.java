package com.redhat;

import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import io.quarkiverse.langchain4j.RegisterAiService;
import io.quarkiverse.langchain4j.RegisterAiService.BeanChatMemoryProviderSupplier;
import io.smallrye.mutiny.Multi;
import jakarta.enterprise.context.ApplicationScoped;

@RegisterAiService(
    modelName = "my-model",
    chatMemoryProviderSupplier = BeanChatMemoryProviderSupplier.class
)
@SystemMessage("""
    Você é um assistente de AI especializado em análise de clusters OpenShift/Kubernetes. 
    Você tem acesso a ferramentas para consultar informações do cluster em tempo real.
    
    Sempre responda em markdown usando:
    - Listas para enumerações
    - Tabelas para dados estruturados
    - Blocos de código para logs e YAML
    - Formatação adequada para melhorar a legibilidade
    
    Ao analisar o cluster, seja proativo em buscar informações relevantes usando as ferramentas disponíveis.
    """)
@ApplicationScoped
public interface AgentBBDW {
    
    String sendMessage(
        @MemoryId String memoryId,
        @UserMessage String message
    );

    Multi<String> sendMessageStreaming(
        @MemoryId String memoryId,
        @UserMessage String message
    );
}
