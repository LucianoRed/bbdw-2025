package com.redhat.feedback;

import io.quarkus.logging.Log;
import io.smallrye.mutiny.Multi;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.Duration;
import java.util.List;

/**
 * REST API para submissão de feedbacks e streaming de análises em tempo real
 */
@Path("/feedback")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class FeedbackResource {

    @Inject
    FeedbackService feedbackService;

    /**
     * Recebe um novo feedback da plateia
     */
    @POST
    @Path("/submit")
    public Response submitFeedback(FeedbackRequest request) {
        Log.infof("Recebendo feedback: %s", request.feedback());
        
        if (request.feedback() == null || request.feedback().trim().isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST)
                .entity(new FeedbackResponse(false, "Feedback vazio não é permitido"))
                .build();
        }

        if (request.feedback().trim().length() < 10) {
            return Response.status(Response.Status.BAD_REQUEST)
                .entity(new FeedbackResponse(false, "Feedback deve ter pelo menos 10 caracteres"))
                .build();
        }

        try {
            feedbackService.submitFeedback(request.feedback().trim());
            return Response.ok(new FeedbackResponse(true, "Feedback recebido com sucesso!"))
                .build();
        } catch (Exception e) {
            Log.errorf(e, "Erro ao processar feedback");
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(new FeedbackResponse(false, "Erro ao processar feedback"))
                .build();
        }
    }

    /**
     * Stream Server-Sent Events com análise consolidada atualizada em tempo real
     */
    @GET
    @Path("/analysis")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    public Multi<String> streamAnalysis() {
        Log.info("Cliente conectado ao stream de análise");
        
        return Multi.createFrom().ticks().every(Duration.ofSeconds(3))
            .onItem().transform(tick -> {
                try {
                    String analysis = feedbackService.getCurrentAnalysis();
                    int totalFeedbacks = feedbackService.getTotalFeedbackCount();
                    int processingCount = feedbackService.getQueueSize();
                    
                    // Retorna apenas o JSON - Quarkus adiciona o formato SSE automaticamente
                    StringBuilder json = new StringBuilder();
                    json.append("{");
                    json.append("\"type\":\"update\",");
                    json.append("\"analysis\":").append(toJsonString(analysis)).append(",");
                    json.append("\"stats\":{");
                    json.append("\"totalFeedbacks\":").append(totalFeedbacks).append(",");
                    json.append("\"processingCount\":").append(processingCount);
                    json.append("}");
                    json.append("}");
                    
                    return json.toString();
                } catch (Exception e) {
                    Log.errorf(e, "Erro ao gerar evento SSE");
                    return "{\"type\":\"error\",\"message\":\"Erro ao gerar análise\"}";
                }
            });
    }

    /**
     * Retorna os feedbacks mais recentes (últimos 10)
     */
    @GET
    @Path("/recent")
    public Response getRecentFeedbacks() {
        List<Feedback> recent = feedbackService.getRecentFeedbacks(10);
        return Response.ok(new RecentFeedbacksResponse(recent))
            .build();
    }

    /**
     * Força reprocessamento da análise (útil para debug)
     */
    @POST
    @Path("/reanalyze")
    public Response forceReanalyze() {
        Log.info("Forçando reanálise de feedbacks");
        feedbackService.reanalyze();
        return Response.ok(new FeedbackResponse(true, "Reanálise iniciada"))
            .build();
    }

    /**
     * Retorna estatísticas gerais
     */
    @GET
    @Path("/stats")
    public Response getStats() {
        return Response.ok(new StatsResponse(
            feedbackService.getTotalFeedbackCount(),
            feedbackService.getQueueSize(),
            feedbackService.isProcessing()
        )).build();
    }

    // Helper para escapar JSON strings
    private String toJsonString(String text) {
        return "\"" + text
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
            + "\"";
    }

    // Records para requests/responses
    public record FeedbackRequest(String feedback, String timestamp) {}
    public record FeedbackResponse(boolean success, String message) {}
    public record RecentFeedbacksResponse(List<Feedback> feedbacks) {}
    public record StatsResponse(int totalFeedbacks, int processingCount, boolean isProcessing) {}
}
