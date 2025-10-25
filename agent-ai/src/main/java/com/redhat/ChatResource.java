package com.redhat;

import java.util.ArrayList;
import java.util.List;

import org.jboss.resteasy.reactive.RestStreamElementType;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.memory.chat.ChatMemoryProvider;
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

    /**
     * Endpoint tradicional que retorna a resposta completa
     */
    @POST
    @Path("/message")
    public String sendMessage(ChatRequest request) {
        String memoryId = request.sessionId() != null ? request.sessionId() : "default";
        return agent.sendMessage(memoryId, request.message());
    }

    /**
     * Endpoint com streaming usando SSE (Server-Sent Events)
     */
    @POST
    @Path("/stream")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    @RestStreamElementType(MediaType.TEXT_PLAIN)
    public Multi<String> streamMessage(ChatRequest request) {
        String memoryId = request.sessionId() != null ? request.sessionId() : "default";
        return agent.sendMessageStreaming(memoryId, request.message());
    }

    /**
     * Endpoint para limpar a memória de uma sessão
     */
    @DELETE
    @Path("/memory/{sessionId}")
    public void clearMemory(@PathParam("sessionId") String sessionId) {
        chatMemoryProvider.get(sessionId).clear();
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
        String sessionId
    ) {}

    /**
     * Record para retornar mensagens do histórico
     */
    public record MessageDTO(
        String role,
        String content
    ) {}
}
