package org.acme.kubernetes;

import io.fabric8.kubernetes.api.model.Container;
import io.fabric8.kubernetes.api.model.EnvVar;
import io.fabric8.kubernetes.api.model.GenericKubernetesResource;
import io.fabric8.kubernetes.api.model.GenericKubernetesResourceList;
import io.fabric8.kubernetes.api.model.Node;
import io.fabric8.kubernetes.api.model.NodeCondition;
import io.fabric8.kubernetes.api.model.NodeStatus;
import io.fabric8.kubernetes.api.model.ObjectMetaBuilder;
import io.fabric8.kubernetes.api.model.PersistentVolume;
import io.fabric8.kubernetes.api.model.PersistentVolumeClaim;
import io.fabric8.kubernetes.api.model.PersistentVolumeClaimSpec;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.Quantity;
import io.fabric8.kubernetes.api.model.Service;
import io.fabric8.kubernetes.api.model.ServicePort;
import io.fabric8.kubernetes.api.model.ServiceSpec;
import io.fabric8.kubernetes.api.model.apps.Deployment;
import io.fabric8.kubernetes.api.model.apps.DeploymentBuilder;
import io.fabric8.kubernetes.api.model.apps.DeploymentList;
import io.fabric8.kubernetes.api.model.apps.DeploymentSpec;
import io.fabric8.kubernetes.api.model.apps.DeploymentStatus;
import io.fabric8.kubernetes.api.model.events.v1.Event;
import io.fabric8.kubernetes.api.model.events.v1.EventList;
import io.fabric8.kubernetes.api.model.events.v1.EventSeries;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.dsl.MixedOperation;
import io.fabric8.kubernetes.client.dsl.PodResource;
import io.fabric8.kubernetes.client.dsl.Resource;
import io.fabric8.kubernetes.client.utils.Serialization;
import io.quarkiverse.mcp.server.Tool;
import io.quarkiverse.mcp.server.ToolArg;
import io.quarkiverse.mcp.server.ToolCallException;
import io.smallrye.common.annotation.Blocking;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.Instant;
import java.lang.reflect.Method;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.acme.config.KubernetesServiceConfig;
import org.acme.kubernetes.dto.BinpackingNode;
import org.acme.kubernetes.dto.BinpackingSummary;
import org.acme.kubernetes.dto.BulkVpaOperationResult;
import org.acme.kubernetes.dto.ClusterOverview;
import org.acme.kubernetes.dto.DeploymentSummary;
import org.acme.kubernetes.dto.EnvVarPatchResult;
import org.acme.kubernetes.dto.EventInfo;
import org.acme.kubernetes.dto.MachineSetSummary;
import org.acme.kubernetes.dto.NodeCapacity;
import org.acme.kubernetes.dto.OperationStatus;
import org.acme.kubernetes.dto.PersistentVolumeClaimInfo;
import org.acme.kubernetes.dto.PersistentVolumeInfo;
import org.acme.kubernetes.dto.PodLogsResult;
import org.acme.kubernetes.dto.ScaleOperationResult;
import org.acme.kubernetes.dto.ServicePortInfo;
import org.acme.kubernetes.dto.ServiceSummary;
import org.acme.kubernetes.dto.StorageOverview;
import org.acme.kubernetes.dto.VpaSummary;
import org.acme.kubernetes.service.CustomResourceContexts;

@ApplicationScoped
public class KubernetesTools {

    private final KubernetesClient client;
    private final KubernetesServiceConfig config;

    @Inject
    public KubernetesTools(KubernetesClient client, KubernetesServiceConfig config) {
        this.client = client;
        this.config = config;
    }

    private String resolveNamespace(String candidate) {
        String resolved = (candidate == null || candidate.isBlank()) ? config.defaultNamespace() : candidate.trim();
        ensureNamespaceAllowed(resolved);
        return resolved;
    }

    private void ensureNamespaceAllowed(String namespace) {
        config.restrictedNamespaces().ifPresent(allowed -> {
            if (!allowed.contains(namespace)) {
                throw new ToolCallException("Namespace '" + namespace + "' is not allowed by configuration");
            }
        });
    }

    private void ensureClusterWideAllowed(String operation) {
        if (!config.allowClusterWide()) {
            throw new ToolCallException(operation + " requires cluster-wide access but it is disabled in the configuration");
        }
    }

    private static Map<String, String> sorted(Map<String, String> input) {
        if (input == null || input.isEmpty()) {
            return Map.of();
        }
        return new TreeMap<>(input);
    }

    private static List<String> containerNames(Deployment deployment) {
        DeploymentSpec spec = deployment.getSpec();
        if (spec == null || spec.getTemplate() == null || spec.getTemplate().getSpec() == null
                || spec.getTemplate().getSpec().getContainers() == null) {
            return List.of();
        }
        return spec.getTemplate().getSpec().getContainers().stream()
                .map(Container::getName)
                .filter(Objects::nonNull)
                .toList();
    }

    private static int safeInt(Integer value) {
        return value == null ? 0 : value;
    }

    private static Map<String, Integer> aggregatePodPhases(List<Pod> pods) {
        Map<String, Integer> phases = new TreeMap<>();
        for (Pod pod : pods) {
            String phase = Optional.ofNullable(pod.getStatus())
                    .map(status -> status.getPhase() == null ? "UNKNOWN" : status.getPhase())
                    .orElse("UNKNOWN");
            phases.merge(phase, 1, Integer::sum);
        }
        return phases;
    }

    private MixedOperation<GenericKubernetesResource, GenericKubernetesResourceList, Resource<GenericKubernetesResource>> vpaClient() {
        return client.genericKubernetesResources(CustomResourceContexts.VPA_CONTEXT);
    }

    private MixedOperation<GenericKubernetesResource, GenericKubernetesResourceList, Resource<GenericKubernetesResource>> machineSetClient() {
        return client.genericKubernetesResources(CustomResourceContexts.MACHINE_SET_CONTEXT);
    }

