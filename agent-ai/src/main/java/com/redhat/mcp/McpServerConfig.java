package com.redhat.mcp;

public record McpServerConfig(
    String name,
    String url,
    String transportType, // "stdio" or "http"
    boolean logRequests,
    boolean logResponses
) {}
