package org.acme.config;

import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;
import java.util.List;
import java.util.Optional;

@ConfigMapping(prefix = "mcp.kubernetes")
public interface KubernetesServiceConfig {

    @WithDefault("default")
    String defaultNamespace();

    Optional<List<String>> restrictedNamespaces();

    @WithDefault("false")
    boolean allowClusterWide();

    @WithDefault("false")
    boolean dryRun();

    @WithDefault("200")
    int logTailLines();

    @WithDefault("1048576")
    int logByteLimit();

    @WithDefault("100")
    int eventsMaxItems();

    @WithDefault("10")
    int binpackingMaxNodes();

    @WithDefault("true")
    boolean includeNodeAllocatable();

    @WithDefault("true")
    boolean includeCapacityTotals();

    @WithDefault("true")
    boolean captureServiceSelectors();
}
