package com.redhat.sei;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Serviço que integra o agent-ai com um Agente SEI criado via OpenAI AgentBuilder
 * (Assistants API v2).
 *
 * Fluxo por sessão:
 *   1. Cria (ou reutiliza) uma Thread na Assistants API
 *   2. Adiciona a mensagem do usuário à Thread
 *   3. Cria um Run com o assistantId configurado
 *   4. Aguarda o Run completar (polling)
 *   5. Retorna a última mensagem do assistente
 */
@ApplicationScoped
public class SeiAssistantService {

    private static final String OPENAI_API_BASE = "https://api.openai.com/v1";
    private static final String ASSISTANTS_BETA = "assistants=v2";

    @ConfigProperty(name = "openai.key")
    String apiKey;

    @ConfigProperty(name = "openai.sei.assistant-id")
    String assistantId;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(30))
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Mantém o mapeamento memoryId → threadId para preservar contexto por sessão. */
    private final Map<String, String> sessionThreads = new ConcurrentHashMap<>();

    /**
     * Envia uma mensagem ao agente SEI e retorna a resposta.
     *
     * @param memoryId  ID da sessão (usado para reutilizar a Thread da Assistants API)
     * @param userMessage Mensagem do usuário
     * @return Resposta do agente SEI
     */
    public String chat(String memoryId, String userMessage) {
        try {
            String threadId = sessionThreads.computeIfAbsent(memoryId, id -> createThread());
            addMessage(threadId, userMessage);
            String runId = createRun(threadId);
            waitForCompletion(threadId, runId);
            return getLastAssistantMessage(threadId);
        } catch (Exception e) {
            Log.errorf("❌ Erro ao chamar agente SEI: %s", e.getMessage());
            throw new RuntimeException("Falha ao comunicar com o agente SEI: " + e.getMessage(), e);
        }
    }

    private String createThread() {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(OPENAI_API_BASE + "/threads"))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .header("OpenAI-Beta", ASSISTANTS_BETA)
                    .POST(HttpRequest.BodyPublishers.ofString("{}"))
                    .timeout(Duration.ofSeconds(30))
                    .build();

            String body = httpClient.send(request, HttpResponse.BodyHandlers.ofString()).body();
            String threadId = objectMapper.readTree(body).get("id").asText();
            Log.infof("🧵 Thread SEI criada: %s", threadId);
            return threadId;
        } catch (Exception e) {
            throw new RuntimeException("Falha ao criar thread SEI", e);
        }
    }

    private void addMessage(String threadId, String content) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("role", "user");
            body.put("content", content);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(OPENAI_API_BASE + "/threads/" + threadId + "/messages"))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .header("OpenAI-Beta", ASSISTANTS_BETA)
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .timeout(Duration.ofSeconds(30))
                    .build();

            httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            throw new RuntimeException("Falha ao adicionar mensagem ao thread SEI", e);
        }
    }

    private String createRun(String threadId) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("assistant_id", assistantId);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(OPENAI_API_BASE + "/threads/" + threadId + "/runs"))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .header("OpenAI-Beta", ASSISTANTS_BETA)
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .timeout(Duration.ofSeconds(30))
                    .build();

            String responseBody = httpClient.send(request, HttpResponse.BodyHandlers.ofString()).body();
            String runId = objectMapper.readTree(responseBody).get("id").asText();
            Log.infof("▶️ Run SEI criado: %s", runId);
            return runId;
        } catch (Exception e) {
            throw new RuntimeException("Falha ao criar run no agente SEI", e);
        }
    }

    private void waitForCompletion(String threadId, String runId) throws InterruptedException {
        String url = OPENAI_API_BASE + "/threads/" + threadId + "/runs/" + runId;
        int maxAttempts = 120; // polling a cada 1s, máximo 120s

        for (int i = 0; i < maxAttempts; i++) {
            try {
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Authorization", "Bearer " + apiKey)
                        .header("OpenAI-Beta", ASSISTANTS_BETA)
                        .GET()
                        .timeout(Duration.ofSeconds(30))
                        .build();

                String responseBody = httpClient.send(request, HttpResponse.BodyHandlers.ofString()).body();
                JsonNode node = objectMapper.readTree(responseBody);
                String status = node.get("status").asText();
                Log.debugf("⏳ Status do run SEI: %s (tentativa %d)", status, i + 1);

                if ("completed".equals(status)) {
                    return;
                }
                if ("failed".equals(status) || "cancelled".equals(status) || "expired".equals(status)) {
                    String errorMsg = node.path("last_error").path("message").asText("erro desconhecido");
                    throw new RuntimeException("Run SEI terminou com status '" + status + "': " + errorMsg);
                }
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                throw new RuntimeException("Erro ao verificar status do run SEI", e);
            }
            Thread.sleep(1000);
        }
        throw new RuntimeException("Timeout aguardando resposta do agente SEI (>120s)");
    }

    private String getLastAssistantMessage(String threadId) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(OPENAI_API_BASE + "/threads/" + threadId + "/messages?limit=1&order=desc"))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("OpenAI-Beta", ASSISTANTS_BETA)
                    .GET()
                    .timeout(Duration.ofSeconds(30))
                    .build();

            String responseBody = httpClient.send(request, HttpResponse.BodyHandlers.ofString()).body();
            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode messages = root.get("data");

            if (messages != null && messages.isArray() && !messages.isEmpty()) {
                JsonNode content = messages.get(0).get("content");
                if (content != null && content.isArray() && !content.isEmpty()) {
                    return content.get(0).path("text").path("value").asText();
                }
            }
            return "O agente SEI não retornou uma resposta.";
        } catch (Exception e) {
            throw new RuntimeException("Falha ao obter resposta do agente SEI", e);
        }
    }
}