    private static long parseCpu(String value) {
        if (value == null || value.isBlank()) {
            return 0;
        }
        String trimmed = value.trim();
        if (trimmed.endsWith("m")) {
            return Long.parseLong(trimmed.substring(0, trimmed.length() - 1));
        }
        return Long.parseLong(trimmed) * 1000;
    }

    private static long parseMemory(String value) {
        if (value == null || value.isBlank()) {
            return 0;
        }
        String upper = value.trim().toUpperCase(Locale.ROOT);
        long factor = 1;
        if (upper.endsWith("KI")) {
            factor = 1024L;
            upper = upper.substring(0, upper.length() - 2);
        } else if (upper.endsWith("MI")) {
            factor = 1024L * 1024L;
            upper = upper.substring(0, upper.length() - 2);
        } else if (upper.endsWith("GI")) {
            factor = 1024L * 1024L * 1024L;
            upper = upper.substring(0, upper.length() - 2);
        } else if (upper.endsWith("TI")) {
            factor = 1024L * 1024L * 1024L * 1024L;
            upper = upper.substring(0, upper.length() - 2);
        } else if (upper.endsWith("M")) {
            factor = 1000L * 1000L;
            upper = upper.substring(0, upper.length() - 1);
        } else if (upper.endsWith("G")) {
            factor = 1000L * 1000L * 1000L;
            upper = upper.substring(0, upper.length() - 1);
        }
        return (long) (Double.parseDouble(upper) * factor);
    }

