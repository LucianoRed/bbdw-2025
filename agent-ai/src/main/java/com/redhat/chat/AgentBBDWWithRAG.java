package com.redhat.chat;

import com.redhat.mcp.DynamicMcpToolProviderSupplier;
import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import io.quarkiverse.langchain4j.RegisterAiService;
import io.quarkiverse.langchain4j.RegisterAiService.BeanChatMemoryProviderSupplier;
import jakarta.enterprise.context.ApplicationScoped;

/**
 * Agente com suporte a RAG (Retrieval-Augmented Generation).
 * 
 * Este agente usa um retriever para buscar documentação relevante do OpenShift
 * antes de gerar respostas, fornecendo informações mais precisas e atualizadas.
 * 
 * O retriever é configurado automaticamente pelo Easy RAG do Quarkus.
 */
@RegisterAiService(
    modelName = "my-model",
    chatMemoryProviderSupplier = BeanChatMemoryProviderSupplier.class,
    toolProviderSupplier = DynamicMcpToolProviderSupplier.class
)
@ApplicationScoped
public interface AgentBBDWWithRAG {
    
    @SystemMessage("{systemPrompt}")
    String sendMessageWithMcpAndRAG(
        @MemoryId String memoryId,
        @V("systemPrompt") String systemPrompt,
        @UserMessage String message
    );

    @SystemMessage("{systemPrompt}")
    String sendMessageWithRAG(
        @MemoryId String memoryId,
        @V("systemPrompt") String systemPrompt,
        @UserMessage String message
    );
}
