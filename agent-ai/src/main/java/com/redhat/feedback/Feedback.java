package com.redhat.feedback;

import java.time.Instant;

/**
 * Representa um feedback enviado pela plateia
 */
public record Feedback(
    String id,
    String text,
    Instant timestamp,
    boolean processed
) {
    public Feedback(String text) {
        this(
            java.util.UUID.randomUUID().toString(),
            text,
            Instant.now(),
            false
        );
    }
    
    public Feedback markAsProcessed() {
        return new Feedback(id, text, timestamp, true);
    }
}
