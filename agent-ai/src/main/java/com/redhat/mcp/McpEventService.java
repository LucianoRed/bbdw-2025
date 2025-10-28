package com.redhat.mcp;

import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Event;
import jakarta.inject.Inject;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Serviço que gerencia eventos de chamadas MCP
 * Captura logs do MCP Transport e extrai informações sobre chamadas de tools
 */
@ApplicationScoped
public class McpEventService {
    
    // Padrão para extrair nome da tool do log de Request
    // Exemplo: Request: {"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_storage","arguments":{}}}
    private static final Pattern TOOL_CALL_PATTERN = Pattern.compile("\"method\":\\s*\"tools/call\".*\"name\":\\s*\"([^\"]+)\"");
    
    // Armazena eventos por requestId (últimos 5 minutos)
    private final Map<String, List<McpCallEvent>> eventsByRequest = new ConcurrentHashMap<>();
    
    // Armazena o último requestId ativo para correlacionar logs
    private final ThreadLocal<String> currentRequestId = new ThreadLocal<>();
    
    @Inject
    Event<McpCallEvent> mcpEventBus;
    
    /**
     * Define o requestId atual para o thread
     */
    public void setCurrentRequestId(String requestId) {
        currentRequestId.set(requestId);
        // Limpa eventos antigos ao iniciar novo request
        cleanOldEvents();
    }
    
    /**
     * Limpa o requestId do thread
     */
    public void clearCurrentRequestId() {
        currentRequestId.remove();
    }
    
    /**
     * Obtém o requestId atual do thread
     */
    public String getCurrentRequestId() {
        return currentRequestId.get();
    }
    
    /**
     * Processa uma linha de log do MCP Transport
     * Extrai informações sobre chamadas de tools
     */
    public void processLogLine(String logLine) {
        String reqId = getCurrentRequestId();
        if (reqId == null) {
            return; // Não há request ativo neste thread
        }
        
        // Verifica se é um log de Request com tools/call
        if (logLine.contains("Request:") && logLine.contains("tools/call")) {
            Matcher matcher = TOOL_CALL_PATTERN.matcher(logLine);
            if (matcher.find()) {
                String toolName = matcher.group(1);
                Log.infof("[MCP-EVENT] Tool chamada: %s (RequestId: %s)", toolName, reqId);
                
                McpCallEvent event = new McpCallEvent(reqId, toolName, "calling");
                addEvent(event);
                mcpEventBus.fire(event);
            }
        }
        
        // Verifica se é um log de Response (indica que a tool retornou)
        if (logLine.contains("Response:") && logLine.contains("\"result\"")) {
            // Pega a última tool que foi chamada para este requestId
            List<McpCallEvent> events = eventsByRequest.get(reqId);
            if (events != null && !events.isEmpty()) {
                McpCallEvent lastEvent = events.get(events.size() - 1);
                if ("calling".equals(lastEvent.getStatus())) {
                    Log.infof("[MCP-EVENT] Tool completada: %s (RequestId: %s)", lastEvent.getToolName(), reqId);
                    
                    McpCallEvent completedEvent = new McpCallEvent(reqId, lastEvent.getToolName(), "completed");
                    addEvent(completedEvent);
                    mcpEventBus.fire(completedEvent);
                }
            }
        }
    }
    
    /**
     * Adiciona um evento à lista
     */
    private void addEvent(McpCallEvent event) {
        eventsByRequest.computeIfAbsent(event.getRequestId(), k -> new ArrayList<>()).add(event);
    }
    
    /**
     * Obtém todos os eventos de um requestId
     */
    public List<McpCallEvent> getEvents(String requestId) {
        return eventsByRequest.getOrDefault(requestId, Collections.emptyList());
    }
    
    /**
     * Limpa eventos mais antigos que 5 minutos
     */
    private void cleanOldEvents() {
        long fiveMinutesAgo = System.currentTimeMillis() - (5 * 60 * 1000);
        eventsByRequest.entrySet().removeIf(entry -> {
            List<McpCallEvent> events = entry.getValue();
            return events.isEmpty() || 
                   events.get(0).getTimestamp().toEpochMilli() < fiveMinutesAgo;
        });
    }
}
