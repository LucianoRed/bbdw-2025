package com.redhat.mcp;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.mcp.client.DefaultMcpClient;
import dev.langchain4j.mcp.client.McpClient;
import dev.langchain4j.mcp.client.transport.McpTransport;
import dev.langchain4j.mcp.client.transport.http.StreamableHttpMcpTransport;
import dev.langchain4j.mcp.client.transport.stdio.StdioMcpTransport;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class McpManager {

    private final Map<String, McpClient> clients = new ConcurrentHashMap<>();
    private final Map<String, McpServerConfig> configs = new ConcurrentHashMap<>();

    public void addServer(McpServerConfig config) {
        try {
            McpTransport transport;
            if ("stdio".equalsIgnoreCase(config.transportType())) {
                // Assuming url contains the command for stdio
                List<String> cmd = List.of(config.url().split(" "));
                transport = new StdioMcpTransport.Builder()
                        .command(cmd)
                        .logEvents(config.logRequests())
                        .build();
            } else {
                // Default to HTTP
                transport = new StreamableHttpMcpTransport.Builder()
                        .url(config.url())
                        .logRequests(config.logRequests())
                        .logResponses(config.logResponses())
                        .build();
            }

            McpClient client = new DefaultMcpClient.Builder()
                    .transport(transport)
                    .build();

            // Initialize/Check health if possible, or just store it
            // client.initialize(); // Some versions require this

            clients.put(config.name(), client);
            configs.put(config.name(), config);
            Log.infof("MCP Server added: %s", config.name());
        } catch (Exception e) {
            Log.errorf("Failed to add MCP server %s: %s", config.name(), e.getMessage());
            throw new RuntimeException(e);
        }
    }

    public void removeServer(String name) {
        McpClient client = clients.remove(name);
        configs.remove(name);
        if (client != null) {
            try {
                client.close();
            } catch (Exception e) {
                Log.errorf("Error closing MCP client %s: %s", name, e.getMessage());
            }
        }
    }

    public List<McpServerConfig> listServers() {
        return new ArrayList<>(configs.values());
    }

    public List<ToolSpecification> getAllTools() {
        List<ToolSpecification> allTools = new ArrayList<>();
        for (Map.Entry<String, McpClient> entry : clients.entrySet()) {
            try {
                List<ToolSpecification> tools = entry.getValue().listTools();
                allTools.addAll(tools);
            } catch (Exception e) {
                Log.errorf("Error listing tools for client %s: %s", entry.getKey(), e.getMessage());
            }
        }
        return allTools;
    }

    public String executeTool(ToolExecutionRequest request) {
        // We need to find which client has this tool.
        // This is inefficient if we have many clients/tools.
        // A better way is to cache tool->client mapping.
        
        for (Map.Entry<String, McpClient> entry : clients.entrySet()) {
            try {
                // Check if client has the tool
                // Optimization: Cache this
                List<ToolSpecification> tools = entry.getValue().listTools();
                boolean hasTool = tools.stream().anyMatch(t -> t.name().equals(request.name()));
                
                if (hasTool) {
                    return entry.getValue().executeTool(request);
                }
            } catch (Exception e) {
                Log.errorf("Error checking/executing tool on client %s: %s", entry.getKey(), e.getMessage());
            }
        }
        throw new RuntimeException("Tool not found: " + request.name());
    }
}
