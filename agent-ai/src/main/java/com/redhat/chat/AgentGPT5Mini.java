package com.redhat.chat;

import com.redhat.mcp.DynamicMcpToolProviderSupplier;
import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import io.quarkiverse.langchain4j.RegisterAiService;
import io.quarkiverse.langchain4j.RegisterAiService.BeanChatMemoryProviderSupplier;
import jakarta.enterprise.context.ApplicationScoped;

@RegisterAiService(
    modelName = "gpt5-mini-model",
    chatMemoryProviderSupplier = BeanChatMemoryProviderSupplier.class,
    toolProviderSupplier = DynamicMcpToolProviderSupplier.class
)
@ApplicationScoped
public interface AgentGPT5Mini {
    
    @SystemMessage("{systemPrompt}")
    String sendMessageWithMcp(
        @MemoryId String memoryId,
        @V("systemPrompt") String systemPrompt,
        @UserMessage String message
    );
    
    @SystemMessage("{systemPrompt}")
    String sendMessage(
        @MemoryId String memoryId,
        @V("systemPrompt") String systemPrompt,
        @UserMessage String message
    );
}
