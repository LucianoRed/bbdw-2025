package com.redhat.mcp;

import io.quarkus.logging.Log;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;

/**
 * Registra automaticamente servidores MCP configurados via variáveis de ambiente
 * na inicialização da aplicação.
 *
 * Adicione variáveis de ambiente no padrão MCP_<NOME>_URL e chame autoRegister()
 * no método onStart() conforme necessário.
 */
@ApplicationScoped
public class McpAutoRegistrar {

    @Inject
    McpManager mcpManager;

    void onStart(@Observes StartupEvent ev) {
        // Adicione chamadas autoRegister() aqui para registrar MCPs via variáveis de ambiente
    }

    private void autoRegister(String name, String url) {
        if (url == null || url.isBlank()) {
            return;
        }
        // Não re-registra se já existe (ex: adicionado via UI antes do restart)
        boolean alreadyRegistered = mcpManager.listServers().stream()
                .anyMatch(s -> name.equals(s.name()));
        if (alreadyRegistered) {
            Log.infof("🔌 MCP '%s' já registrado, ignorando auto-registro.", name);
            return;
        }
        try {
            McpServerConfig config = new McpServerConfig(name, url, "http", false, false);
            mcpManager.addServer(config);
            Log.infof("✅ MCP '%s' auto-registrado via env var: %s", name, url);
        } catch (Exception e) {
            Log.warnf("⚠️ Falha ao auto-registrar MCP '%s' (%s): %s — o servidor pode ainda não estar disponível. Registre manualmente via UI.", name, url, e.getMessage());
        }
    }
}
