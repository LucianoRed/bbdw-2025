package com.redhat.feedback;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.redhat.redis.RedisService;
import io.quarkus.logging.Log;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

/**
 * Serviço que gerencia a fila de feedbacks e coordena o processamento assíncrono
 * com análise de sentimento consolidada.
 */
@ApplicationScoped
public class FeedbackService {

    private static final String REDIS_KEY_FEEDBACKS = "dora:feedback:all";
    private static final String REDIS_KEY_ANALYSIS  = "dora:feedback:analysis";
    private static final String REDIS_KEY_CLEARED_AT = "dora:feedback:clearedAt";
    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @Inject
    SentimentAnalysisAgent sentimentAgent;

    @Inject
    FeedbackChatAgent feedbackChatAgent;

    @Inject
    RedisService redisService;

    // Fila thread-safe para processar feedbacks
    private final ConcurrentLinkedQueue<Feedback> feedbackQueue = new ConcurrentLinkedQueue<>();

    // Lista thread-safe de todos os feedbacks recebidos
    private final CopyOnWriteArrayList<Feedback> allFeedbacks = new CopyOnWriteArrayList<>();

    // Análise consolidada atual
    private volatile String currentAnalysis = "";

    // Flag para indicar se há processamento em andamento
    private final AtomicBoolean processing = new AtomicBoolean(false);

    // Epoch millis da última limpeza (0 = nunca limpo)
    private volatile long clearedAt = 0L;

    // Flag para indicar shutdown
    private volatile boolean shuttingDown = false;

    @PostConstruct
    void init() {
        try {
            String feedbacksJson = redisService.getValue(REDIS_KEY_FEEDBACKS);
            if (feedbacksJson != null && !feedbacksJson.isBlank()) {
                List<Feedback> saved = objectMapper.readValue(feedbacksJson, new TypeReference<>() {});
                allFeedbacks.addAll(saved);
                Log.infof("[FeedbackService] %d feedbacks restaurados do Redis", allFeedbacks.size());
            }
        } catch (Exception e) {
            Log.errorf("[FeedbackService] Erro ao restaurar feedbacks do Redis: %s", e.getMessage());
        }
        try {
            String savedAnalysis = redisService.getValue(REDIS_KEY_ANALYSIS);
            if (savedAnalysis != null && !savedAnalysis.isBlank()) {
                currentAnalysis = savedAnalysis;
                Log.info("[FeedbackService] An\u00e1lise de sentimento restaurada do Redis");
            }
        } catch (Exception e) {
            Log.errorf("[FeedbackService] Erro ao restaurar an\u00e1lise do Redis: %s", e.getMessage());
        }
        try {
            String savedClearedAt = redisService.getValue(REDIS_KEY_CLEARED_AT);
            if (savedClearedAt != null && !savedClearedAt.isBlank()) {
                clearedAt = Long.parseLong(savedClearedAt);
            }
        } catch (Exception e) {
            Log.errorf("[FeedbackService] Erro ao restaurar clearedAt do Redis: %s", e.getMessage());
        }
    }

    /**
     * Adiciona um novo feedback à fila para processamento
     */
    public void submitFeedback(String feedbackText) {
        Feedback feedback = new Feedback(feedbackText);
        feedbackQueue.offer(feedback);
        allFeedbacks.add(feedback);
        saveFeedbacksToRedis();
        Log.infof("Feedback recebido: %s (Total: %d, Fila: %d)",
            feedback.id(), allFeedbacks.size(), feedbackQueue.size());
    }

    private void saveFeedbacksToRedis() {
        try {
            redisService.setValue(REDIS_KEY_FEEDBACKS, new ArrayList<>(allFeedbacks));
        } catch (Exception e) {
            Log.errorf("[FeedbackService] Erro ao salvar feedbacks no Redis: %s", e.getMessage());
        }
    }

    /**
     * Processa feedbacks da fila em lote usando Virtual Threads
     */
    public void processBatch() {
        if (processing.compareAndSet(false, true)) {
            try {
                List<Feedback> batch = new ArrayList<>();
                Feedback feedback;
                
                // Drena a fila em um lote
                while ((feedback = feedbackQueue.poll()) != null) {
                    batch.add(feedback);
                }
                
                if (!batch.isEmpty()) {
                    Log.infof("Processando lote de %d feedbacks", batch.size());
                    processAndAnalyze(batch);
                }
            } finally {
                processing.set(false);
            }
        }
    }

    /**
     * Processa um lote de feedbacks e atualiza a análise consolidada
     */
    private void processAndAnalyze(List<Feedback> batch) {
        try {
            // Marca feedbacks como processados
            batch.forEach(fb -> {
                int index = allFeedbacks.indexOf(fb);
                if (index >= 0) {
                    allFeedbacks.set(index, fb.markAsProcessed());
                }
            });

            // Gera análise consolidada com TODOS os feedbacks
            updateConsolidatedAnalysis();
            
            Log.infof("Análise consolidada atualizada com sucesso");
        } catch (Exception e) {
            Log.errorf(e, "Erro ao processar lote de feedbacks");
        }
    }

