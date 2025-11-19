package org.acme.config;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;

/**
 * Registers early Vert.x handlers to satisfy CORS preflight for /mcp* endpoints.
 * Avoids the IllegalArgumentException thrown by the MCP SSE handler on OPTIONS.
 */
@ApplicationScoped
public class CorsPreflightFilter {

    public void setup(@Observes Router router) {
        // Preflight handler (executed first via low order)
        router.options("/mcp*").order(-100).handler(this::handlePreflight);
        // Attach CORS headers for actual requests
        router.route("/mcp*").order(-90).handler(this::attachCors);
    }

    private void handlePreflight(RoutingContext ctx) {
        String origin = header(ctx, "Origin");
        String reqHeaders = header(ctx, "Access-Control-Request-Headers");
        if (reqHeaders == null || reqHeaders.isBlank()) {
            reqHeaders = "Content-Type,Authorization,Mcp-Session-Id";
        }
        if (origin == null || origin.isBlank()) {
            ctx.response()
                    .putHeader("Access-Control-Allow-Origin", "*")
                    .putHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
                    .putHeader("Access-Control-Allow-Headers", reqHeaders)
                    .putHeader("Access-Control-Max-Age", "86400")
                    .setStatusCode(204)
                    .end();
        } else {
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
    }

    private void attachCors(RoutingContext ctx) {
        String origin = header(ctx, "Origin");
        if (origin != null && !origin.isBlank()) {
            ctx.response()
                    .putHeader("Access-Control-Allow-Origin", origin)
                    .putHeader("Vary", "Origin")
                    .putHeader("Access-Control-Expose-Headers", "Mcp-Session-Id")
                    .putHeader("Access-Control-Allow-Credentials", "true");
        }
        ctx.next();
    }

    private static String header(RoutingContext ctx, String name) {
        String value = ctx.request().getHeader(name);
        return value == null ? null : value.trim();
    }
}
