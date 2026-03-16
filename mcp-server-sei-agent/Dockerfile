FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY src/ ./src/

# Variáveis de ambiente obrigatórias:
#   OPENAI_API_KEY          — API key da OpenAI
#   OPENAI_SEI_WORKFLOW_ID  — ID do workflow criado no AgentBuilder (wf_xxx)
#                             Obtenha em: platform.openai.com → Agent Builder
#
# Opcionais:
#   PORT          — porta HTTP (padrão: 3000)
#   MCP_TRANSPORT — "stdio" (padrão) ou "sse"

ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/index.js"]
