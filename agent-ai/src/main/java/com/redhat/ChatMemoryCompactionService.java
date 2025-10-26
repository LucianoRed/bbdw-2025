package com.redhat;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.UserMessage;
import io.quarkus.logging.Log;
import io.quarkus.scheduler.Scheduled;
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
    private static final int MIN_MESSAGES_TO_COMPACT = 10; // Mínimo de mensagens para compactar
    private static final int MESSAGES_TO_KEEP_RECENT = 6;   // Últimas N mensagens a manter intactas
    private static final String CHAT_MEMORY_PATTERN = "chat-memory:*";
    
    // Controle de habilitação do job
    private volatile boolean enabled = true;
    
    /**
     * Job agendado que roda a cada 5 minutos para compactar memórias antigas
     */
    @Scheduled(every = "5m", delayed = "1m") // Roda a cada 5 minutos, com delay inicial de 1 minuto
    public void compactChatMemories() {
        if (!enabled) {
            Log.debug("⏸️ Job de compactação está desabilitado - pulando execução");
            return;
        }
        
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
            Log.error("❌ Erro ao executar job de compactação", e);
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
                totalChars += userMsg.singleText().length();
            } else if (msg instanceof AiMessage aiMsg) {
                totalChars += aiMsg.text().length();
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
     * Método manual para forçar compactação (útil para testes)
     */
    public void forceCompaction() {
        Log.info("🔧 Compactação manual iniciada");
        compactChatMemories();
    }
    
    /**
     * Habilita o job de compactação
     */
    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
        Log.infof("⚙️ Job de compactação %s", enabled ? "habilitado" : "desabilitado");
    }
    
    /**
     * Verifica se o job está habilitado
     */
    public boolean isEnabled() {
        return enabled;
    }
}
