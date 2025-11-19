package org.acme.config;

import io.quarkus.vertx.http.runtime.filters.RouteFilter;
import io.vertx.core.http.HttpMethod;
import io.vertx.ext.web.RoutingContext;

/**
 * Ensures CORS preflight (OPTIONS) for MCP endpoints does not hit the SSE/stream handlers.
 * Responds early with 204 and proper CORS headers so browsers can proceed.
 */
public class CorsPreflightFilter {

    private static final String MCP_PATH_PREFIX = "/mcp";

    @RouteFilter(10)
    void handleCors(RoutingContext ctx) {
        String path = ctx.request().path();
        if (path == null) {
            ctx.next();
            return;
        }

        boolean isMcpPath = path.startsWith(MCP_PATH_PREFIX);
        HttpMethod method = ctx.request().method();

        // Preflight handling for MCP endpoints
        if (isMcpPath && HttpMethod.OPTIONS.equals(method)) {
            String origin = header(ctx, "Origin");
            String reqMethod = header(ctx, "Access-Control-Request-Method");
            String reqHeaders = header(ctx, "Access-Control-Request-Headers");

            if (reqMethod == null || reqMethod.isBlank()) {
                reqMethod = "GET"; // browsers send the intended method, default to GET if missing
            }
            if (reqHeaders == null || reqHeaders.isBlank()) {
                reqHeaders = "Content-Type,Authorization,Mcp-Session-Id";
            }

            if (origin == null || origin.isBlank()) {
                // No Origin -> reply permissively without credentials
                ctx.response()
                        .putHeader("Access-Control-Allow-Origin", "*")
                        .putHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
                        .putHeader("Access-Control-Allow-Headers", reqHeaders)
                        .putHeader("Access-Control-Max-Age", "86400")
                        .setStatusCode(204)
                        .end();
            } else {
                // Echo origin and allow credentials when Origin is present
                ctx.response()
                        .putHeader("Access-Control-Allow-Origin", origin)
                        .putHeader("Vary", "Origin")
                        .putHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
                        .putHeader("Access-Control-Allow-Headers", reqHeaders)
                        .putHeader("Access-Control-Allow-Credentials", "true")
                        .putHeader("Access-Control-Max-Age", "86400")
                        .setStatusCode(204)
                        .end();
            }
            return; // stop pipeline, don't hit MCP handlers
        }

        // For non-OPTIONS MCP requests, attach CORS response headers if Origin is present
        if (isMcpPath) {
            String origin = header(ctx, "Origin");
            if (origin != null && !origin.isBlank()) {
                ctx.response()
                        .putHeader("Access-Control-Allow-Origin", origin)
                        .putHeader("Vary", "Origin")
                        .putHeader("Access-Control-Expose-Headers", "Mcp-Session-Id")
                        .putHeader("Access-Control-Allow-Credentials", "true");
            }
        }

        ctx.next();
    }

    private static String header(RoutingContext ctx, String name) {
        String value = ctx.request().getHeader(name);
        return value == null ? null : value.trim();
    }
}
