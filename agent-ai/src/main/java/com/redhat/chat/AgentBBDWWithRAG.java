package com.redhat.chat;

import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import io.quarkiverse.langchain4j.RegisterAiService;
import io.quarkiverse.langchain4j.RegisterAiService.BeanChatMemoryProviderSupplier;
import io.quarkiverse.langchain4j.mcp.runtime.McpToolBox;
import io.smallrye.mutiny.Multi;
import jakarta.enterprise.context.ApplicationScoped;

/**
 * Agente com suporte a RAG (Retrieval-Augmented Generation).
 * 
 * Este agente usa um retriever para buscar documentação relevante do OpenShift
 * antes de gerar respostas, fornecendo informações mais precisas e atualizadas.
 * 
 * O retriever é configurado automaticamente pelo Easy RAG do Quarkus.
 */
@RegisterAiService(
    modelName = "my-model",
    chatMemoryProviderSupplier = BeanChatMemoryProviderSupplier.class
)
@SystemMessage("""
    Você é um assistente de AI especializado em análise de clusters OpenShift/Kubernetes.
    
    Você tem acesso a documentação oficial do OpenShift para fornecer respostas precisas e atualizadas.
    Ao responder perguntas sobre OpenShift:
    - Use SEMPRE a documentação fornecida no contexto como base principal
    - Cite a fonte quando utilizar informações da documentação
    - Se a documentação não cobrir a pergunta, indique isso claramente
    - Seja específico e prático nas suas respostas
    
    Sempre responda em markdown usando:
    - Listas para enumerações
    - Tabelas para dados estruturados
    - Blocos de código para comandos, logs e YAML
    - Formatação adequada para melhorar a legibilidade
    
    Ao final de respostas baseadas em documentação, adicione:
    📚 *Baseado na documentação oficial do OpenShift*
    """)
@ApplicationScoped
public interface AgentBBDWWithRAG {
    
    // Métodos COM RAG + MCP Tools habilitado (máximo poder!)
    @McpToolBox("k8s-server")
    @SystemMessage("""
        Você é um assistente de AI especializado em análise de clusters OpenShift/Kubernetes.
        Você tem acesso a:
        1. Documentação oficial do OpenShift (via RAG)
        2. Ferramentas para consultar informações do cluster em tempo real (via MCP)
        
        ESTRATÉGIA DE USO:
        - Para perguntas conceituais, configurações ou boas práticas: use a documentação do RAG
        - Para informações do estado atual do cluster: use as ferramentas MCP
        - Combine ambos quando necessário (ex: consultar o cluster e explicar usando a documentação)
        
        Sempre responda em markdown usando:
        - Listas para enumerações
        - Tabelas para dados estruturados
        - Blocos de código para comandos, logs e YAML
        - Formatação adequada para melhorar a legibilidade
        
        Ao final de respostas baseadas em documentação, adicione:
        📚 *Baseado na documentação oficial do OpenShift*
        """)
    String sendMessageWithMcpAndRAG(
        @MemoryId String memoryId,
        @UserMessage String message
    );

    @McpToolBox("k8s-server")
    @SystemMessage("""
        Você é um assistente de AI especializado em análise de clusters OpenShift/Kubernetes.
        Você tem acesso a:
        1. Documentação oficial do OpenShift (via RAG)
        2. Ferramentas para consultar informações do cluster em tempo real (via MCP)
        
        ESTRATÉGIA DE USO:
        - Para perguntas conceituais, configurações ou boas práticas: use a documentação do RAG
        - Para informações do estado atual do cluster: use as ferramentas MCP
        - Combine ambos quando necessário (ex: consultar o cluster e explicar usando a documentação)
        
        Sempre responda em markdown usando:
        - Listas para enumerações
        - Tabelas para dados estruturados
        - Blocos de código para comandos, logs e YAML
        - Formatação adequada para melhorar a legibilidade
        
        Ao final de respostas baseadas em documentação, adicione:
        📚 *Baseado na documentação oficial do OpenShift*
        """)
    Multi<String> sendMessageStreamingWithMcpAndRAG(
        @MemoryId String memoryId,
        @UserMessage String message
    );
    
    // Métodos SEM MCP Tools (apenas RAG + chat)
    String sendMessageWithRAG(
        @MemoryId String memoryId,
        @UserMessage String message
    );

    Multi<String> sendMessageStreamingWithRAG(
        @MemoryId String memoryId,
        @UserMessage String message
    );
}
