# mcp-server-quarkus

This Quarkus application exposes a fully-fledged [Model Context Protocol](https://modelcontextprotocol.io) server, powered by the [quarkus-mcp-server](https://docs.quarkiverse.io/quarkus-mcp-server/dev/) extension and the Fabric8 Kubernetes client. Language models can connect via stdio, HTTP/SSE or WebSocket transports and call strongly-typed tools to inspect or modify Kubernetes/OpenShift clusters.

## Feature overview

- **Transports**: stdio plus `/mcp` (streamable HTTP), `/mcp/sse`, and `/mcp/ws`. Traffic logging is enabled for easier debugging.
- **Tools**: cluster overview, live binpacking, deployment scaling & env-var patching, pod logs/deletes, service and storage inventory, events streaming, VPA lifecycle, OpenShift MachineSet scaling, etc. Every tool returns structured JSON so LLMs can reason over the payload.
- **Resources**: `kubernetes://profile/default`, `kubernetes://guides/kubectl-safe-actions`, and a resource template that streams live Deployment manifests as YAML.
- **Prompts**: reusable templates for safe-change planning and incident reports.

### Configuring Kubernetes access

Set your context the same way you would for any Quarkus Kubernetes client app (`KUBECONFIG`, service account, `quarkus.kubernetes-client.*` properties, ...). Additional MCP-specific flags live under `mcp.kubernetes.*`, for example:

```
mcp.kubernetes.default-namespace=dev
mcp.kubernetes.allow-cluster-wide=true
mcp.kubernetes.log-tail-lines=300
mcp.kubernetes.binpacking-max-nodes=12
```

Turn off `allow-cluster-wide` to restrict tools that require node- or cluster-wide privileges.

### Running MCP locally

```bash
./mvnw quarkus:dev
```

The Quarkus log shows the active MCP endpoints, e.g. `http://localhost:8080/mcp` and `ws://localhost:8080/mcp/ws`. Point your MCP-compatible client to one of these URLs or use the stdio transport for CLI agents.

### Testing

```bash
./mvnw test
```

This boots the MCP server in test mode to ensure the transports and CDI wiring stay healthy.

## Running the application in dev mode

You can run your application in dev mode that enables live coding using:

```shell script
./mvnw quarkus:dev
```

> **_NOTE:_**  Quarkus now ships with a Dev UI, which is available in dev mode only at <http://localhost:8080/q/dev/>.

## Packaging and running the application

The application can be packaged using:

```shell script
./mvnw package
```

It produces the `quarkus-run.jar` file in the `target/quarkus-app/` directory.
Be aware that it’s not an _über-jar_ as the dependencies are copied into the `target/quarkus-app/lib/` directory.

The application is now runnable using `java -jar target/quarkus-app/quarkus-run.jar`.

If you want to build an _über-jar_, execute the following command:

```shell script
./mvnw package -Dquarkus.package.jar.type=uber-jar
```

The application, packaged as an _über-jar_, is now runnable using `java -jar target/*-runner.jar`.

## Creating a native executable

You can create a native executable using:

```shell script
./mvnw package -Dnative
```

Or, if you don't have GraalVM installed, you can run the native executable build in a container using:

```shell script
./mvnw package -Dnative -Dquarkus.native.container-build=true
```

You can then execute your native executable with: `./target/mcp-server-quarkus-1.0.0-SNAPSHOT-runner`

If you want to learn more about building native executables, please consult <https://quarkus.io/guides/maven-tooling>.

## Provided Code

### REST

Easily start your REST Web Services

[Related guide section...](https://quarkus.io/guides/getting-started-reactive#reactive-jax-rs-resources)

### For OpenShift

````
oc import-image openjdk-21:latest \
  --from=registry.redhat.io/ubi9/openjdk-21:latest \
  --confirm
````

### No deployment:
JAVA_OPTIONS=-Dquarkus.mcp.server.stdio.enabled=false
