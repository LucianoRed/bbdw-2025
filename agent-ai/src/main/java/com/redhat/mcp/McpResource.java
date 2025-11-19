package com.redhat.mcp;

import java.util.List;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

@Path("/api/mcp")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class McpResource {

    @Inject
    McpManager mcpManager;

    @GET
    @Path("/servers")
    public List<McpServerConfig> listServers() {
        return mcpManager.listServers();
    }

    @POST
    @Path("/servers")
    public Response addServer(McpServerConfig config) {
        try {
            mcpManager.addServer(config);
            return Response.ok().build();
        } catch (Exception e) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(new ErrorResponse(e.getMessage()))
                    .build();
        }
    }

    @DELETE
    @Path("/servers/{name}")
    public Response removeServer(@PathParam("name") String name) {
        try {
            mcpManager.removeServer(name);
            return Response.ok().build();
        } catch (Exception e) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(new ErrorResponse(e.getMessage()))
                    .build();
        }
    }
    
    @GET
    @Path("/tools")
    public Response listAllTools() {
        try {
            var tools = mcpManager.getAllTools();
            var toolSummaries = tools.stream()
                    .map(t -> new ToolSummary(
                        t.name(), 
                        t.description(), 
                        t.parameters() != null ? t.parameters().toString() : "{}"
                    ))
                    .toList();
            return Response.ok(toolSummaries).build();
        } catch (Exception e) {
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(new ErrorResponse(e.getMessage()))
                    .build();
        }
    }
    
    @POST
    @Path("/test-tool")
    public Response testTool(TestToolRequest request) {
        try {
            dev.langchain4j.agent.tool.ToolExecutionRequest toolRequest = 
                dev.langchain4j.agent.tool.ToolExecutionRequest.builder()
                    .name(request.toolName())
                    .arguments(request.arguments())
                    .build();
            
            String result = mcpManager.executeTool(toolRequest);
            return Response.ok(new TestToolResponse(result, false)).build();
        } catch (Exception e) {
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(new TestToolResponse(null, true, e.getMessage()))
                    .build();
        }
    }

    public record ErrorResponse(String message) {}
    public record ToolSummary(String name, String description, String parameters) {}
    public record TestToolRequest(String toolName, String arguments) {}
    public record TestToolResponse(String result, boolean error, String message) {
        public TestToolResponse(String result, boolean error) {
            this(result, error, null);
        }
    }
}
