package org.acme.kubernetes.resources;

import io.fabric8.kubernetes.api.model.apps.Deployment;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.quarkiverse.mcp.server.Resource;
import io.quarkiverse.mcp.server.ResourceTemplate;
import io.quarkiverse.mcp.server.TextResourceContents;
import io.smallrye.common.annotation.Blocking;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.acme.config.KubernetesServiceConfig;

@ApplicationScoped
public class ClusterResources {

    private final KubernetesClient client;
    private final KubernetesServiceConfig config;

    @Inject
    public ClusterResources(KubernetesClient client, KubernetesServiceConfig config) {
        this.client = client;
        this.config = config;
    }

    @Resource(uri = "kubernetes://profile/default")
    @Blocking
    public TextResourceContents clusterProfile() {
        String description = "Default namespace: " + config.defaultNamespace()
                + "\nCluster-wide tools enabled: " + config.allowClusterWide()
                + "\nStructured responses include node capacity: " + config.includeCapacityTotals();
        return TextResourceContents.create("kubernetes://profile/default", description);
    }

    @Resource(uri = "kubernetes://guides/kubectl-safe-actions")
    @Blocking
    public TextResourceContents kubectlGuide() {
        String body = "Always confirm the namespace (`kubectl config view --minify -o yaml`).\n"
                + "1. Describe before mutate (`kubectl describe ...`).\n"
                + "2. Prefer server-side apply patches.\n"
                + "3. Keep a copy of the manifest in Git before changing live objects.\n"
                + "Use the MCP tools before falling back to kubectl for read-only inspection.";
        return TextResourceContents.create("kubernetes://guides/kubectl-safe-actions", body);
    }

    @ResourceTemplate(name = "deployment-manifest", uriTemplate = "kubernetes://namespaces/{namespace}/deployments/{name}")
    @Blocking
    public TextResourceContents deploymentManifest(String namespace, String name) {
        Deployment deployment = client.apps().deployments().inNamespace(namespace).withName(name).get();
        if (deployment == null) {
            throw new IllegalStateException("Deployment '" + name + "' not found in namespace '" + namespace + "'");
        }
        String yaml = io.fabric8.kubernetes.client.utils.Serialization.asYaml(deployment);
        return TextResourceContents.create(
                "kubernetes://namespaces/" + namespace + "/deployments/" + name,
                yaml);
    }
}
