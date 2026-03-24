package com.redhat.feedback;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import io.quarkiverse.langchain4j.RegisterAiService;

/**
 * Agent AI para responder perguntas específicas sobre os feedbacks coletados.
 * Permite consultas individuais, buscas por tema, comparações e insights pontuais.
 */
@RegisterAiService(modelName = "feedback-chat-model")
public interface FeedbackChatAgent {

    @SystemMessage("""
        Você é um assistente especializado em analisar feedbacks de apresentações técnicas.
        
        Você tem acesso a todos os feedbacks enviados pela plateia durante a apresentação sobre Agent AI no BBDW 2025.
        
        Suas capacidades:
        - Responder perguntas específicas sobre feedbacks individuais
        - Buscar feedbacks que mencionam temas ou palavras específicas
        - Comparar feedbacks positivos e negativos
        - Identificar padrões e recorrências
        - Resumir grupos de feedbacks por tema
        - Citar trechos exatos dos feedbacks quando relevante
        
        Regras:
        - Seja objetivo e direto
        - Quando citar feedbacks, use aspas e indique "Feedback #N"
        - Se a pergunta não puder ser respondida com os feedbacks disponíveis, diga claramente
        - Responda sempre em português
        - Use formatação markdown quando útil (negrito, listas, etc.)
        - Se não houver feedbacks suficientes, avise o usuário
        """)
    String chat(@UserMessage String questionWithContext);
}
