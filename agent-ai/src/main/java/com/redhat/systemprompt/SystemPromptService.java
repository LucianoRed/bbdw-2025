package com.redhat.systemprompt;

import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;

/**
 * Serviço que armazena e fornece o system prompt customizável em tempo real.
 *
 * O prompt é mantido em memória (volatile) e pode ser alterado via API REST
 * sem necessidade de reinicialização da aplicação.
 *
 * Se o prompt customizado estiver vazio, os agentes continuam usando seus
 * @SystemMessage originais normalmente.
 */
@ApplicationScoped
public class SystemPromptService {

    /** Prompt padrão exibido na UI como sugestão inicial */
    public static final String DEFAULT_PROMPT =
        "Você é um assistente de AI especializado em análise de clusters OpenShift/Kubernetes. " +
        "Sempre responda em português, de forma clara e objetiva, usando markdown quando adequado.";

    private volatile String customPrompt = null;

    /**
     * Retorna o prompt customizado atual, ou null se não houver nenhum definido.
     */
    public String getCustomPrompt() {
        return customPrompt;
    }

    /**
     * Define um novo prompt customizado.
     * Passar null ou string em branco remove o prompt customizado (volta ao padrão dos agentes).
     */
    public void setCustomPrompt(String prompt) {
        if (prompt == null || prompt.isBlank()) {
            this.customPrompt = null;
            Log.info("[SystemPrompt] Prompt customizado removido — agentes voltam ao padrão.");
        } else {
            this.customPrompt = prompt.strip();
            Log.infof("[SystemPrompt] Novo prompt definido (%d chars): %.80s...", 
                      this.customPrompt.length(), this.customPrompt);
        }
    }

    /**
     * Retorna true se há um prompt customizado ativo.
     */
    public boolean hasCustomPrompt() {
        return customPrompt != null && !customPrompt.isBlank();
    }

    /**
     * Retorna o prompt customizado como prefixo para injetar na mensagem do usuário.
     * Formato: bloco de contexto que o LLM interpreta como instrução de sistema adicional.
     */
    public String buildContextPrefix() {
        if (!hasCustomPrompt()) return "";
        return "<<INSTRUÇÃO DE SISTEMA>>\n" + customPrompt + "\n<</INSTRUÇÃO DE SISTEMA>>\n\n";
    }
}
