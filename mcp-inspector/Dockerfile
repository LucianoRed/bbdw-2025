FROM node:22-bookworm

# Instala o inspector globalmente como root
RUN npm install -g @modelcontextprotocol/inspector

# Cria usuário sem privilégios
RUN useradd -m -u 1001 inspector

USER inspector
WORKDIR /home/inspector/app

# Variáveis úteis para rodar em container
ENV MCP_AUTO_OPEN_ENABLED=false \
    HOST=0.0.0.0

EXPOSE 6274 6277

# UI padrão do Inspector
CMD ["npx", "@modelcontextprotocol/inspector"]