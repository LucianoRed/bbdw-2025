# ============================================================
# Dockerfile — demo-deployer
# Node.js 20 + Ansible + oc CLI (OpenShift Client)
# ============================================================

FROM registry.access.redhat.com/ubi9/ubi-minimal:latest AS base

# Instalar dependências do sistema
RUN microdnf install -y \
    python3 \
    python3-pip \
    nodejs \
    npm \
    tar \
    gzip \
    git \
    openssh-clients \
    && microdnf clean all

# Instalar Ansible
RUN pip3 install --no-cache-dir ansible-core

# Instalar oc CLI (OpenShift Client)
RUN curl -sL https://mirror.openshift.com/pub/openshift-v4/clients/ocp/stable/openshift-client-linux.tar.gz \
    | tar -xz -C /usr/local/bin oc kubectl \
    && chmod +x /usr/local/bin/oc /usr/local/bin/kubectl

# Criar diretório da aplicação
WORKDIR /app

# Copiar dependências Node.js
COPY package.json ./
RUN npm install --production

# Copiar código da aplicação
COPY src/ ./src/
COPY ansible/ ./ansible/

# Variáveis de ambiente padrão
ENV PORT=3000
ENV NODE_ENV=production

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/healthz || exit 1

# Executar
CMD ["node", "src/index.js"]
