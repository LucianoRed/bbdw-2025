package com.redhat.compaction;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import com.redhat.redis.RedisChatMemoryStore;
import com.redhat.redis.RedisService;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.UserMessage;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class ChatMemoryCompactionService {
    
    @Inject
    RedisService redisService;
    
    @Inject
    RedisChatMemoryStore chatMemoryStore;
    
    @Inject
    ChatSummaryAgent summaryAgent;
    
    // Configurações
    private static final int MIN_MESSAGES_TO_COMPACT = 8; // Mínimo de mensagens para compactar
    private static final int MESSAGES_TO_KEEP_RECENT = 6;   // Últimas N mensagens a manter intactas
    private static final String CHAT_MEMORY_PATTERN = "chat-memory:*";
    
    public int getMinMessagesToCompact() {
        return MIN_MESSAGES_TO_COMPACT;
    }
    
    /**
     * Compacta todas as memórias de chat (chamado manualmente)
     */
    public void compactChatMemories() {
        Log.info("🔄 Iniciando compactação de memórias de chat...");
        
        try {
            // Busca todas as chaves de chat-memory
            List<String> memoryKeys = redisService.getKeys(CHAT_MEMORY_PATTERN);
            Log.infof("📊 Encontradas %d sessões de chat para análise", memoryKeys.size());
            
            int compactedSessions = 0;
            int tokensSaved = 0;
            
            for (String memoryKey : memoryKeys) {
                try {
                    // Extrai o memoryId da chave (remove o prefixo "chat-memory:")
                    String memoryId = memoryKey.replace("chat-memory:", "");
                    
                    // Pula sessões temporárias (sem memória)
                    if (memoryId.startsWith("temp-")) {
                        continue;
                    }
                    
                    int savedTokens = compactMemoryIfNeeded(memoryId);
                    if (savedTokens > 0) {
                        compactedSessions++;
                        tokensSaved += savedTokens;
                    }
                } catch (Exception e) {
                    Log.errorf(e, "❌ Erro ao compactar sessão %s", memoryKey);
                }
            }
            
            if (compactedSessions > 0) {
                Log.infof("✅ Compactação concluída: %d sessões compactadas, ~%d tokens economizados", 
                         compactedSessions, tokensSaved);
            } else {
                Log.info("ℹ️ Nenhuma sessão precisou de compactação");
            }
            
        } catch (Exception e) {
            Log.error("❌ Erro ao executar compactação", e);
        }
    }
    
    /**
     * Verifica se uma sessão pode ser compactada
     * @return true se tem mensagens suficientes para compactar
     */
    public boolean canCompact(String memoryId) {
        List<ChatMessage> messages = chatMemoryStore.getMessages(memoryId);
        return messages.size() >= MIN_MESSAGES_TO_COMPACT;
    }
    
    /**
     * Retorna quantas mensagens existem em uma sessão
     */
    public int getMessageCount(String memoryId) {
        List<ChatMessage> messages = chatMemoryStore.getMessages(memoryId);
        return messages.size();
    }
    
    /**
     * Compacta uma sessão específica e retorna estatísticas
     */
    public CompactionStats compactSession(String memoryId) {
        List<ChatMessage> messages = chatMemoryStore.getMessages(memoryId);
        int messagesBefore = messages.size();
        
        // Se não tem mensagens suficientes, não compacta
        if (messagesBefore < MIN_MESSAGES_TO_COMPACT) {
            return new CompactionStats(false, messagesBefore, messagesBefore, 0, "Mensagens insuficientes para compactar");
        }
        
        Log.infof("🔍 Compactando sessão %s com %d mensagens", memoryId, messagesBefore);
        
        // Separa mensagens antigas das recentes
        int splitIndex = messagesBefore - MESSAGES_TO_KEEP_RECENT;
        List<ChatMessage> oldMessages = messages.subList(0, splitIndex);
        List<ChatMessage> recentMessages = messages.subList(splitIndex, messagesBefore);
        
        // Calcula tokens antes da compactação
        int tokensBefore = estimateTokens(oldMessages);
        
        // Cria o histórico de conversa para resumir
        StringBuilder conversationHistory = new StringBuilder();
        for (ChatMessage msg : oldMessages) {
            if (msg instanceof UserMessage userMsg) {
                conversationHistory.append("Usuário: ").append(userMsg.singleText()).append("\n\n");
            } else if (msg instanceof AiMessage aiMsg) {
                conversationHistory.append("Assistente: ").append(aiMsg.text()).append("\n\n");
            }
        }
        
        try {
            // Gera o resumo usando a IA
            Log.infof("🤖 Gerando resumo para %d mensagens antigas...", oldMessages.size());
            String summary = summaryAgent.summarizeMessages(conversationHistory.toString());
            
            // Calcula tokens depois da compactação
            int tokensAfter = estimateTokens(summary);
            int tokensSaved = tokensBefore - tokensAfter;
            
            // Cria nova lista de mensagens: [SystemMessage com resumo] + [mensagens recentes]
            List<ChatMessage> compactedMessages = new ArrayList<>();
            
            // Adiciona o resumo como SystemMessage
            SystemMessage summaryMessage = SystemMessage.from(
                "📋 Resumo da conversa anterior (gerado automaticamente em " + 
                LocalDateTime.now().toString() + "):\n\n" + summary
            );
            compactedMessages.add(summaryMessage);
            
            // Adiciona as mensagens recentes
            compactedMessages.addAll(recentMessages);
            
            // Atualiza no Redis
            chatMemoryStore.updateMessages(memoryId, compactedMessages);
            
            int messagesAfter = compactedMessages.size();
            
            Log.infof("✅ Sessão %s compactada: %d → %d mensagens (~%d tokens economizados)", 
                     memoryId, messagesBefore, messagesAfter, tokensSaved);
            
            return new CompactionStats(true, messagesBefore, messagesAfter, tokensSaved, "Compactação realizada com sucesso");
            
        } catch (Exception e) {
            Log.errorf(e, "❌ Erro ao resumir mensagens da sessão %s", memoryId);
            return new CompactionStats(false, messagesBefore, messagesBefore, 0, "Erro ao compactar: " + e.getMessage());
        }
    }
    
    /**
     * Compacta as mensagens de uma sessão se necessário
     * @return número estimado de tokens economizados, ou 0 se não compactou
     */
    private int compactMemoryIfNeeded(String memoryId) {
        List<ChatMessage> messages = chatMemoryStore.getMessages(memoryId);
        
        // Se não tem mensagens suficientes, não compacta
        if (messages.size() < MIN_MESSAGES_TO_COMPACT) {
            return 0;
        }
        
        Log.infof("🔍 Analisando sessão %s com %d mensagens", memoryId, messages.size());
        
        // Separa mensagens antigas das recentes
        int splitIndex = messages.size() - MESSAGES_TO_KEEP_RECENT;
        List<ChatMessage> oldMessages = messages.subList(0, splitIndex);
        List<ChatMessage> recentMessages = messages.subList(splitIndex, messages.size());
        
        // Calcula tokens antes da compactação (estimativa: ~4 chars = 1 token)
        int tokensBefore = estimateTokens(oldMessages);
        
        // Cria o histórico de conversa para resumir
        StringBuilder conversationHistory = new StringBuilder();
        for (ChatMessage msg : oldMessages) {
            if (msg instanceof UserMessage userMsg) {
                conversationHistory.append("Usuário: ").append(userMsg.singleText()).append("\n\n");
            } else if (msg instanceof AiMessage aiMsg) {
                conversationHistory.append("Assistente: ").append(aiMsg.text()).append("\n\n");
            }
            // Ignora SystemMessage no resumo
        }
        
        try {
            // Gera o resumo usando a IA
            Log.infof("🤖 Gerando resumo para %d mensagens antigas...", oldMessages.size());
            String summary = summaryAgent.summarizeMessages(conversationHistory.toString());
            
            // Calcula tokens depois da compactação
            int tokensAfter = estimateTokens(summary);
            int tokensSaved = tokensBefore - tokensAfter;
            
            // Cria nova lista de mensagens: [SystemMessage com resumo] + [mensagens recentes]
            List<ChatMessage> compactedMessages = new ArrayList<>();
            
            // Adiciona o resumo como SystemMessage
            SystemMessage summaryMessage = SystemMessage.from(
                "📋 Resumo da conversa anterior (gerado automaticamente em " + 
                LocalDateTime.now().toString() + "):\n\n" + summary
            );
            compactedMessages.add(summaryMessage);
            
            // Adiciona as mensagens recentes
            compactedMessages.addAll(recentMessages);
            
            // Atualiza no Redis
            chatMemoryStore.updateMessages(memoryId, compactedMessages);
            
            Log.infof("✅ Sessão %s compactada: %d → %d mensagens (~%d tokens economizados)", 
                     memoryId, messages.size(), compactedMessages.size(), tokensSaved);
            
            return tokensSaved;
            
        } catch (Exception e) {
            Log.errorf(e, "❌ Erro ao resumir mensagens da sessão %s", memoryId);
            return 0;
        }
    }
    
    /**
     * Estima o número de tokens em uma lista de mensagens
     * Regra simples: ~4 caracteres = 1 token
     */
    private int estimateTokens(List<ChatMessage> messages) {
        int totalChars = 0;
        for (ChatMessage msg : messages) {
            if (msg instanceof UserMessage userMsg) {
                String text = userMsg.singleText();
                if (text != null) {
                    totalChars += text.length();
                }
            } else if (msg instanceof AiMessage aiMsg) {
                String text = aiMsg.text();
                if (text != null) {
                    totalChars += text.length();
                }
            }
        }
        return totalChars / 4;
    }
    
    /**
     * Estima o número de tokens em uma string
     */
    private int estimateTokens(String text) {
        return text.length() / 4;
    }
    
    /**
     * Estatísticas de compactação
     */
    public record CompactionStats(
        boolean success,
        int messagesBefore,
        int messagesAfter,
        int tokensSaved,
        String message
    ) {}
}
