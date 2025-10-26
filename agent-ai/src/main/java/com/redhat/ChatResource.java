package com.redhat;

import java.util.ArrayList;
import java.util.List;

import org.jboss.resteasy.reactive.RestStreamElementType;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.memory.chat.ChatMemoryProvider;
import dev.langchain4j.store.memory.chat.ChatMemoryStore;
import io.smallrye.common.annotation.RunOnVirtualThread;
import io.smallrye.mutiny.Multi;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/chat")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ChatResource {

    @Inject
    AgentBBDW agent;

    @Inject
    ChatMemoryProvider chatMemoryProvider;

    @Inject
    ChatMemoryStore chatMemoryStore;

    /**
     * Endpoint tradicional que retorna a resposta completa
     */
    @POST
    @Path("/message")
    @RunOnVirtualThread
    public String sendMessage(ChatRequest request) {
        // Se sessionId for null, gera um ID único para esta requisição (sem memória)
        // Se sessionId existir, usa ele para manter o histórico
        String memoryId = request.sessionId() != null 
            ? request.sessionId() 
            : "temp-" + System.currentTimeMillis() + "-" + Math.random();
        
        boolean useMcp = request.useMcp() != null ? request.useMcp() : false;
        
        if (useMcp) {
            return agent.sendMessageWithMcp(memoryId, request.message());
        } else {
            return agent.sendMessage(memoryId, request.message());
        }
    }

    /**
     * Endpoint com streaming usando SSE (Server-Sent Events)
     */
    @POST
    @Path("/stream")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    @RestStreamElementType(MediaType.TEXT_PLAIN)
    public Multi<String> streamMessage(ChatRequest request) {
        // Se sessionId for null, gera um ID único para esta requisição (sem memória)
        // Se sessionId existir, usa ele para manter o histórico
        String memoryId = request.sessionId() != null 
            ? request.sessionId() 
            : "temp-" + System.currentTimeMillis() + "-" + Math.random();
        
        boolean useMcp = request.useMcp() != null ? request.useMcp() : false;
        
        if (useMcp) {
            return agent.sendMessageStreamingWithMcp(memoryId, request.message());
        } else {
            return agent.sendMessageStreaming(memoryId, request.message());
        }
    }

    /**
     * Endpoint para limpar a memória de uma sessão
     * Limpa tanto a memória em cache quanto os dados persistidos no Redis
     */
    @DELETE
    @Path("/memory/{sessionId}")
    public void clearMemory(@PathParam("sessionId") String sessionId) {
        // Limpa a memória em cache
        chatMemoryProvider.get(sessionId).clear();
        
        // Limpa os dados do Redis explicitamente
        chatMemoryStore.deleteMessages(sessionId);
    }

    /**
     * Endpoint para recuperar o histórico de mensagens de uma sessão
     */
    @GET
    @Path("/history/{sessionId}")
    public List<MessageDTO> getHistory(@PathParam("sessionId") String sessionId) {
        var messages = chatMemoryProvider.get(sessionId).messages();
        List<MessageDTO> history = new ArrayList<>();
        
        for (ChatMessage msg : messages) {
            if (msg instanceof UserMessage userMsg) {
                history.add(new MessageDTO("user", userMsg.singleText()));
            } else if (msg instanceof AiMessage aiMsg) {
                history.add(new MessageDTO("ai", aiMsg.text()));
            }
            // Ignora SystemMessage
        }
        
        return history;
    }

    /**
     * Record para receber a requisição do chat
     */
    public record ChatRequest(
        String message,
        String sessionId,
        Boolean useMcp
    ) {}

    /**
     * Record para retornar mensagens do histórico
     */
    public record MessageDTO(
        String role,
        String content
    ) {}
}
