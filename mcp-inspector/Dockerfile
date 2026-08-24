FROM node:22-bookworm

RUN npm install -g @modelcontextprotocol/inspector

RUN useradd -m -u 1001 inspector && mkdir /.npm && chmod -R 777 "/.npm"

USER inspector
WORKDIR /home/inspector/app

ENV MCP_AUTO_OPEN_ENABLED=false \
    HOST=0.0.0.0 \
    DANGEROUSLY_BIND_ALL_INTERFACES=true

EXPOSE 6274 6277

CMD ["npx", "@modelcontextprotocol/inspector"]
