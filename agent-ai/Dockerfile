# Multi-stage build para o Agent AI (Quarkus)
# Stage 1: Build com Maven
FROM registry.access.redhat.com/ubi9/openjdk-21:1.23 AS builder

USER root
WORKDIR /build

# Copiar pom.xml e baixar dependências primeiro (cache de layer)
COPY pom.xml mvnw ./
COPY .mvn .mvn
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B -q 2>/dev/null || true

# Copiar código fonte e compilar
COPY src src
RUN ./mvnw package -DskipTests -B -q

# Stage 2: Runtime
FROM registry.access.redhat.com/ubi9/openjdk-21:1.23

ENV LANGUAGE='en_US:en'

COPY --from=builder --chown=185 /build/target/quarkus-app/lib/ /deployments/lib/
COPY --from=builder --chown=185 /build/target/quarkus-app/*.jar /deployments/
COPY --from=builder --chown=185 /build/target/quarkus-app/app/ /deployments/app/
COPY --from=builder --chown=185 /build/target/quarkus-app/quarkus/ /deployments/quarkus/

EXPOSE 8080
USER 185
ENV JAVA_OPTS_APPEND="-Dquarkus.http.host=0.0.0.0 -Djava.util.logging.manager=org.jboss.logmanager.LogManager"
ENV JAVA_APP_JAR="/deployments/quarkus-run.jar"

ENTRYPOINT [ "/opt/jboss/container/java/run/run-java.sh" ]