    /**
     * Atualiza a análise consolidada usando o Agent AI
     */
    private void updateConsolidatedAnalysis() {
        if (shuttingDown) {
            Log.info("Aplicação em shutdown, pulando análise");
            return;
        }
        
        if (allFeedbacks.isEmpty()) {
            currentAnalysis = "Aguardando feedbacks...";
            return;
        }

        try {
            // Prepara resumo dos feedbacks para o agent
            String feedbacksSummary = buildFeedbacksSummary();
            
            Log.infof("Solicitando análise de sentimento para %d feedbacks", allFeedbacks.size());
            
            // Chama o agent para análise
            currentAnalysis = sentimentAgent.analyzeConsolidatedSentiment(feedbacksSummary);

            try {
                redisService.setValue(REDIS_KEY_ANALYSIS, currentAnalysis);
            } catch (Exception re) {
                Log.errorf("[FeedbackService] Erro ao salvar an\u00e1lise no Redis: %s", re.getMessage());
            }

            Log.info("Análise de sentimento gerada com sucesso");
        } catch (Exception e) {
            if (!shuttingDown) {
                Log.errorf(e, "Erro ao gerar análise de sentimento");
            }
        }
    }
    
    /**
     * Marca o serviço como em shutdown para evitar novas chamadas ao agent
     */
    @PreDestroy
    void onShutdown() {
        Log.info("FeedbackService entrando em shutdown");
        shuttingDown = true;
        // Aguarda processamento atual terminar
        int retries = 0;
        while (processing.get() && retries < 10) {
            try {
                Thread.sleep(100);
                retries++;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        Log.info("FeedbackService shutdown concluído");
    }

    /**
     * Constrói um resumo dos feedbacks para enviar ao Agent
     */
    private String buildFeedbacksSummary() {
        StringBuilder summary = new StringBuilder();
        summary.append(String.format("Total de feedbacks recebidos: %d\n\n", allFeedbacks.size()));
        summary.append("Feedbacks:\n\n");
        
        int count = 1;
        for (Feedback feedback : allFeedbacks) {
            summary.append(String.format("%d. \"%s\"\n\n", count++, feedback.text()));
        }
        
        return summary.toString();
    }

    /**
     * Retorna a análise consolidada atual
     */
    public String getCurrentAnalysis() {
        return currentAnalysis.isEmpty() 
            ? "Aguardando feedbacks para gerar análise..." 
            : currentAnalysis;
    }

    /**
     * Retorna o número total de feedbacks recebidos
     */
    public int getTotalFeedbackCount() {
        return allFeedbacks.size();
    }

    /**
     * Retorna o número de feedbacks aguardando processamento
     */
    public int getQueueSize() {
        return feedbackQueue.size();
    }

    /**
     * Retorna os N feedbacks mais recentes
     */
    public List<Feedback> getRecentFeedbacks(int limit) {
        List<Feedback> recent = new ArrayList<>(allFeedbacks);
        Collections.reverse(recent);
        return recent.stream()
            .limit(limit)
            .collect(Collectors.toList());
    }

    /**
     * Verifica se há feedbacks sendo processados
     */
    public boolean isProcessing() {
        return processing.get();
    }

    /**
     * Remove todos os feedbacks e a análise consolidada
     */
    public void clearAll() {
        allFeedbacks.clear();
        feedbackQueue.clear();
        currentAnalysis = "";
        clearedAt = System.currentTimeMillis();
        try {
            redisService.deleteKey(REDIS_KEY_FEEDBACKS);
            redisService.deleteKey(REDIS_KEY_ANALYSIS);
            redisService.setValue(REDIS_KEY_CLEARED_AT, String.valueOf(clearedAt));
            Log.info("[FeedbackService] Todos os feedbacks removidos do Redis");
        } catch (Exception e) {
            Log.errorf("[FeedbackService] Erro ao limpar feedbacks no Redis: %s", e.getMessage());
        }
    }

    public long getClearedAt() {
        return clearedAt;
    }

    /**
     * Força reprocessamento de todos os feedbacks (útil para testes)
     */
    public void reanalyze() {
        Log.info("Forçando reanálise de todos os feedbacks");
        updateConsolidatedAnalysis();
    }

    /**
     * Retorna todos os feedbacks
     */
    public List<Feedback> getAllFeedbacks() {
        return new ArrayList<>(allFeedbacks);
    }

    /**
     * Responde uma pergunta sobre os feedbacks usando AI
     */
    public String chatAboutFeedbacks(String question) {
        if (allFeedbacks.isEmpty()) {
            return "Ainda não há feedbacks disponíveis para responder sua pergunta.";
        }
        String contextWithQuestion = buildFeedbacksSummary() + "\n\nPergunta do usuário: " + question;
        return feedbackChatAgent.chat(contextWithQuestion);
    }
}
