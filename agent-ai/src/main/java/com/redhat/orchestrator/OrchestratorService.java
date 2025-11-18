package com.redhat.orchestrator;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.redhat.chat.*;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/**
 * Serviço de Orquestração que coordena a execução de múltiplos agentes.
 * 
 * Este serviço:
 * 1. Recebe a mensagem do usuário
 * 2. Usa o OrchestratorAgent para analisar e decidir qual agente chamar
 * 3. Delega para o agente especializado apropriado
 * 4. Retorna a resposta final ao usuário
 */
@ApplicationScoped
public class OrchestratorService {
    
    @Inject
    OrchestratorAgent orchestratorAgent;
    
    @Inject
    AgentBBDW agentK8s;
    
    @Inject
    AgentBBDWWithRAG agentWithRAG;
    
    @Inject
    AgentGPT4oMini agentGeneral;
    
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    /**
     * Processa uma mensagem usando orquestração inteligente
     * 
     * @param memoryId ID da sessão para manter contexto
     * @param message Mensagem do usuário
     * @param modelHint Sugestão de modelo (opcional, pode ser sobrescrito pela orquestração)
     * @return Resposta do agente especializado
     */
    public String processMessage(String memoryId, String message, String modelHint) {
        try {
            // Etapa 1: Orquestrador analisa a mensagem e decide o routing
            Log.infof("🎯 Orquestrador analisando mensagem: %s", message);
            String routingDecision = orchestratorAgent.analyzeAndRoute(memoryId, message);
            
            // Parse da decisão JSON
            RoutingDecision decision = objectMapper.readValue(routingDecision, RoutingDecision.class);
            Log.infof("📋 Decisão do orquestrador: specialist=%s, useMcp=%s, useRag=%s, confidence=%.2f", 
                     decision.specialist(), decision.useMcp(), decision.useRag(), decision.confidence());
            Log.infof("💭 Razão: %s", decision.reason());
            
            // Etapa 2: Delega para o agente especializado apropriado
            String response = delegateToSpecialist(decision, memoryId, message);
            
            // Adiciona informação sobre qual especialista respondeu (opcional)
            String specialistInfo = getSpecialistInfo(decision.specialist());
            return response + "\n\n---\n" + specialistInfo;
            
        } catch (Exception e) {
            Log.errorf("❌ Erro no orquestrador: %s", e.getMessage());
            // Fallback: usa agente geral em caso de erro
            return agentGeneral.sendMessage(memoryId, message);
        }
    }
    
    /**
     * Delega a mensagem para o agente especializado baseado na decisão do orquestrador
     */
    private String delegateToSpecialist(RoutingDecision decision, String memoryId, String message) {
        return switch (decision.specialist()) {
            case K8S_CLUSTER -> {
                Log.info("🔧 Delegando para agente K8S_CLUSTER");
                if (decision.useMcp()) {
                    yield agentK8s.sendMessageWithMcp(memoryId, message);
                } else {
                    yield agentK8s.sendMessage(memoryId, message);
                }
            }
            case DOCUMENTATION -> {
                Log.info("📚 Delegando para agente DOCUMENTATION");
                if (decision.useRag()) {
                    yield agentWithRAG.sendMessageWithRAG(memoryId, message);
                } else {
                    yield agentGeneral.sendMessage(memoryId, message);
                }
            }
            case TROUBLESHOOTING -> {
                Log.info("🔍 Delegando para agente TROUBLESHOOTING");
                if (decision.useMcp() && decision.useRag()) {
                    yield agentWithRAG.sendMessageWithMcpAndRAG(memoryId, message);
                } else if (decision.useRag()) {
                    yield agentWithRAG.sendMessageWithRAG(memoryId, message);
                } else if (decision.useMcp()) {
                    yield agentK8s.sendMessageWithMcp(memoryId, message);
                } else {
                    yield agentGeneral.sendMessage(memoryId, message);
                }
            }
            case GENERAL -> {
                Log.info("💬 Delegando para agente GENERAL");
                yield agentGeneral.sendMessage(memoryId, message);
            }
        };
    }
    
    /**
     * Retorna informação sobre qual especialista foi usado (para feedback ao usuário)
     */
    private String getSpecialistInfo(SpecialistType specialist) {
        return switch (specialist) {
            case K8S_CLUSTER -> "*🔧 Respondido pelo especialista em Cluster K8s*";
            case DOCUMENTATION -> "*📚 Respondido pelo especialista em Documentação*";
            case TROUBLESHOOTING -> "*🔍 Respondido pelo especialista em Troubleshooting*";
            case GENERAL -> "*💬 Respondido pelo assistente geral*";
        };
    }
    
    /**
     * Record que representa a decisão de routing do orquestrador
     */
    public record RoutingDecision(
        SpecialistType specialist,
        String reason,
        boolean useMcp,
        boolean useRag,
        double confidence
    ) {}
    
    /**
     * Enum dos tipos de especialistas disponíveis
     */
    public enum SpecialistType {
        K8S_CLUSTER,
        DOCUMENTATION,
        TROUBLESHOOTING,
        GENERAL
    }
}
