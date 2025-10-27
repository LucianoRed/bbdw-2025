package com.redhat.redis;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.ChatMessageDeserializer;
import dev.langchain4j.data.message.ChatMessageSerializer;
import dev.langchain4j.store.memory.chat.ChatMemoryStore;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import io.quarkus.logging.Log;
import io.vertx.core.json.JsonObject;

@ApplicationScoped
public class RedisChatMemoryStore implements ChatMemoryStore {
    
    @Inject
    private RedisService redisService;

    @PostConstruct
    void init() {
        if (redisService == null) {
            throw new IllegalStateException("redisService is null in RedisChatMemoryStore");
        }
    }

    /**
     * Retrieves the chat messages associated with the given memory ID.
     *
     * @param memoryId the ID of the memory to retrieve messages for
     * @return a list of chat messages
     */
    @Override
    public List<ChatMessage> getMessages(Object memoryId) {
        List<String> jsonList = redisService.getList(toMemoryIdString(memoryId));
        List<ChatMessage> messages = new ArrayList<>();
        for (String json : jsonList) {
            StoredChatMessage storedMessage = deserializeStoredChatMessage(json);
            if (storedMessage != null && storedMessage.getMessage() != null) {
                messages.add(storedMessage.getMessage());
            }
        }
        return messages;
    }

    /**
     * Updates the chat messages associated with the given memory ID.
     *
     * @param memoryId the ID of the memory to update messages for
     * @param messages the list of chat messages to be stored
     */
    @Override
    public void updateMessages(Object memoryId, List<ChatMessage> messages) {
        redisService.deleteKey(toMemoryIdString(memoryId));
        for (ChatMessage message : messages) {
            StoredChatMessage storedMessage = new StoredChatMessage(message, LocalDateTime.now());
            String json = serializeStoredChatMessage(storedMessage);
            redisService.pushToList(toMemoryIdString(memoryId), json);
        }
    }

    /**
     * Deletes the chat messages associated with the given memory ID.
     *
     * @param memoryId the ID of the memory to delete messages for
     */
    @Override
    public void deleteMessages(Object memoryId) {
        redisService.deleteKey(toMemoryIdString(memoryId));
        Log.debugf("Mensagens deletadas do Redis para memoryId: %s", toMemoryIdString(memoryId));
    }

    private String serializeStoredChatMessage(StoredChatMessage storedMessage) {
        String messageJson = ChatMessageSerializer.messageToJson(storedMessage.getMessage());
        JsonObject jsonObject = new JsonObject();
        jsonObject.put("message", new JsonObject(messageJson));
        jsonObject.put("timestamp", storedMessage.getTimestamp().toString());
        return jsonObject.encode();
    }

    private StoredChatMessage deserializeStoredChatMessage(String json) {
        try {
            JsonObject jsonObject = new JsonObject(json);
            JsonObject messageJsonObject = jsonObject.getJsonObject("message");
            String timestampStr = jsonObject.getString("timestamp");

            // Fix for AiMessage deserialization issue with empty toolExecutionRequests
            if ("ai".equals(messageJsonObject.getString("type"))) {
                JsonObject toolExecutionRequests = messageJsonObject.getJsonObject("toolExecutionRequests");
                if (toolExecutionRequests != null && toolExecutionRequests.isEmpty()) {
                    messageJsonObject.remove("toolExecutionRequests");
                }
            }

            ChatMessage message = ChatMessageDeserializer.messageFromJson(messageJsonObject.encode());
            LocalDateTime timestamp = LocalDateTime.parse(timestampStr);

            return new StoredChatMessage(message, timestamp);
        } catch (Exception e) {
            Log.warn("Failed to deserialize chat message, skipping: " + e.getMessage());
            e.printStackTrace();
            return null;
        }
    }

    /**
     * Converts the provided memory ID to a string.
     *
     * @param memoryId the memory ID to be converted
     * @return the memory ID as a string
     * @throws IllegalArgumentException if the memory ID is null or empty
     */
    private static String toMemoryIdString(Object memoryId) {
        boolean isNullOrEmpty = memoryId == null || memoryId.toString().trim().isEmpty();
        if (isNullOrEmpty) {
            throw new IllegalArgumentException("memoryId cannot be null or empty");
        }
        String id = memoryId.toString();
        // Normalize keys to use the chat-memory prefix so other components can reliably
        // discover keys using the pattern "chat-memory:*" (used by the compaction service).
        if (id.startsWith("chat-memory:")) {
            return id;
        }
        return "chat-memory:" + id;
    }
}
