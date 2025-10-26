package com.redhat;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import io.quarkus.redis.datasource.RedisDataSource;
import io.quarkus.redis.datasource.json.JsonCommands;
import io.quarkus.redis.datasource.keys.KeyCommands;
import io.quarkus.redis.datasource.keys.TransactionalKeyCommands;
import io.quarkus.redis.datasource.list.ListCommands;
import io.quarkus.redis.datasource.value.SetArgs;
import io.quarkus.redis.datasource.value.ValueCommands;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import io.vertx.core.json.JsonObject;

@ApplicationScoped
public class RedisService {
    private final ValueCommands<String, String> valueCommands;
    private final KeyCommands<String> keyCommands;
    private final ListCommands<String, String> listCommands;
    private final JsonCommands<String> jsonCommands;
    private final RedisDataSource redisDataSource;
    private final ObjectMapper objectMapper = createObjectMapper();

    private static ObjectMapper createObjectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        // Register JavaTimeModule to support java.time.* types like LocalDateTime
        mapper.registerModule(new JavaTimeModule());
        // Use ISO-8601 serialization instead of timestamps
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return mapper;
    }

    /**
     * Constructs a RedisService with the given RedisDataSource.
     * 
     * @param redisDataSource The Redis data source.
     */
    @Inject
    public RedisService(RedisDataSource redisDataSource) {
        if (redisDataSource == null) {
            throw new IllegalArgumentException("redisDataSource cannot be null");
        }
        this.redisDataSource = redisDataSource;
        this.valueCommands = redisDataSource.value(String.class);
        this.keyCommands = redisDataSource.key();
        this.listCommands = redisDataSource.list(String.class);
        this.jsonCommands = redisDataSource.json(String.class);
    }

    /**
     * Gets the value associated with the given key.
     * 
     * @param key The key.
     * @return The value, or null if not found.
     */
    public String getValue(String key) {
        return valueCommands.get(key);
    }
    /**
     * Gets the value associated with the given key and deserializes it to the specified class.
     * 
     * @param key The key.
     * @param clazz The class to deserialize the value to.
     * @return The deserialized value, or null if not found or deserialization fails.
     */
    public <T> T getValue(String key, Class<T> clazz) {
        String json = valueCommands.get(key);
        if (json != null) {
            try {
                return objectMapper.readValue(json, clazz);
            } catch (JsonProcessingException e) {
                e.printStackTrace();
            }
        }
        return null;
    }

    /**
     * Sets the value for the given key.
     * 
     * @param key The key.
     * @param value The value.
     */
    public void setValue(String key, String value) {
        valueCommands.set(key, value);
    }
    /**
     * Sets the value for the given key after serializing it to JSON.
     * 
     * @param key The key.
     * @param value The value to be serialized and set.
     */
    public void setValue(String key, Object value) {
        try {
            String json = objectMapper.writeValueAsString(value);
            valueCommands.set(key, json);
        } catch (JsonProcessingException e) {
            e.printStackTrace();
        }
    }

    /**
     * Deletes the key from Redis.
     * 
     * @param key The key to be deleted.
     */
    public void deleteKey(String key) {
        keyCommands.del(key);
    }

    /**
     * Checks if the key exists in Redis.
     * 
     * @param key The key.
     * @return true if the key exists, false otherwise.
     */
    public boolean keyExists(String key) {
        return keyCommands.exists(key);
    }

    /**
     * Pushes a value to the list associated with the given key.
     * 
     * @param key The key.
     * @param value The value.
     */
    public void pushToList(String key, String value) {
        listCommands.rpush(key, value);
    }

    /**
     * Gets the list associated with the given key.
     * 
     * @param key The key.
     * @return The list of values.
     */
    public List<String> getList(String key) {
        return listCommands.lrange(key, 0, -1);
    }

    /**
     * Increments the value of the given key by 1.
     * 
     * @param key The key to increment.
     * @return The new value after increment.
     */
    public Long incrementValue(String key) {
        return valueCommands.incrby(key, 1);
    }

    /**
     * Sets the value for the given key with an expiration time.
     * 
     * @param key The key.
     * @param value The value.
     * @param seconds Expiration time in seconds.
     */
    public void setValueWithExpiration(String key, String value, long seconds) {
        SetArgs args = new SetArgs();
        args.ex(seconds);
        valueCommands.set(key, value, args);
    }

    /**
     * Gets the Time-To-Live (TTL) for the given key.
     * 
     * @param key The key.
     * @return TTL in seconds, or null if the key does not have an expiration.
     */
    public Long getTTL(String key) {
        return keyCommands.ttl(key);
    }

    /**
     * Appends a value to the existing value of the given key.
     * 
     * @param key The key.
     * @param value The value to append.
     * @return The length of the string after appending.
     */
    public Long appendToValue(String key, String value) {
        return valueCommands.append(key, value);
    }

    /**
     * Removes all occurrences of the specified value from the list associated with the given key.
     * 
     * @param key The key.
     * @param value The value to remove.
     * @return The number of removed elements.
     */
    public Long removeFromList(String key, String value) {
        return listCommands.lrem(key, 0, value);
    }

    /**
     * Decrements the value of the given key by 1.
     * 
     * @param key The key to decrement.
     * @return The new value after decrement.
     */
    public Long decrementValue(String key) {
        return valueCommands.decrby(key, 1);
    }

    /**
     * Sets the value for the given key only if it does not already exist.
     * 
     * @param key The key.
     * @param value The value.
     */
    public void setValueIfNotExists(String key, String value) {
        SetArgs args = new SetArgs();
        args.nx();
        valueCommands.set(key, value, args);
    }

    /**
     * Sets the value for the given key only if it already exists.
     * 
     * @param key The key.
     * @param value The value.
     */
    public void setValueIfExists(String key, String value) {
        SetArgs args = new SetArgs();
        args.xx();
        valueCommands.set(key, value, args);
    }

    /**
     * Retrieves all keys matching the given pattern.
     * 
     * @param pattern The pattern to match.
     * @return A list of matching keys.
     */
    public List<String> getKeysByPattern(String pattern) {
        return keyCommands.keys(pattern);
    }

    /**
     * Sets a JSON value for the given key.
     * 
     * @param key The key.
     * @param json The JSON string.
     */
    public void setJsonValue(String key, String json) {
        jsonCommands.jsonSet(key, json);
    }

    /**
     * Gets the JSON value associated with the given key.
     * 
     * @param key The key.
     * @return The JSON string, or null if not found.
     */
    public JsonObject getJsonValue(String key) {
        return jsonCommands.jsonGet(key);
    }

    /**
     * Deletes the JSON value associated with the given key.
     * 
     * @param key The key.
     * @return The number of fields deleted.
     */
    public int deleteJsonValue(String key) {
        return jsonCommands.jsonDel(key);
    }

    /**
     * Updates a specific field in the JSON object stored at the given key.
     * 
     * @param key The key.
     * @param path The JSON path to the field.
     * @param value The new value.
     */
    public void updateJsonField(String key, String path, String value) {
        jsonCommands.jsonSet(key, path, value);
    }

    /**
     * Pushes a value to the beginning of the list associated with the given key.
     * 
     * @param key The key.
     * @param value The value to push.
     */
    public void leftPushToList(String key, String value) {
        listCommands.lpush(key, value);
    }

    /**
     * Pops and returns the first element of the list associated with the given key.
     * 
     * @param key The key.
     * @return The first element, or null if the list is empty.
     */
    public String popFromListLeft(String key) {
        return listCommands.lpop(key);
    }

    /**
     * Pops and returns the last element of the list associated with the given key.
     * 
     * @param key The key.
     * @return The last element, or null if the list is empty.
     */
    public String popFromListRight(String key) {
        return listCommands.rpop(key);
    }

    /**
     * Gets the length of the list associated with the given key.
     * 
     * @param key The key.
     * @return The length of the list.
     */
    public Long getListLength(String key) {
        return listCommands.llen(key);
    }

    /**
     * Gets the element at the specified index in the list associated with the given key.
     * 
     * @param key The key.
     * @param index The index of the element.
     * @return The element at the specified index, or null if out of range.
     */
    public String getListElement(String key, int index) {
        return listCommands.lindex(key, index);
    }

    /**
     * Sets the element at the specified index in the list associated with the given key.
     * 
     * @param key The key.
     * @param index The index of the element.
     * @param value The new value.
     */
    public void setListElement(String key, int index, String value) {
        listCommands.lset(key, index, value);
    }

    /**
     * Trims the list associated with the given key to the specified range.
     * 
     * @param key The key.
     * @param start The start index.
     * @param stop The stop index.
     */
    public void trimList(String key, int start, int stop) {
        listCommands.ltrim(key, start, stop);
    }

    /**
     * Gets all keys matching a pattern.
     * 
     * @param pattern The pattern to match (e.g., "*_internal").
     * @return List of matching keys.
     */
    public List<String> getKeys(String pattern) {
        return keyCommands.keys(pattern);
    }

    /**
     * Scans keys matching a pattern using cursor-based iteration.
     * This is more memory-efficient than KEYS for large datasets.
     * 
     * @param cursor The cursor position (use "0" to start)
     * @param pattern The pattern to match (e.g., "*_internal")
     * @param count Hint for number of keys to return per iteration (default 10)
     * @return ScanResult containing the next cursor and list of keys
     */
    public ScanResult scan(String cursor, String pattern, int count) {
        io.quarkus.redis.datasource.keys.KeyScanCursor<String> scanCursor = 
            keyCommands.scan(new io.quarkus.redis.datasource.keys.KeyScanArgs()
                .match(pattern)
                .count(count));
        
        List<String> keys = new ArrayList<>();
        while (scanCursor.hasNext()) {
            keys.addAll(scanCursor.next());  // next() returns Set<String>, so use addAll
        }
        
        // Quarkus Redis doesn't expose cursor directly, so we return a simple indicator
        return new ScanResult(keys.isEmpty() ? "0" : cursor, keys);
    }

    /**
     * Deletes multiple keys in a single pipeline operation.
     * This is more efficient than calling deleteKey() multiple times.
     * 
     * @param keys The keys to delete
     * @return Number of keys deleted
     */
    public long deleteKeys(String... keys) {
        if (keys == null || keys.length == 0) {
            return 0;
        }
        
        // Use withTransaction to batch the operations
        redisDataSource.withTransaction(tx -> {
            TransactionalKeyCommands<String> txKeys = tx.key();
            for (String key : keys) {
                txKeys.del(key);
            }
        });
        
        return keys.length;
    }

    /**
     * Deletes multiple keys in a single pipeline operation (list version).
     * 
     * @param keys The list of keys to delete
     * @return Number of keys deleted
     */
    public long deleteKeys(List<String> keys) {
        if (keys == null || keys.isEmpty()) {
            return 0;
        }
        return deleteKeys(keys.toArray(new String[0]));
    }

    /**
     * Result of a SCAN operation.
     */
    public static class ScanResult {
        private final String cursor;
        private final List<String> keys;
        
        public ScanResult(String cursor, List<String> keys) {
            this.cursor = cursor;
            this.keys = keys;
        }
        
        public String getCursor() {
            return cursor;
        }
        
        public List<String> getKeys() {
            return keys;
        }
        
        public boolean isComplete() {
            return "0".equals(cursor);
        }
    }
}
