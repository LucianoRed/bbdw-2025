FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY src/ ./src/

ENV PORT=3000
ENV ENABLE_STDIO=false
# Configure via env vars:
#   OPENAI_API_KEY              — obrigatório
#   OPENAI_SEI_ASSISTANT_ID     — ID do assistente criado no OpenAI Platform (asst_xxx).
#                                 Quando definido, usa a Assistants API com as instruções
#                                 e ferramentas configuradas no assistente.
#                                 Obtenha em: platform.openai.com → Assistants
#   OPENAI_SEI_MODEL            — padrão: gpt-4o-mini (usado apenas SEM assistant_id)
#   OPENAI_SEI_INSTRUCTIONS     — substitui o prompt padrão (usado apenas SEM assistant_id)
#
# NOTA: wf_xxx (workflow ChatKit) NÃO funciona como model na Responses API.
#       Use asst_xxx (Assistants API) para integração server-side.

EXPOSE 3000

CMD ["node", "src/index.js"]
