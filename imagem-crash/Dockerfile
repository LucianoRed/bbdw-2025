# Image designed to fail fast (CrashLoopBackOff in K8s) when a required env var is missing
FROM registry.access.redhat.com/ubi9/ubi-minimal:9.4

# Default required variable name; can be overridden at runtime
ENV REQUIRED_VAR_NAME="APP_REQUIRED_TOKEN" \
      PORT=8080

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
# Tornar executável por usuários não-root e compatível com OpenShift (UID arbitrário)
RUN microdnf -y update \
 && microdnf -y --setopt=install_weak_deps=0 install python3 \
 && microdnf clean all \
 && mkdir -p /opt/www \
 && printf '%s\n' '<!doctype html><html><head><meta charset="utf-8"><title>OK</title><style>body{font-family:system-ui,Helvetica,Arial,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#0b1020;color:#e6edf3} .card{padding:2rem 3rem;border:1px solid #24324a;border-radius:12px;background:#11162a;box-shadow:0 10px 30px rgba(0,0,0,.35)} h1{margin:0 0 .5rem;font-size:2rem} p{margin:.25rem 0 0;color:#9fb3c8}</style></head><body><div class="card"><h1>Funcionou! Estou no ar!</h1><p>Imagem non-root em execução.</p></div></body></html>' > /opt/www/index.html \
 && chmod -R 0555 /entrypoint.sh /opt/www

# Helpful metadata
LABEL maintainer="bbdw-2025" description="Demo image that crashes when a required env var is missing, to trigger CrashLoopBackOff (non-root) and serves a simple web page when OK." \
      io.k8s.display-name="imagem-crash (missing env demo)" \
      io.openshift.tags="demo,crashloop,env"

# Executa como usuário não-root (compatível com OpenShift e Docker)
USER 1001

# Porta do web server
EXPOSE 8080

# Run the check on start
ENTRYPOINT ["/entrypoint.sh"]
