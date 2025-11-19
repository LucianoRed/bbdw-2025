package com.redhat.chat;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import com.redhat.mcp.McpCallEvent;
import com.redhat.mcp.McpEventService;
import com.redhat.orchestrator.OrchestratorService;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.memory.chat.ChatMemoryProvider;
import dev.langchain4j.store.memory.chat.ChatMemoryStore;
import io.quarkus.logging.Log;
import io.smallrye.common.annotation.RunOnVirtualThread;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

@Path("/chat")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ChatResource {

    @Inject
    AgentBBDW agent;
    
    @Inject
    AgentBBDWWithRAG agentWithRAG;
    
    @Inject
    AgentGemini agentGemini;
    
    @Inject
    AgentGPT35 agentGPT35;
    
    @Inject
    AgentGPT4oNano agentGPT4oNano;
    
    @Inject
    AgentGPT4oMini agentGPT4oMini;
    
    @Inject
    AgentGPT41Nano agentGPT41Nano;
    
    @Inject
    AgentGPT5 agentGPT5;
    
    @Inject
    AgentGPT5Mini agentGPT5Mini;
    
    @Inject
    AgentWithDynamicMcp agentWithDynamicMcp;
    
    @Inject
    OrchestratorService orchestratorService;

    @Inject
    ChatMemoryProvider chatMemoryProvider;

    @Inject
    ChatMemoryStore chatMemoryStore;

    @Inject
    McpEventService mcpEventService;

    /**
     * Endpoint tradicional que retorna a resposta completa
     */
    @POST
    @Path("/message")
    @RunOnVirtualThread
    public Response sendMessage(ChatRequest request) {
        // Gera um requestId único para rastrear esta requisição
        String requestId = "req-" + System.currentTimeMillis() + "-" + (int)(Math.random() * 10000);
        
        // Se sessionId for null, gera um ID único para esta requisição (sem memória)
        // Se sessionId existir, usa ele para manter o histórico
        String memoryId = request.sessionId() != null 
            ? request.sessionId() 
            : "temp-" + System.currentTimeMillis() + "-" + Math.random();
        
        boolean useMcp = request.useMcp() != null ? request.useMcp() : false;
        boolean useRag = request.useRag() != null ? request.useRag() : false;
        boolean useOrchestrator = request.useOrchestrator() != null ? request.useOrchestrator() : false;
        String modelName = request.model() != null ? request.model() : "gpt4o-mini";
        
        // Se MCP está ativo, registra o requestId no serviço de eventos
        if (useMcp) {
            mcpEventService.setCurrentRequestId(requestId);
            Log.infof("Iniciando requisição com MCP ativo - RequestId: %s", requestId);
        }
        
        try {
            String result;
            
            // Se orquestração está ativa, usa o OrchestratorService
            if (useOrchestrator) {
                Log.info("🎯 Modo orquestração ativado - delegando para OrchestratorService");
                result = orchestratorService.processMessage(memoryId, request.message(), modelName);
            } else {
                // Modo tradicional: seleciona o agente baseado no modelo
                result = routeMessage(modelName, memoryId, request.message(), useMcp, useRag);
            }
            
            // Retorna com o requestId no header
            return Response.ok(result)
                    .header("X-Request-Id", requestId)
                    .build();
        } finally {
            // Limpa o requestId do thread
            if (useMcp) {
                mcpEventService.clearCurrentRequestId();
            }
        }
    }
    
    /**
     * Método auxiliar para rotear mensagens para o agente correto
     */
    private String routeMessage(String modelName, String memoryId, String message, boolean useMcp, boolean useRag) {
        // Routing: RAG + MCP > RAG > MCP > Basic
        return switch (modelName.toLowerCase()) {
            case "gemini-2.5-flash", "gemini" -> {
                if (useMcp) yield agentGemini.sendMessageWithMcp(memoryId, message);
                else yield agentGemini.sendMessage(memoryId, message);
            }
            case "gpt-3.5-turbo", "gpt35" -> {
                if (useMcp) yield agentGPT35.sendMessageWithMcp(memoryId, message);
                else yield agentGPT35.sendMessage(memoryId, message);
            }
            case "gpt-4o-nano", "gpt4o-nano" -> {
                if (useMcp) yield agentGPT4oNano.sendMessageWithMcp(memoryId, message);
                else yield agentGPT4oNano.sendMessage(memoryId, message);
            }
            case "gpt-4o-mini", "gpt4o-mini" -> {
                if (useMcp) yield agentGPT4oMini.sendMessageWithMcp(memoryId, message);
                else yield agentGPT4oMini.sendMessage(memoryId, message);
            }
            case "gpt-4.1-nano", "gpt41-nano" -> {
                if (useMcp) yield agentGPT41Nano.sendMessageWithMcp(memoryId, message);
                else yield agentGPT41Nano.sendMessage(memoryId, message);
            }
            case "gpt-5", "gpt5" -> {
                if (useMcp) yield agentGPT5.sendMessageWithMcp(memoryId, message);
                else yield agentGPT5.sendMessage(memoryId, message);
            }
            case "gpt-5-mini", "gpt5-mini" -> {
                if (useMcp) yield agentGPT5Mini.sendMessageWithMcp(memoryId, message);
                else yield agentGPT5Mini.sendMessage(memoryId, message);
            }
            case "dynamic-mcp" -> {
                // Agent especial que usa servidores MCP dinâmicos cadastrados via UI
                yield agentWithDynamicMcp.chat(memoryId, message);
            }
            default -> {
                // Fallback para o agente padrão com RAG support
                if (useRag && useMcp) yield agentWithRAG.sendMessageWithMcpAndRAG(memoryId, message);
                else if (useRag) yield agentWithRAG.sendMessageWithRAG(memoryId, message);
                else if (useMcp) yield agent.sendMessageWithMcp(memoryId, message);
                else yield agent.sendMessage(memoryId, message);
            }
        };
    }

    // /**
    //  * Endpoint com streaming usando SSE (Server-Sent Events)
    //  */
    // @POST
    // @Path("/stream")
    // @Produces(MediaType.SERVER_SENT_EVENTS)
    // @RestStreamElementType(MediaType.TEXT_PLAIN)
    // public Multi<String> streamMessage(ChatRequest request) {
    //     // Se sessionId for null, gera um ID único para esta requisição (sem memória)
    //     // Se sessionId existir, usa ele para manter o histórico
    //     String memoryId = request.sessionId() != null 
    //         ? request.sessionId() 
    //         : "temp-" + System.currentTimeMillis() + "-" + Math.random();
        
    //     boolean useMcp = request.useMcp() != null ? request.useMcp() : false;
    //     boolean useRag = request.useRag() != null ? request.useRag() : false;
    //     String modelName = request.model() != null ? request.model() : "gpt4o-mini";
        
    //     // Executa a chamada inicial (que acessa Redis) em uma thread virtual
    //     // para evitar bloquear o event loop do Vert.x
    //     return Multi.createFrom().emitter(emitter -> {
    //         Infrastructure.getDefaultWorkerPool().execute(() -> {
    //             try {
    //                 Multi<String> stream = routeMessageStreaming(modelName, memoryId, request.message(), useMcp, useRag);
                    
    //                 stream.subscribe().with(
    //                     emitter::emit,
    //                     emitter::fail,
    //                     emitter::complete
    //                 );
    //             } catch (Exception e) {
    //                 emitter.fail(e);
    //             }
    //         });
    //     });
    // }
    
    // /**
    //  * Método auxiliar para rotear mensagens streaming para o agente correto
    //  */
    // private Multi<String> routeMessageStreaming(String modelName, String memoryId, String message, boolean useMcp, boolean useRag) {
    //     return switch (modelName.toLowerCase()) {
    //         case "gemini-2.5-flash", "gemini" -> {
    //             if (useMcp) yield agentGemini.sendMessageStreamingWithMcp(memoryId, message);
    //             else yield agentGemini.sendMessageStreaming(memoryId, message);
    //         }
    //         case "gpt-3.5-turbo", "gpt35" -> {
    //             if (useMcp) yield agentGPT35.sendMessageStreamingWithMcp(memoryId, message);
    //             else yield agentGPT35.sendMessageStreaming(memoryId, message);
    //         }
    //         case "gpt-4o-nano", "gpt4o-nano" -> {
    //             if (useMcp) yield agentGPT4oNano.sendMessageStreamingWithMcp(memoryId, message);
    //             else yield agentGPT4oNano.sendMessageStreaming(memoryId, message);
    //         }
    //         case "gpt-4o-mini", "gpt4o-mini" -> {
    //             if (useMcp) yield agentGPT4oMini.sendMessageStreamingWithMcp(memoryId, message);
    //             else yield agentGPT4oMini.sendMessageStreaming(memoryId, message);
    //         }
    //         case "gpt-4.1-nano", "gpt41-nano" -> {
    //             if (useMcp) yield agentGPT41Nano.sendMessageStreamingWithMcp(memoryId, message);
    //             else yield agentGPT41Nano.sendMessageStreaming(memoryId, message);
    //         }
    //         default -> {
    //             // Fallback para o agente padrão com RAG support
    //             if (useRag && useMcp) yield agentWithRAG.sendMessageStreamingWithMcpAndRAG(memoryId, message);
    //             else if (useRag) yield agentWithRAG.sendMessageStreamingWithRAG(memoryId, message);
    //             else if (useMcp) yield agent.sendMessageStreamingWithMcp(memoryId, message);
    //             else yield agent.sendMessageStreaming(memoryId, message);
    //         }
    //     };
    // }

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
     * Endpoint para buscar chamadas MCP recentes de uma requisição
     * Retorna as chamadas MCP que foram feitas nos últimos segundos
     */
    @GET
    @Path("/mcp-calls/{requestId}")
    public List<McpCallDTO> getMcpCalls(@PathParam("requestId") String requestId) {
        List<McpCallEvent> events = mcpEventService.getEvents(requestId);
        
        return events.stream()
                .map(event -> new McpCallDTO(
                        event.getToolName(),
                        event.getStatus(),
                        event.getTimestamp().toEpochMilli()
                ))
                .collect(Collectors.toList());
    }

    /**
     * Record para receber a requisição do chat
     */
    public record ChatRequest(
        String message,
        String sessionId,
        Boolean useMcp,
        Boolean useRag,
        String model,
        Boolean useOrchestrator  // Nova flag para ativar orquestração
    ) {}

    /**
     * Record para retornar mensagens do histórico
     */
    public record MessageDTO(
        String role,
        String content
    ) {}

    /**
     * Record para retornar chamadas MCP
     */
    public record McpCallDTO(
        String name,
        String status,
        Long timestamp
    ) {}
}