    private static String bytesToHuman(long bytes) {
        if (bytes <= 0) {
            return "0";
        }
        String[] units = { "B", "KiB", "MiB", "GiB", "TiB" };
        double value = bytes;
        int unitIndex = 0;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value = value / 1024;
            unitIndex++;
        }
        return String.format(Locale.ROOT, "%.1f%s", value, units[unitIndex]);
    }

    private static Map<String, String> convertQuantities(Map<String, Quantity> source) {
        if (source == null || source.isEmpty()) {
            return Map.of();
        }
        Map<String, String> result = new TreeMap<>();
        source.forEach((key, quantity) -> {
            if (quantity != null) {
                result.put(key, quantity.getAmount());
            }
        });
        return result;
    }

    private static Map<String, String> aggregateCapacity(List<Node> nodes, Function<Node, Map<String, Quantity>> extractor) {
        long cpu = 0;
        long memory = 0;
        long pods = 0;
        for (Node node : nodes) {
            Map<String, Quantity> map = extractor.apply(node);
            if (map == null) {
                continue;
            }
            cpu += parseCpu(Optional.ofNullable(map.get("cpu")).map(Quantity::getAmount).orElse(null));
            memory += parseMemory(Optional.ofNullable(map.get("memory")).map(Quantity::getAmount).orElse(null));
            pods += Optional.ofNullable(map.get("pods")).map(Quantity::getAmount).map(Long::parseLong).orElse(0L);
        }
        Map<String, String> totals = new LinkedHashMap<>();
        totals.put("cpu", cpu + "m");
        totals.put("memory", bytesToHuman(memory));
        totals.put("pods", String.valueOf(pods));
        return totals;
    }

    private static NodeCapacity toNodeCapacity(Node node) {
        NodeStatus status = node.getStatus();
        Map<String, String> capacity = convertQuantities(status == null ? Map.of() : nullSafeQuantityMap(status.getCapacity()));
        Map<String, String> allocatable = convertQuantities(status == null ? Map.of() : nullSafeQuantityMap(status.getAllocatable()));
        return new NodeCapacity(
                Optional.ofNullable(node.getMetadata()).map(meta -> meta.getName()).orElse(""),
                capacity,
                allocatable,
                sorted(Optional.ofNullable(node.getMetadata()).map(meta -> meta.getLabels()).orElse(Map.of())));
    }

    private static Map<String, Quantity> nullSafeQuantityMap(Map<String, Quantity> map) {
        return map == null ? Map.of() : map;
    }

    private static DeploymentSummary toDeploymentSummary(Deployment deployment) {
        DeploymentSpec spec = deployment.getSpec();
        DeploymentStatus status = deployment.getStatus();
        Map<String, String> selector = spec != null && spec.getSelector() != null
                ? sorted(spec.getSelector().getMatchLabels())
                : Map.of();
        return new DeploymentSummary(
                Optional.ofNullable(deployment.getMetadata()).map(meta -> meta.getNamespace()).orElse(""),
                Optional.ofNullable(deployment.getMetadata()).map(meta -> meta.getName()).orElse(""),
                spec != null && spec.getReplicas() != null ? spec.getReplicas() : 0,
                safeInt(status != null ? status.getReadyReplicas() : null),
                safeInt(status != null ? status.getAvailableReplicas() : null),
                sorted(Optional.ofNullable(deployment.getMetadata()).map(meta -> meta.getLabels()).orElse(Map.of())),
                selector,
                containerNames(deployment));
    }

    private Container resolveContainer(Deployment deployment, String containerName) {
        var podSpec = Optional.ofNullable(deployment.getSpec())
                .map(DeploymentSpec::getTemplate)
                .map(template -> template.getSpec())
                .orElseThrow(() -> new ToolCallException("Deployment template is missing a pod spec"));
        List<Container> containers = Optional.ofNullable(podSpec.getContainers()).orElse(List.of());
        if (containers.isEmpty()) {
            throw new ToolCallException("Deployment does not define containers");
        }
        if (containerName == null || containerName.isBlank()) {
            return containers.get(0);
        }
        return containers.stream()
                .filter(container -> containerName.equals(container.getName()))
                .findFirst()
                .orElseThrow(() -> new ToolCallException(
                        "Container '" + containerName + "' not found. Available containers: "
                                + containers.stream().map(Container::getName).filter(Objects::nonNull).toList()));
    }

    private static ServiceSummary toServiceSummary(Service service) {
        ServiceSpec spec = service.getSpec();
        List<ServicePortInfo> ports = spec != null && spec.getPorts() != null
                ? spec.getPorts().stream()
                        .map(port -> new ServicePortInfo(port.getName(), port.getProtocol(), port.getPort(),
                                port.getTargetPort() != null ? port.getTargetPort().getIntVal() : null,
                                port.getNodePort()))
                        .toList()
                : List.of();
        return new ServiceSummary(
                Optional.ofNullable(service.getMetadata()).map(meta -> meta.getNamespace()).orElse(""),
                Optional.ofNullable(service.getMetadata()).map(meta -> meta.getName()).orElse(""),
                spec != null ? spec.getType() : "",
                spec != null ? spec.getClusterIP() : "",
                ports,
                spec != null ? sorted(spec.getSelector()) : Map.of(),
                sorted(Optional.ofNullable(service.getMetadata()).map(meta -> meta.getLabels()).orElse(Map.of())));
    }

    private static PersistentVolumeClaimInfo toPvcInfo(PersistentVolumeClaim pvc) {
        var spec = pvc.getSpec();
        String requested = Optional.ofNullable(spec)
                .map(PersistentVolumeClaimSpec::getResources)
                .map(resources -> resources.getRequests())
                .filter(Objects::nonNull)
                .map(requests -> requests.get("storage"))
                .map(Quantity::getAmount)
                .orElse("");
        return new PersistentVolumeClaimInfo(
                Optional.ofNullable(pvc.getMetadata()).map(meta -> meta.getNamespace()).orElse(""),
                Optional.ofNullable(pvc.getMetadata()).map(meta -> meta.getName()).orElse(""),
                Optional.ofNullable(pvc.getStatus()).map(status -> status.getPhase()).orElse(""),
                spec != null ? spec.getStorageClassName() : "",
                spec != null ? spec.getVolumeName() : "",
                requested);
    }

    private static PersistentVolumeInfo toPvInfo(PersistentVolume pv) {
        var spec = pv.getSpec();
        var capacity = spec != null ? spec.getCapacity() : null;
        String storage = capacity != null && capacity.get("storage") != null ? capacity.get("storage").getAmount() : "";
        return new PersistentVolumeInfo(
                Optional.ofNullable(pv.getMetadata()).map(meta -> meta.getName()).orElse(""),
                Optional.ofNullable(pv.getStatus()).map(status -> status.getPhase()).orElse(""),
                spec != null ? spec.getStorageClassName() : "",
                storage,
                spec != null ? Optional.ofNullable(spec.getAccessModes()).orElse(List.of()) : List.of());
    }

    private static Map<String, String> nodeConditions(Node node) {
        if (node.getStatus() == null || node.getStatus().getConditions() == null) {
            return Map.of();
        }
        return node.getStatus().getConditions().stream()
                .collect(Collectors.toMap(NodeCondition::getType, NodeCondition::getStatus, (left, right) -> right, TreeMap::new));
    }

    private static List<String> parseCsv(String csv) {
        if (csv == null || csv.isBlank()) {
            return List.of();
        }
        return Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(part -> !part.isEmpty())
                .toList();
    }

    private static Map<String, String> buildResourceBounds(String cpu, String memory) {
        Map<String, String> map = new LinkedHashMap<>();
        if (cpu != null && !cpu.isBlank()) {
            map.put("cpu", cpu.trim());
        }
        if (memory != null && !memory.isBlank()) {
            map.put("memory", memory.trim());
        }
        return map;
    }

    private static GenericKubernetesResource buildVpaResource(String namespace, String name, String targetKind,
            String targetName, String targetApiVersion, String updateMode, List<String> controlledResources,
            Map<String, String> minAllowed, Map<String, String> maxAllowed) {
        GenericKubernetesResource resource = new GenericKubernetesResource();
        resource.setApiVersion("autoscaling.k8s.io/v1");
        resource.setKind("VerticalPodAutoscaler");
        resource.setMetadata(new ObjectMetaBuilder().withName(name).withNamespace(namespace).build());
        Map<String, Object> spec = new LinkedHashMap<>();
        spec.put("targetRef", Map.of(
                "apiVersion", targetApiVersion,
                "kind", targetKind,
                "name", targetName));
        spec.put("updatePolicy", Map.of("updateMode", updateMode));
        if (!controlledResources.isEmpty() || !minAllowed.isEmpty() || !maxAllowed.isEmpty()) {
            Map<String, Object> containerPolicy = new LinkedHashMap<>();
            containerPolicy.put("containerName", "*");
            if (!controlledResources.isEmpty()) {
                containerPolicy.put("controlledResources", controlledResources);
            }
            if (!minAllowed.isEmpty()) {
                containerPolicy.put("minAllowed", minAllowed);
            }
            if (!maxAllowed.isEmpty()) {
                containerPolicy.put("maxAllowed", maxAllowed);
            }
            spec.put("resourcePolicy", Map.of("containerPolicies", List.of(containerPolicy)));
        }
        resource.setAdditionalProperty("spec", spec);
        return resource;
    }

    private static Instant eventTimestamp(Event event) {
        Instant fromEventTime = tryParseInstant(event.getEventTime());
        if (fromEventTime != null) {
            return fromEventTime;
        }
        Instant fromSeries = event.getSeries() != null ? tryParseInstant(event.getSeries().getLastObservedTime()) : null;
        if (fromSeries != null) {
            return fromSeries;
        }
        Instant deprecated = tryParseInstant(event.getDeprecatedLastTimestamp());
        if (deprecated != null) {
            return deprecated;
        }
        return tryParseInstant(Optional.ofNullable(event.getMetadata()).map(meta -> meta.getCreationTimestamp()).orElse(null));
    }

    private static Instant tryParseInstant(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof java.time.OffsetDateTime offsetDateTime) {
            return offsetDateTime.toInstant();
        }
        if (value instanceof String text) {
            try {
                return Instant.parse(text);
            } catch (DateTimeParseException ignored) {
                return null;
            }
        }
        try {
            Method method = value.getClass().getMethod("getTime");
            Object nested = method.invoke(value);
            return tryParseInstant(nested);
        } catch (ReflectiveOperationException ignored) {
            return null;
        }
    }

    private static EventInfo toEventInfo(Event event) {
        var regarding = event.getRegarding();
        Integer count = event.getSeries() != null && event.getSeries().getCount() != null ? event.getSeries().getCount()
                : event.getDeprecatedCount();
        return new EventInfo(
                Optional.ofNullable(event.getMetadata()).map(meta -> meta.getNamespace()).orElse(""),
                regarding != null ? regarding.getKind() : "",
                regarding != null ? regarding.getName() : "",
                event.getType(),
                event.getReason(),
                event.getNote(),
                eventTimestamp(event),
                count);
    }

    @Tool(name = "get_deployments", description = "Lists Deployments along with replica counts and selectors.", structuredContent = true)
    @Blocking
    public List<DeploymentSummary> getDeployments(
            @ToolArg(description = "Namespace to inspect.", defaultValue = "") String namespace,
            @ToolArg(description = "Optional Kubernetes label selector (e.g. app=api,tier!=dev).", defaultValue = "") String labelSelector) {
        String ns = resolveNamespace(namespace);
        var deploymentOp = client.apps().deployments().inNamespace(ns);
        DeploymentList list = (labelSelector != null && !labelSelector.isBlank())
                ? deploymentOp.withLabelSelector(labelSelector).list()
                : deploymentOp.list();
        return Optional.ofNullable(list.getItems()).orElse(List.of()).stream()
                .sorted(Comparator.comparing(d -> Optional.ofNullable(d.getMetadata()).map(meta -> meta.getName()).orElse("")))
                .map(KubernetesTools::toDeploymentSummary)
                .toList();
    }

    @Tool(name = "set_deployment_replicas", description = "Scales a Deployment to the requested replica count.", structuredContent = true)
    @Blocking
    public ScaleOperationResult setDeploymentReplicas(
            @ToolArg(description = "Namespace that holds the Deployment.", defaultValue = "") String namespace,
            @ToolArg(description = "Deployment name.") String deployment,
            @ToolArg(description = "Desired replica count.") int replicas,
            @ToolArg(description = "Wait for the Deployment controller to report the new status before returning.", defaultValue = "true") boolean waitForReadiness) {
        String ns = resolveNamespace(namespace);
        var resource = client.apps().deployments().inNamespace(ns).withName(deployment);
        Deployment current = resource.get();
        if (current == null) {
            throw new ToolCallException("Deployment '" + deployment + "' not found in namespace '" + ns + "'");
        }
        Deployment updated = config.dryRun() ? current : resource.scale(replicas, waitForReadiness);
        DeploymentStatus status = updated.getStatus();
        return new ScaleOperationResult(
                ns,
                deployment,
                replicas,
                safeInt(status != null ? status.getReplicas() : null),
                Instant.now());
    }

    @Tool(name = "add_deployment_env_var", description = "Adds or updates an environment variable for a Deployment container.", structuredContent = true)
    @Blocking
    public EnvVarPatchResult addDeploymentEnvVar(
            @ToolArg(description = "Namespace that holds the Deployment.", defaultValue = "") String namespace,
            @ToolArg(description = "Deployment name.") String deployment,
            @ToolArg(description = "Target container name (defaults to the first container).", defaultValue = "") String container,
            @ToolArg(description = "Environment variable name.") String variable,
            @ToolArg(description = "Environment variable value.") String value,
            @ToolArg(description = "If true existing values are overwritten.", defaultValue = "true") boolean replaceExisting) {
        String ns = resolveNamespace(namespace);
        var resource = client.apps().deployments().inNamespace(ns).withName(deployment);
        Deployment current = resource.get();
        if (current == null) {
            throw new ToolCallException("Deployment '" + deployment + "' not found in namespace '" + ns + "'");
        }
        Deployment desired = new DeploymentBuilder(current).build();
        Container targetContainer = resolveContainer(desired, container);
        List<EnvVar> envVars = Optional.ofNullable(targetContainer.getEnv()).orElseGet(() -> {
            List<EnvVar> newList = new ArrayList<>();
            targetContainer.setEnv(newList);
            return newList;
        });
        Optional<EnvVar> existing = envVars.stream().filter(env -> variable.equals(env.getName())).findFirst();
        String action;
        if (existing.isPresent()) {
            if (!replaceExisting) {
                throw new ToolCallException("Variable '" + variable + "' already exists on container '" + targetContainer.getName()
                        + "'. Set replaceExisting=true to override.");
            }
            existing.get().setValue(value);
            action = "updated";
        } else {
            EnvVar env = new EnvVar();
            env.setName(variable);
            env.setValue(value);
            envVars.add(env);
            action = "created";
        }
        if (!config.dryRun()) {
            resource.patch(desired);
        }
        return new EnvVarPatchResult(ns, deployment, targetContainer.getName(), variable, value, action, Instant.now());
    }

    @Tool(name = "get_pod_logs", description = "Returns recent logs for a Pod (optionally scoping to a single container).", structuredContent = true)
    @Blocking
    public PodLogsResult getPodLogs(
            @ToolArg(description = "Namespace of the Pod.", defaultValue = "") String namespace,
            @ToolArg(description = "Pod name.") String pod,
            @ToolArg(description = "Container name (required for multi-container pods).", defaultValue = "") String container,
            @ToolArg(description = "How many log lines to read (defaults to config).", defaultValue = "0") int tailLines,
            @ToolArg(description = "Maximum bytes to stream back (defaults to config).", defaultValue = "0") int byteLimit) {
        String ns = resolveNamespace(namespace);
        PodResource podResource = client.pods().inNamespace(ns).withName(pod);
        Pod podRef = podResource.get();
        if (podRef == null) {
            throw new ToolCallException("Pod '" + pod + "' not found in namespace '" + ns + "'");
        }
        int lines = tailLines > 0 ? tailLines : config.logTailLines();
        int bytes = byteLimit > 0 ? byteLimit : config.logByteLimit();
        List<Container> containers = Optional.ofNullable(podRef.getSpec()).map(spec -> spec.getContainers()).orElse(List.of());
        String resolvedContainer = container;
        if ((resolvedContainer == null || resolvedContainer.isBlank()) && containers.size() == 1) {
            resolvedContainer = containers.get(0).getName();
        } else if ((resolvedContainer == null || resolvedContainer.isBlank()) && containers.size() > 1) {
            throw new ToolCallException(
                    "Pod has multiple containers. Specify one of: "
                            + containers.stream().map(Container::getName).filter(Objects::nonNull).toList());
        }
        String logs = resolvedContainer != null && !resolvedContainer.isBlank()
                ? podResource.inContainer(resolvedContainer).limitBytes(bytes).tailingLines(lines).getLog()
                : podResource.limitBytes(bytes).tailingLines(lines).getLog();
        return new PodLogsResult(ns, pod, resolvedContainer, lines, bytes, logs == null ? "" : logs);
    }

    @Tool(name = "get_services", description = "Lists Services, their selectors, and exposed ports.", structuredContent = true)
    @Blocking
    public List<ServiceSummary> getServices(
            @ToolArg(description = "Namespace filter (leave blank to use the default namespace).", defaultValue = "") String namespace,
            @ToolArg(description = "Label selector to match services.", defaultValue = "") String labelSelector,
            @ToolArg(description = "Set to true to list Services in all namespaces (requires configuration).", defaultValue = "false") boolean allNamespaces) {
        var serviceBase = client.services();
        var serviceOp = allNamespaces ? serviceBase.inAnyNamespace() : serviceBase.inNamespace(resolveNamespace(namespace));
        if (allNamespaces) {
            ensureClusterWideAllowed("Listing services across all namespaces");
        }
        var serviceList = (labelSelector != null && !labelSelector.isBlank())
                ? serviceOp.withLabelSelector(labelSelector).list()
                : serviceOp.list();
        return Optional.ofNullable(serviceList.getItems()).orElse(List.of()).stream()
                .sorted(Comparator.comparing(s -> Optional.ofNullable(s.getMetadata()).map(meta -> meta.getNamespace() + "/" + meta.getName()).orElse("")))
                .map(KubernetesTools::toServiceSummary)
                .toList();
    }

    @Tool(name = "get_storage", description = "Summaries PersistentVolumeClaims and PersistentVolumes.", structuredContent = true)
    @Blocking
    public StorageOverview getStorage(
            @ToolArg(description = "Namespace filter for PVCs.", defaultValue = "") String namespace,
            @ToolArg(description = "Inspect all namespaces for PVCs (requires configuration).", defaultValue = "false") boolean allNamespaces,
            @ToolArg(description = "Include PersistentVolume data.", defaultValue = "true") boolean includePersistentVolumes) {
        var pvcOp = allNamespaces ? client.persistentVolumeClaims().inAnyNamespace()
                : client.persistentVolumeClaims().inNamespace(resolveNamespace(namespace));
        if (allNamespaces) {
            ensureClusterWideAllowed("Listing PVCs across all namespaces");
        }
        List<PersistentVolumeClaimInfo> pvcs = Optional.ofNullable(pvcOp.list().getItems()).orElse(List.of()).stream()
                .map(KubernetesTools::toPvcInfo)
                .toList();
        List<PersistentVolumeInfo> pvs = includePersistentVolumes
                ? Optional.ofNullable(client.persistentVolumes().list().getItems()).orElse(List.of()).stream()
                        .map(KubernetesTools::toPvInfo)
                        .toList()
                : List.of();
        if (includePersistentVolumes) {
            ensureClusterWideAllowed("Reading PersistentVolumes");
        }
        return new StorageOverview(pvcs, pvs);
    }

    @Tool(name = "get_events", description = "Streams the most recent Kubernetes events with optional filters.", structuredContent = true)
    @Blocking
    public List<EventInfo> getEvents(
            @ToolArg(description = "Namespace filter (ignored when allNamespaces=true).", defaultValue = "") String namespace,
            @ToolArg(description = "Fetch events for every namespace (requires configuration).", defaultValue = "false") boolean allNamespaces,
            @ToolArg(description = "Only include events for this Kubernetes object name.", defaultValue = "") String objectName,
            @ToolArg(description = "Only include events for this Kubernetes kind (Deployment, Pod, ...).", defaultValue = "") String kind,
            @ToolArg(description = "Only include events that match this reason.", defaultValue = "") String reason,
            @ToolArg(description = "Only include events of this type (Normal/Warning).", defaultValue = "") String type,
            @ToolArg(description = "Maximum number of events to return (defaults to config).", defaultValue = "0") int maxItems) {
        var eventOp = client.events().v1().events();
        List<Event> events;
        if (allNamespaces) {
            ensureClusterWideAllowed("Listing events across all namespaces");
            events = Optional.ofNullable(eventOp.inAnyNamespace().list().getItems()).orElse(List.of());
        } else {
            events = Optional.ofNullable(eventOp.inNamespace(resolveNamespace(namespace)).list().getItems()).orElse(List.of());
        }
        int limit = maxItems > 0 ? Math.min(maxItems, config.eventsMaxItems()) : config.eventsMaxItems();
        return events.stream()
                .filter(event -> objectName == null || objectName.isBlank()
                        || (event.getRegarding() != null && objectName.equals(event.getRegarding().getName())))
                .filter(event -> kind == null || kind.isBlank()
                        || (event.getRegarding() != null && kind.equalsIgnoreCase(event.getRegarding().getKind())))
                .filter(event -> reason == null || reason.isBlank()
                        || (event.getReason() != null && event.getReason().equalsIgnoreCase(reason)))
                .filter(event -> type == null || type.isBlank()
                        || (event.getType() != null && event.getType().equalsIgnoreCase(type)))
                .sorted(Comparator.comparing(KubernetesTools::eventTimestamp, Comparator.nullsLast(Comparator.naturalOrder())).reversed())
                .limit(limit)
                .map(KubernetesTools::toEventInfo)
                .toList();
    }

    @Tool(name = "get_live_binpacking", description = "Summaries how pods are distributed across nodes to help reason about bin packing.", structuredContent = true)
    @Blocking
    public BinpackingSummary getLiveBinpacking(
            @ToolArg(description = "Namespace filter for pods.", defaultValue = "") String namespace,
            @ToolArg(description = "Inspect every namespace (requires configuration).", defaultValue = "false") boolean allNamespaces,
            @ToolArg(description = "Label selector for pods.", defaultValue = "") String labelSelector) {
        ensureClusterWideAllowed("Binpacking analysis requires node visibility");
        String resolvedNamespace = allNamespaces ? null : resolveNamespace(namespace);
        var podBase = client.pods();
        var podOp = allNamespaces ? podBase.inAnyNamespace() : podBase.inNamespace(resolvedNamespace);
        List<Pod> pods = Optional.ofNullable((labelSelector != null && !labelSelector.isBlank())
                ? podOp.withLabelSelector(labelSelector).list().getItems()
                : podOp.list().getItems()).orElse(List.of());
        Map<String, Integer> namespaceTotals = new TreeMap<>();
        for (Pod pod : pods) {
            String podNamespace = Optional.ofNullable(pod.getMetadata()).map(meta -> meta.getNamespace()).orElse("default");
            namespaceTotals.merge(podNamespace, 1, Integer::sum);
        }
        Map<String, List<Pod>> podsByNode = pods.stream()
                .filter(p -> p.getSpec() != null && p.getSpec().getNodeName() != null)
                .collect(Collectors.groupingBy(p -> p.getSpec().getNodeName()));
        Map<String, Node> nodes = Optional.ofNullable(client.nodes().list().getItems()).orElse(List.of()).stream()
                .filter(node -> node.getMetadata() != null && node.getMetadata().getName() != null)
                .collect(Collectors.toMap(node -> node.getMetadata().getName(), Function.identity()));
        List<Map.Entry<String, List<Pod>>> sortedEntries = podsByNode.entrySet().stream()
                .sorted(Comparator.comparingInt((Map.Entry<String, List<Pod>> entry) -> entry.getValue().size()).reversed())
                .limit(config.binpackingMaxNodes())
                .toList();
        List<BinpackingNode> nodeSummaries = sortedEntries.stream()
                .map(entry -> {
                    Node node = nodes.get(entry.getKey());
                    Map<String, Integer> podsPerNamespace = entry.getValue().stream()
                            .collect(Collectors.toMap(
                                    pod -> Optional.ofNullable(pod.getMetadata()).map(meta -> meta.getNamespace()).orElse("default"),
                                    pod -> 1,
                                    Integer::sum,
                                    TreeMap::new));
                    long running = entry.getValue().stream()
                            .filter(pod -> Optional.ofNullable(pod.getStatus()).map(status -> "Running".equalsIgnoreCase(status.getPhase())).orElse(false))
                            .count();
                    return new BinpackingNode(
                            entry.getKey(),
                            (int) running,
                            podsPerNamespace,
                            node != null ? nodeConditions(node) : Map.of(),
                            node != null && node.getStatus() != null ? convertQuantities(node.getStatus().getCapacity()) : Map.of());
                })
                .toList();
        String scope = allNamespaces ? "cluster" : "namespace:" + resolvedNamespace;
        return new BinpackingSummary(scope, nodeSummaries, namespaceTotals);
    }

    @Tool(name = "create_vpa", description = "Creates or updates a VerticalPodAutoscaler bound to a workload.", structuredContent = true)
    @Blocking
    public VpaSummary createVpa(
            @ToolArg(description = "Namespace for the VPA.", defaultValue = "") String namespace,
            @ToolArg(description = "VPA name (defaults to targetName-vpa).", defaultValue = "") String name,
            @ToolArg(description = "Workload kind (Deployment, StatefulSet, ...).", defaultValue = "Deployment") String targetKind,
            @ToolArg(description = "Workload name that the VPA controls.") String targetName,
            @ToolArg(description = "API version for the target workload.", defaultValue = "apps/v1") String targetApiVersion,
            @ToolArg(description = "Update mode (Off/Initial/Auto/Recommend).", defaultValue = "Auto") String updateMode,
            @ToolArg(description = "Comma-separated controlled resources (defaults to cpu,memory).", defaultValue = "cpu,memory") String controlled,
            @ToolArg(description = "Minimum allowed CPU (e.g. 250m).", defaultValue = "") String minCpu,
            @ToolArg(description = "Minimum allowed memory (e.g. 128Mi).", defaultValue = "") String minMemory,
            @ToolArg(description = "Maximum allowed CPU (e.g. 2).", defaultValue = "") String maxCpu,
            @ToolArg(description = "Maximum allowed memory (e.g. 4Gi).", defaultValue = "") String maxMemory) {
        String ns = resolveNamespace(namespace);
        if (targetName == null || targetName.isBlank()) {
            throw new ToolCallException("targetName is required");
        }
        String vpaName = (name == null || name.isBlank()) ? targetName + "-vpa" : name;
        Map<String, String> minAllowed = buildResourceBounds(minCpu, minMemory);
        Map<String, String> maxAllowed = buildResourceBounds(maxCpu, maxMemory);
        GenericKubernetesResource desired = buildVpaResource(ns, vpaName, targetKind, targetName, targetApiVersion,
                updateMode, parseCsv(controlled), minAllowed, maxAllowed);
        GenericKubernetesResource persisted = config.dryRun()
                ? desired
                : vpaClient().inNamespace(ns).resource(desired).createOrReplace();
        return toVpaSummary(persisted);
    }

    @Tool(name = "delete_vpa", description = "Deletes a VerticalPodAutoscaler.", structuredContent = true)
    @Blocking
    public OperationStatus deleteVpa(
            @ToolArg(description = "Namespace containing the VPA.", defaultValue = "") String namespace,
            @ToolArg(description = "VPA name.") String name) {
        String ns = resolveNamespace(namespace);
        var resource = vpaClient().inNamespace(ns).withName(name);
        GenericKubernetesResource existing = resource.get();
        if (existing == null) {
            throw new ToolCallException("VPA '" + name + "' not found in namespace '" + ns + "'");
        }
        if (!config.dryRun()) {
            resource.delete();
        }
        String message = config.dryRun() ? "Dry run – nothing deleted" : "Deletion requested";
        return new OperationStatus("delete_vpa", ns + "/" + name, true, message, Instant.now());
    }

    @Tool(name = "create_vpas_for_namespace", description = "Creates VPAs for each Deployment in a namespace.", structuredContent = true)
    @Blocking
    public BulkVpaOperationResult createVpasForNamespace(
            @ToolArg(description = "Namespace to scan.", defaultValue = "") String namespace,
            @ToolArg(description = "Label selector to restrict which Deployments get VPAs.", defaultValue = "") String labelSelector,
            @ToolArg(description = "Suffix appended to each Deployment name when generating the VPA name.", defaultValue = "-vpa") String suffix,
            @ToolArg(description = "Update mode for the generated VPAs.", defaultValue = "Auto") String updateMode,
            @ToolArg(description = "Comma separated controlled resources.", defaultValue = "cpu,memory") String controlled,
            @ToolArg(description = "Overwrite VPA if it already exists.", defaultValue = "false") boolean overwriteExisting) {
        String ns = resolveNamespace(namespace);
        var deploymentOp = client.apps().deployments().inNamespace(ns);
        List<Deployment> deployments = Optional.ofNullable((labelSelector != null && !labelSelector.isBlank())
                ? deploymentOp.withLabelSelector(labelSelector).list().getItems()
                : deploymentOp.list().getItems()).orElse(List.of());
        var vpaOp = vpaClient().inNamespace(ns);
        List<VpaSummary> created = new ArrayList<>();
        int skipped = 0;
        for (Deployment deployment : deployments) {
            String deploymentName = Optional.ofNullable(deployment.getMetadata()).map(meta -> meta.getName()).orElse(null);
            if (deploymentName == null) {
                continue;
            }
            String vpaName = deploymentName + suffix;
            var existing = vpaOp.withName(vpaName).get();
            if (existing != null && !overwriteExisting) {
                skipped++;
                continue;
            }
            GenericKubernetesResource desired = buildVpaResource(ns, vpaName, "Deployment", deploymentName, "apps/v1",
                    updateMode, parseCsv(controlled), Map.of(), Map.of());
            GenericKubernetesResource persisted = config.dryRun()
                    ? desired
                    : (overwriteExisting ? vpaOp.resource(desired).createOrReplace() : vpaOp.resource(desired).create());
            created.add(toVpaSummary(persisted));
        }
        return new BulkVpaOperationResult(ns, created.size(), skipped, created);
    }

    @Tool(name = "list_machinesets", description = "Lists MachineSets (OpenShift) with their replica counts.", structuredContent = true)
    @Blocking
    public List<MachineSetSummary> listMachineSets(
            @ToolArg(description = "Namespace filter.", defaultValue = "openshift-machine-api") String namespace,
            @ToolArg(description = "Inspect all namespaces.", defaultValue = "false") boolean allNamespaces,
            @ToolArg(description = "Label selector to filter MachineSets.", defaultValue = "") String labelSelector) {
        var msBase = machineSetClient();
        var msOp = allNamespaces ? msBase.inAnyNamespace() : msBase.inNamespace(resolveNamespace(namespace));
        if (allNamespaces) {
            ensureClusterWideAllowed("Listing MachineSets");
        }
        var list = (labelSelector != null && !labelSelector.isBlank())
                ? msOp.withLabelSelector(labelSelector).list()
                : msOp.list();
        return Optional.ofNullable(list.getItems()).orElse(List.of()).stream()
                .map(KubernetesTools::toMachineSetSummary)
                .toList();
    }

    @Tool(name = "set_machineset_replicas", description = "Scales an OpenShift MachineSet.", structuredContent = true)
    @Blocking
    @SuppressWarnings("unchecked")
    public ScaleOperationResult setMachineSetReplicas(
            @ToolArg(description = "MachineSet namespace.", defaultValue = "openshift-machine-api") String namespace,
            @ToolArg(description = "MachineSet name.") String name,
            @ToolArg(description = "Desired replicas.") int replicas) {
        String ns = resolveNamespace(namespace);
        var resource = machineSetClient().inNamespace(ns).withName(name);
        GenericKubernetesResource existing = resource.get();
        if (existing == null) {
            throw new ToolCallException("MachineSet '" + name + "' not found in namespace '" + ns + "'");
        }
        GenericKubernetesResource desired = Serialization.clone(existing);
        Map<String, Object> spec = (Map<String, Object>) desired.getAdditionalProperties()
                .computeIfAbsent("spec", key -> new LinkedHashMap<>());
        spec.put("replicas", replicas);
        GenericKubernetesResource persisted = config.dryRun() ? desired : resource.replace(desired);
        Integer actual = Optional.ofNullable(persisted.getAdditionalProperties().get("status"))
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(status -> status.get("readyReplicas"))
                .map(Object::toString)
                .map(Integer::valueOf)
                .orElse(replicas);
        return new ScaleOperationResult(ns, name, replicas, actual, Instant.now());
    }

    @Tool(name = "delete_pod", description = "Deletes a single Pod.", structuredContent = true)
    @Blocking
    public OperationStatus deletePod(
            @ToolArg(description = "Namespace of the Pod.", defaultValue = "") String namespace,
            @ToolArg(description = "Pod name.") String name) {
        String ns = resolveNamespace(namespace);
        var resource = client.pods().inNamespace(ns).withName(name);
        Pod existing = resource.get();
        if (existing == null) {
            throw new ToolCallException("Pod '" + name + "' not found in namespace '" + ns + "'");
        }
        if (!config.dryRun()) {
            resource.delete();
        }
        String message = config.dryRun() ? "Dry run – nothing deleted" : "Pod deletion requested";
        return new OperationStatus("delete_pod", ns + "/" + name, true, message, Instant.now());
    }

    @Tool(name = "delete_pods_by_selector", description = "Deletes all Pods that match a label selector.", structuredContent = true)
    @Blocking
    public OperationStatus deletePodsBySelector(
            @ToolArg(description = "Namespace to prune.", defaultValue = "") String namespace,
            @ToolArg(description = "Label selector, e.g. app=api,env=dev.") String selector) {
        if (selector == null || selector.isBlank()) {
            throw new ToolCallException("Label selector is required");
        }
        String ns = resolveNamespace(namespace);
        var podOp = client.pods().inNamespace(ns).withLabelSelector(selector);
        List<Pod> pods = Optional.ofNullable(podOp.list().getItems()).orElse(List.of());
        if (pods.isEmpty()) {
            return new OperationStatus("delete_pods_by_selector", ns + " selector:" + selector, false,
                    "No pods matched the selector", Instant.now());
        }
        if (!config.dryRun()) {
            for (Pod pod : pods) {
                String podName = Optional.ofNullable(pod.getMetadata()).map(meta -> meta.getName()).orElse(null);
                if (podName != null) {
                    client.pods().inNamespace(ns).withName(podName).delete();
                }
            }
        }
        String message = config.dryRun()
                ? "Dry run – would delete " + pods.size() + " pods"
                : "Deleted " + pods.size() + " pods";
        return new OperationStatus("delete_pods_by_selector", ns + " selector:" + selector, true, message,
                Instant.now());
    }

    @Tool(name = "get_cluster_overview", description = "Summaries namespaces, nodes, workloads, and pod health across the cluster.", structuredContent = true)
    @Blocking
    public ClusterOverview getClusterOverview(
            @ToolArg(description = "Set to false to skip per-node capacity details when clusters are very large.", defaultValue = "true") boolean includeNodeDetails) {
        ensureClusterWideAllowed("Cluster overview");
        var namespaces = client.namespaces().list().getItems();
        var nodes = client.nodes().list().getItems();
        var deployments = client.apps().deployments().inAnyNamespace().list().getItems();
        var pods = client.pods().inAnyNamespace().list().getItems();
        NodeCapacity totals = config.includeCapacityTotals()
                ? new NodeCapacity(
                        "cluster",
                        aggregateCapacity(nodes,
                                node -> nullSafeQuantityMap(Optional.ofNullable(node.getStatus())
                                        .map(NodeStatus::getCapacity)
                                        .orElse(null))),
                        aggregateCapacity(nodes,
                                node -> nullSafeQuantityMap(Optional.ofNullable(node.getStatus())
                                        .map(NodeStatus::getAllocatable)
                                        .orElse(null))),
                        Map.of())
                : null;
        List<NodeCapacity> nodeCapacities = includeNodeDetails
                ? nodes.stream().map(KubernetesTools::toNodeCapacity).toList()
                : List.of();
        return new ClusterOverview(
                namespaces.size(),
                nodes.size(),
                deployments.size(),
                pods.size(),
                aggregatePodPhases(pods),
                totals,
                nodeCapacities);
    }

    @SuppressWarnings("unchecked")
    private static VpaSummary toVpaSummary(GenericKubernetesResource resource) {
        Map<String, Object> additional = resource.getAdditionalProperties() == null ? Map.of() : resource.getAdditionalProperties();
        Object rawSpec = additional.get("spec");
        Map<String, Object> specMap = rawSpec instanceof Map ? (Map<String, Object>) rawSpec : Map.of();
        Map<String, Object> targetRef = specMap.get("targetRef") instanceof Map ? (Map<String, Object>) specMap.get("targetRef")
                : Map.of();
        Map<String, Object> updatePolicy = specMap.get("updatePolicy") instanceof Map
                ? (Map<String, Object>) specMap.get("updatePolicy")
                : Map.of();
        String updateMode = Optional.ofNullable(updatePolicy.get("updateMode"))
                .map(Object::toString)
                .orElse("Auto");
        List<String> controlledResources = List.of();
        Object resourcePolicy = specMap.get("resourcePolicy");
        if (resourcePolicy instanceof Map<?, ?> policyMap) {
            Object containerPolicies = policyMap.get("containerPolicies");
            if (containerPolicies instanceof List<?> policies && !policies.isEmpty()) {
                Object firstPolicy = policies.get(0);
                if (firstPolicy instanceof Map<?, ?> firstMap) {
                    Object controlled = firstMap.get("controlledResources");
                    if (controlled instanceof List<?> resources && !resources.isEmpty()) {
                        controlledResources = resources.stream().map(Object::toString).toList();
                    }
                }
            }
        }
        return new VpaSummary(
                resource.getMetadata().getNamespace(),
                resource.getMetadata().getName(),
                Optional.ofNullable(targetRef.get("kind")).map(Object::toString).orElse("Deployment"),
                Optional.ofNullable(targetRef.get("name")).map(Object::toString).orElse(""),
                updateMode,
                controlledResources);
    }

    @SuppressWarnings("unchecked")
    private static MachineSetSummary toMachineSetSummary(GenericKubernetesResource resource) {
        Map<String, Object> spec = resource.getAdditionalProperties() == null ? Map.of() : resource.getAdditionalProperties();
        Object rawSpec = spec.get("spec");
        Map<String, Object> specMap = rawSpec instanceof Map ? (Map<String, Object>) rawSpec : Map.of();
        Integer replicas = Optional.ofNullable(specMap.get("replicas"))
                .map(Object::toString)
                .map(Integer::valueOf)
                .orElse(null);
        Map<String, Object> statusMap = resource.getAdditionalProperties() == null ? Map.of()
                : Optional.ofNullable(resource.getAdditionalProperties().get("status"))
                        .filter(Map.class::isInstance)
                        .map(Map.class::cast)
                        .orElse(Map.of());
        Integer ready = Optional.ofNullable(statusMap.get("readyReplicas"))
                .map(Object::toString)
                .map(Integer::valueOf)
                .orElse(null);
        return new MachineSetSummary(
                resource.getMetadata().getNamespace(),
                resource.getMetadata().getName(),
                replicas,
                ready,
                sorted(resource.getMetadata().getLabels()));
    }

}
