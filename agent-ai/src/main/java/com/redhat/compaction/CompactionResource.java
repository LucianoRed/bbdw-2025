package com.redhat.compaction;

import java.util.ArrayList;
import java.util.List;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import com.redhat.redis.RedisChatMemoryStore;
import com.redhat.redis.RedisService;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.UserMessage;

/**
 * Endpoints de gerenciamento da compactação de memória de chat
 */
@Path("/admin/compaction")
@Produces(MediaType.APPLICATION_JSON)
public class CompactionResource {
    
    @Inject
    ChatMemoryCompactionService compactionService;
    
    @Inject
    RedisChatMemoryStore chatMemoryStore;
    
    @Inject
    RedisService redisService;
    
    /**
     * Verifica o status de compactação para uma sessão
     */
    @GET
    @Path("/can-compact/{sessionId}")
    public CompactionStatusResult canCompact(@PathParam("sessionId") String sessionId) {
        boolean canCompact = compactionService.canCompact(sessionId);
        int messageCount = compactionService.getMessageCount(sessionId);
        int minMessages = compactionService.getMinMessagesToCompact();
        int missingMessages = Math.max(0, minMessages - messageCount);
        
        return new CompactionStatusResult(
            canCompact, 
            messageCount, 
            minMessages, 
            missingMessages
        );
    }
    
    /**
     * Compacta uma sessão específica e retorna estatísticas
     */
    @POST
    @Path("/session/{sessionId}")
    public ChatMemoryCompactionService.CompactionStats compactSession(@PathParam("sessionId") String sessionId) {
        return compactionService.compactSession(sessionId);
    }
    
    /**
     * Executa a compactação de memórias de chat manualmente
     */
    @POST
    public CompactionResult compactMemories() {
        compactionService.compactChatMemories();
        return new CompactionResult("Compactação concluída com sucesso", System.currentTimeMillis());
    }
    
    /**
     * Retorna as mensagens brutas do Redis para uma sessão
     */
    @GET
    @Path("/redis/messages/{sessionId}")
    public RedisMessagesResult getRedisMessages(@PathParam("sessionId") String sessionId) {
        try {
            List<ChatMessage> messages = chatMemoryStore.getMessages(sessionId);
            List<RedisMessageDTO> messageDTOs = new ArrayList<>();
            
            int index = 1;
            for (ChatMessage msg : messages) {
                String role = "unknown";
                String content = null;
                
                if (msg instanceof UserMessage userMsg) {
                    role = "user";
                    content = userMsg.singleText();
                } else if (msg instanceof AiMessage aiMsg) {
                    role = "ai";
                    content = aiMsg.text();
                } else if (msg instanceof SystemMessage sysMsg) {
                    role = "system";
                    content = sysMsg.text();
                } else {
                    // Para outros tipos de mensagem, tenta obter o tipo e ignora se não tiver conteúdo útil
                    role = msg.getClass().getSimpleName().toLowerCase().replace("message", "");
                    content = msg.toString();
                }
                
                // Só adiciona mensagens que tenham conteúdo
                if (content != null && !content.trim().isEmpty()) {
                    messageDTOs.add(new RedisMessageDTO(index++, role, content));
                }
            }
            
            return new RedisMessagesResult(sessionId, messageDTOs.size(), messageDTOs);
        } catch (Exception e) {
            return new RedisMessagesResult(sessionId, 0, new ArrayList<>());
        }
    }
    
    /**
     * Lista todas as sessões de chat no Redis
     */
    @GET
    @Path("/redis/sessions")
    public SessionsListResult listSessions() {
        List<String> keys = redisService.getKeys("chat-memory:*");
        List<SessionInfo> sessions = new ArrayList<>();
        
        for (String key : keys) {
            String sessionId = key.replace("chat-memory:", "");
            long messageCount = redisService.getListLength(key);
            sessions.add(new SessionInfo(sessionId, messageCount));
        }
        
        return new SessionsListResult(sessions.size(), sessions);
    }
    
    // Records para respostas
    public record CompactionResult(String message, long timestamp) {}
    public record CompactionStatusResult(boolean canCompact, int messageCount, int minMessages, int missingMessages) {}
    public record RedisMessageDTO(int index, String role, String content) {}
    public record RedisMessagesResult(String sessionId, int messageCount, List<RedisMessageDTO> messages) {}
    public record SessionInfo(String sessionId, long messageCount) {}
    public record SessionsListResult(int totalSessions, List<SessionInfo> sessions) {}
}
