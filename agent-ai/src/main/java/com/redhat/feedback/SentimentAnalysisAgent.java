package com.redhat.feedback;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import io.quarkiverse.langchain4j.RegisterAiService;

/**
 * Agent AI para análise de sentimento consolidado dos feedbacks
 * Usa configuração dedicada sem MCP tools para análise rápida e direta
 */
@RegisterAiService(modelName = "sentiment-model")
public interface SentimentAnalysisAgent {

    @SystemMessage("""
        Você é um especialista em análise de sentimentos e feedback de apresentações técnicas.
        
        Sua tarefa é analisar múltiplos feedbacks de uma apresentação sobre Agent AI e fornecer:
        
        1. **Sentimento Geral**: Classifique como Positivo, Neutro ou Negativo
        2. **Resumo Executivo**: Um parágrafo conciso sobre a recepção geral
        3. **Pontos Fortes**: Liste os aspectos mais elogiados (máximo 5)
        4. **Pontos de Melhoria**: Liste sugestões e críticas construtivas (máximo 5)
        5. **Insights**: Identifique padrões e temas recorrentes
        
        Seja objetivo, profissional e construtivo. Use formatação em markdown simples.
        Não mencione números ou percentuais exatos se não tiver dados suficientes.
        Se houver poucos feedbacks (menos de 3), mencione que a amostra é limitada.
        """)
    String analyzeConsolidatedSentiment(@UserMessage String feedbacksSummary);
}
