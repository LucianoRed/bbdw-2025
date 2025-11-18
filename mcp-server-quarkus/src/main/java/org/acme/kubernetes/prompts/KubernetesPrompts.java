package org.acme.kubernetes.prompts;

import io.quarkiverse.mcp.server.Prompt;
import io.quarkiverse.mcp.server.PromptArg;
import io.quarkiverse.mcp.server.PromptMessage;
import io.quarkiverse.mcp.server.TextContent;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;

@ApplicationScoped
public class KubernetesPrompts {

    @Prompt(name = "kubernetes_change_plan", description = "Guides an LLM to validate safety checks before invoking tools.")
    public PromptMessage changePlan(
            @PromptArg(description = "Short summary of the intended change.") String objective,
            @PromptArg(description = "Important context that was already collected from the cluster.", defaultValue = "") String context) {
        StringBuilder builder = new StringBuilder();
        builder.append("You are preparing a Kubernetes change with objective: \"")
                .append(objective)
                .append("\".\n");
        if (context != null && !context.isBlank()) {
            builder.append("Current observations:\n").append(context).append("\n\n");
        }
        builder.append("Always validate:\n")
                .append("1. Target namespace and workload identity.\n")
                .append("2. Desired steady state (replicas, resource bounds).\n")
                .append("3. Rollback or undo strategy.\n")
                .append("4. Additional data that should be collected via MCP tools before mutating resources.\n");
        return PromptMessage.withUserRole(new TextContent(builder.toString()));
    }

    @Prompt(name = "kubernetes_incident_report", description = "Produces a consistent summary for on-call handoff.")
    public List<PromptMessage> incidentReport(
            @PromptArg(description = "Incident name.") String incidentName,
            @PromptArg(description = "Impacted workloads or namespaces.") String impactScope,
            @PromptArg(description = "Links to MCP tool outputs already captured.", defaultValue = "") String references) {
        return List.of(
                PromptMessage.withUserRole(new TextContent(
                        "SYSTEM INSTRUCTION: You are an SRE documenting incidents using information from the MCP Kubernetes tools.")),
                PromptMessage.withUserRole(new TextContent(
                        "Create a concise incident summary for " + incidentName + " covering: \n"
                                + "- Impacted scope: " + impactScope + "\n"
                                + "- Primary signals/metrics\n"
                                + "- MCP tool outputs to review: " + (references == null ? "n/a" : references)
                                + "\n- Next investigative steps.")));
    }
}
