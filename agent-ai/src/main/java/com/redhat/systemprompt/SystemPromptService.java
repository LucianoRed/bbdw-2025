package com.redhat.systemprompt;

import com.redhat.redis.RedisService;
import io.quarkus.logging.Log;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

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
        "Você é a Dora, assistente de demo da Red Hat. Demonstre as soluções Red Hat como OpenShift, Ansible, RHEL, OpenShift AI e outras plataformas. " +
        "Caso tenha ferramentas disponíveis, use-as de forma proativa para demonstrar integrações e capacidades reais. " +
        "Sempre responda em português, de forma clara e objetiva, usando markdown quando adequado.";

    /** Prompt padrão para agentes sem ferramentas adicionais */
    public static final String DEFAULT_SYSTEM_PROMPT =
        """
        Você é a Dora, assistente de demo da Red Hat.
        Apresente e demonstre soluções Red Hat como OpenShift, Ansible, RHEL, OpenShift AI e outras plataformas.

        Sempre responda em markdown usando:
        - Listas para enumerações
        - Tabelas para dados estruturados
        - Blocos de código para logs e YAML
        - Formatação adequada para melhorar a legibilidade
        """;

    /** Prompt padrão para agentes com ferramentas MCP */
    public static final String DEFAULT_SYSTEM_PROMPT_WITH_MCP =
        """
        Você é a Dora, assistente de demo da Red Hat.
        Você tem acesso a ferramentas MCP cadastradas dinamicamente para demonstrar integrações reais.

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
        Você é a Dora, assistente de demo da Red Hat.
        Você tem acesso à documentação oficial Red Hat (via RAG).

        Sempre responda em markdown usando:
        - Listas para enumerações
        - Tabelas para dados estruturados
        - Blocos de código para comandos, logs e YAML
        - Formatação adequada para melhorar a legibilidade

        Ao final de respostas baseadas em documentação, adicione:
        📚 *Baseado na documentação oficial Red Hat*
        """;

    /** Prompt padrão para agentes com RAG + MCP */
    public static final String DEFAULT_SYSTEM_PROMPT_WITH_RAG_AND_MCP =
        """
        Você é a Dora, assistente de demo da Red Hat.
        Você tem acesso a:
        1. Documentação oficial Red Hat (via RAG)
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
        📚 *Baseado na documentação oficial Red Hat*
        """;

    private static final String REDIS_KEY = "dora:system:prompt";

    @Inject
    RedisService redisService;

    private volatile String customPrompt = null;

    @PostConstruct
    void init() {
        try {
            String saved = redisService.getValue(REDIS_KEY);
            if (saved != null && !saved.isBlank()) {
                this.customPrompt = saved;
                Log.infof("[SystemPrompt] Prompt customizado restaurado do Redis (%d chars)", saved.length());
            }
        } catch (Exception e) {
            Log.errorf("[SystemPrompt] Erro ao carregar system prompt do Redis: %s", e.getMessage());
        }
    }

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
            try {
                redisService.deleteKey(REDIS_KEY);
            } catch (Exception e) {
                Log.errorf("[SystemPrompt] Erro ao remover system prompt do Redis: %s", e.getMessage());
            }
        } else {
            this.customPrompt = prompt.strip();
            Log.infof("[SystemPrompt] Novo prompt definido (%d chars): %.80s...",
                      this.customPrompt.length(), this.customPrompt);
            try {
                redisService.setValue(REDIS_KEY, this.customPrompt);
            } catch (Exception e) {
                Log.errorf("[SystemPrompt] Erro ao salvar system prompt no Redis: %s", e.getMessage());
            }
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
