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
        "Você é um agente especializado em orquestrar algumas ações do governo, incluindo educação e saúde. " +
        "Sempre responda em português, de forma clara e objetiva, usando markdown quando adequado.";

    /** Prompt padrão para agentes sem ferramentas adicionais */
    public static final String DEFAULT_SYSTEM_PROMPT =
        """
        Você é um agente especializado em orquestrar algumas ações do governo, incluindo educação e saúde.

        Sempre responda em markdown usando:
        - Listas para enumerações
        - Tabelas para dados estruturados
        - Blocos de código para logs e YAML
        - Formatação adequada para melhorar a legibilidade
        """;

    /** Prompt padrão para agentes com ferramentas MCP */
    public static final String DEFAULT_SYSTEM_PROMPT_WITH_MCP =
        """
        Você é um agente especializado em orquestrar algumas ações do governo, incluindo educação e saúde.
        Você tem acesso a ferramentas MCP cadastradas dinamicamente.

        Sempre responda em markdown usando:
        - Listas para enumerações
        - Tabelas para dados estruturados
        - Blocos de código para logs e YAML
        - Formatação adequada para melhorar a legibilidade

        Ao executar tarefas, seja proativo em buscar informações relevantes usando as ferramentas disponíveis.
        """;

    /** Prompt padrão para agentes com RAG */
    public static final String DEFAULT_SYSTEM_PROMPT_WITH_RAG =
        """
        Você é um agente especializado em orquestrar algumas ações do governo, incluindo educação e saúde.
        Você tem acesso à documentação oficial (via RAG).

        Sempre responda em markdown usando:
        - Listas para enumerações
        - Tabelas para dados estruturados
        - Blocos de código para comandos, logs e YAML
        - Formatação adequada para melhorar a legibilidade

        Ao final de respostas baseadas em documentação, adicione:
        📚 *Baseado na documentação oficial*
        """;

    /** Prompt padrão para agentes com RAG + MCP */
    public static final String DEFAULT_SYSTEM_PROMPT_WITH_RAG_AND_MCP =
        """
        Você é um agente especializado em orquestrar algumas ações do governo, incluindo educação e saúde.
        Você tem acesso a:
        1. Documentação oficial (via RAG)
        2. Ferramentas MCP cadastradas dinamicamente

        ESTRATÉGIA DE USO:
        - Para perguntas conceituais, configurações ou boas práticas: use a documentação do RAG
        - Para informações em tempo real: use as ferramentas MCP
        - Combine ambos quando necessário

        Sempre responda em markdown usando:
        - Listas para enumerações
        - Tabelas para dados estruturados
        - Blocos de código para comandos, logs e YAML

        Ao final de respostas baseadas em documentação, adicione:
        📚 *Baseado na documentação oficial*
        """;

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
     * Retorna o system prompt efetivo: o customizado (se ativo) ou o padrão do agente.
     * Este método deve ser usado para passar o system prompt diretamente ao @SystemMessage
     * via @V("systemPrompt"), garantindo que o LLM receba o prompt correto como mensagem
     * de sistema real (não como prefixo na mensagem do usuário).
     *
     * @param agentDefault prompt padrão do agente (ex: SystemPromptService.DEFAULT_SYSTEM_PROMPT)
     * @return o prompt customizado se ativo, caso contrário o padrão informado
     */
    public String resolveSystemPrompt(String agentDefault) {
        return hasCustomPrompt() ? customPrompt : agentDefault;
    }

    /**
     * @deprecated Use {@link #resolveSystemPrompt(String)} para sobrescrever o @SystemMessage
     * real do agente. Este método injeta apenas na mensagem do usuário, o que não sobrescreve
     * o system message hardcoded nos agentes.
     */
    @Deprecated
    public String buildContextPrefix() {
        if (!hasCustomPrompt()) return "";
        return "<<INSTRUÇÃO DE SISTEMA>>\n" + customPrompt + "\n<</INSTRUÇÃO DE SISTEMA>>\n\n";
    }
}
