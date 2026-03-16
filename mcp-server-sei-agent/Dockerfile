FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY src/ ./src/

# Variáveis de ambiente obrigatórias:
#   OPENAI_API_KEY             — API key da OpenAI
#   OPENAI_SEI_WORKFLOW_ID     — ID do workflow do AgentBuilder (wf_xxx)
#                                Usado apenas para criar sessões do widget browser.
#
# Chat server-side (MCP tool sei_agent_chat):
#   NOTA: o workflow (wf_xxx) NÃO tem API REST — só funciona via widget no browser.
#   Para a tool MCP funcionar, copie o system prompt do workflow para:
#     OPENAI_SEI_INSTRUCTIONS  — system prompt copiado do seu workflow
#     OPENAI_SEI_MODEL         — modelo a usar (padrão: gpt-4o)
#
# Opcionais:
#   PORT          — porta HTTP (padrão: 3000)

ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/index.js"]
