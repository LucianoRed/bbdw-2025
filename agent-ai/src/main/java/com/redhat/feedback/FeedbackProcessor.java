package com.redhat.feedback;

import io.quarkus.logging.Log;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/**
 * Scheduler que processa a fila de feedbacks periodicamente em lotes
 */
@ApplicationScoped
public class FeedbackProcessor {

    @Inject
    FeedbackService feedbackService;

    /**
     * Processa feedbacks a cada 10 segundos
     * Usa Virtual Threads automaticamente pelo Quarkus
     */
    @Scheduled(every = "10s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void processFeedbackQueue() {
        int queueSize = feedbackService.getQueueSize();
        
        if (queueSize > 0) {
            Log.infof("Scheduler: Iniciando processamento de %d feedbacks na fila", queueSize);
            feedbackService.processBatch();
        }
    }

    /**
     * Log de estatísticas a cada minuto
     */
    @Scheduled(every = "60s")
    void logStats() {
        int total = feedbackService.getTotalFeedbackCount();
        int queue = feedbackService.getQueueSize();
        boolean processing = feedbackService.isProcessing();
        
        Log.infof("Stats: Total=%d | Fila=%d | Processando=%s", total, queue, processing);
    }
}
