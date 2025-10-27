package com.redhat.chat;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import io.quarkiverse.langchain4j.RegisterAiService;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
@RegisterAiService(modelName = "my-model")
public interface ChatSummaryAgent {
    
    @SystemMessage("""
        Você é um assistente especializado em criar resumos concisos de conversas.
        Seu objetivo é condensar múltiplas mensagens de uma conversa em um único resumo informativo.
        
        Regras importantes:
        - Mantenha TODAS as informações técnicas importantes (nomes de recursos, comandos, erros, etc)
        - Preserve o contexto e a sequência lógica da conversa
        - Use uma linguagem clara e objetiva
        - O resumo deve ser em formato de parágrafo corrido
        - Não adicione informações que não estavam nas mensagens originais
        - Se houver comandos ou outputs importantes, mantenha-os no resumo
        """)
    String summarizeMessages(@UserMessage String conversationHistory);
}
