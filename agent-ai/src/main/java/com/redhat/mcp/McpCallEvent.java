package com.redhat.mcp;

import java.time.Instant;

/**
 * Representa um evento de chamada MCP Tool
 */
public class McpCallEvent {
    private String toolName;
    private String status; // "calling", "completed", "error"
    private Instant timestamp;
    private String requestId;
    
    public McpCallEvent(String requestId, String toolName, String status) {
        this.requestId = requestId;
        this.toolName = toolName;
        this.status = status;
        this.timestamp = Instant.now();
    }
    
    public String getToolName() {
        return toolName;
    }
    
    public void setToolName(String toolName) {
        this.toolName = toolName;
    }
    
    public String getStatus() {
        return status;
    }
    
    public void setStatus(String status) {
        this.status = status;
    }
    
    public Instant getTimestamp() {
        return timestamp;
    }
    
    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }
    
    public String getRequestId() {
        return requestId;
    }
    
    public void setRequestId(String requestId) {
        this.requestId = requestId;
    }
}
