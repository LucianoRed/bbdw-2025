package com.redhat.feedback;

import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.annotation.PreDestroy;

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

    @Inject
    SentimentAnalysisAgent sentimentAgent;

    // Fila thread-safe para processar feedbacks
    private final ConcurrentLinkedQueue<Feedback> feedbackQueue = new ConcurrentLinkedQueue<>();
    
    // Lista thread-safe de todos os feedbacks recebidos
    private final CopyOnWriteArrayList<Feedback> allFeedbacks = new CopyOnWriteArrayList<>();
    
    // Análise consolidada atual
    private volatile String currentAnalysis = "";
    
    // Flag para indicar se há processamento em andamento
    private final AtomicBoolean processing = new AtomicBoolean(false);
    
    // Flag para indicar shutdown
    private volatile boolean shuttingDown = false;

    /**
     * Adiciona um novo feedback à fila para processamento
     */
    public void submitFeedback(String feedbackText) {
        Feedback feedback = new Feedback(feedbackText);
        feedbackQueue.offer(feedback);
        allFeedbacks.add(feedback);
        Log.infof("Feedback recebido: %s (Total: %d, Fila: %d)", 
            feedback.id(), allFeedbacks.size(), feedbackQueue.size());
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
     * Força reprocessamento de todos os feedbacks (útil para testes)
     */
    public void reanalyze() {
        Log.info("Forçando reanálise de todos os feedbacks");
        updateConsolidatedAnalysis();
    }
}
