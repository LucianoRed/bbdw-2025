package com.redhat.mcp;

import java.util.function.Supplier;

import dev.langchain4j.service.tool.ToolProvider;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/**
 * Supplier para o DynamicMcpToolProvider.
 * 
 * Use esta classe na configuração de AI Services para habilitar
 * tools dinâmicas:
 * 
 * @RegisterAiService(toolProviderSupplier = DynamicMcpToolProviderSupplier.class)
 * public interface MyAiService {
 *     String chat(String message);
 * }
 */
@ApplicationScoped
public class DynamicMcpToolProviderSupplier implements Supplier<ToolProvider> {

    @Inject
    DynamicMcpToolProvider provider;

    @Override
    public ToolProvider get() {
        return provider;
    }
}
