package com.redhat.redis;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonProperty;

import dev.langchain4j.data.message.ChatMessage;

/**
 * Classe para armazenar mensagens de chat com timestamp.
 * Sem Lombok para evitar problemas no build do OpenShift.
 */
public class StoredChatMessage {
    
    @JsonProperty("message")
    private ChatMessage message;
    
    @JsonProperty("timestamp")
    private LocalDateTime timestamp;

    // Construtor padrão necessário para deserialização
    public StoredChatMessage() {
    }

    // Construtor com parâmetros
    public StoredChatMessage(ChatMessage message, LocalDateTime timestamp) {
        this.message = message;
        this.timestamp = timestamp;
    }

    // Getters e Setters
    public ChatMessage getMessage() {
        return message;
    }

    public void setMessage(ChatMessage message) {
        this.message = message;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }

    @Override
    public String toString() {
        return "StoredChatMessage{" +
                "message=" + message +
                ", timestamp=" + timestamp +
                '}';
    }
}
