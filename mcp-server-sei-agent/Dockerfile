FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY src/ ./src/

ENV PORT=3000
ENV ENABLE_STDIO=false
# Configure via env vars:
#   OPENAI_API_KEY            — obrigatório
#   OPENAI_SEI_WORKFLOW_ID    — ID do workflow do AgentBuilder (wf_xxx); quando definido,
#                               o workflow é usado como model na Responses API e as
#                               instructions locais são ignoradas.
#   OPENAI_SEI_MODEL          — padrão: gpt-4o-mini (usado apenas SEM workflow)
#   OPENAI_SEI_INSTRUCTIONS   — substitui o prompt padrão (usado apenas SEM workflow)

EXPOSE 3000

CMD ["node", "src/index.js"]
