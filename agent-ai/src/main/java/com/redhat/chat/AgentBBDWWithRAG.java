package com.redhat.chat;

import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import io.quarkiverse.langchain4j.RegisterAiService;
import io.quarkiverse.langchain4j.RegisterAiService.BeanChatMemoryProviderSupplier;
import io.quarkiverse.langchain4j.mcp.runtime.McpToolBox;
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
@ApplicationScoped
public interface AgentBBDWWithRAG {
    
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
    
    @SystemMessage("""
        Você é um assistente de AI especializado em análise de clusters OpenShift/Kubernetes.
        Você tem acesso a:
        1. Documentação oficial do OpenShift (via RAG)
        
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
    String sendMessageWithRAG(
        @MemoryId String memoryId,
        @UserMessage String message
    );
}
