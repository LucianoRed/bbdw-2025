package com.redhat;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonProperty;

import dev.langchain4j.data.message.ChatMessage;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StoredChatMessage {
    @JsonProperty("message")
    private ChatMessage message;
    @JsonProperty("timestamp")
    private LocalDateTime timestamp;
}
