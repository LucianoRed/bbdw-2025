FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY src/ ./src/

ENV PORT=3000
ENV ENABLE_STDIO=false
# Configure via env vars:
#   OPENAI_API_KEY       — obrigatório
#   OPENAI_SEI_MODEL     — padrão: gpt-4o-mini
#   OPENAI_SEI_INSTRUCTIONS — substitui o prompt padrão do agente SEI

EXPOSE 3000

CMD ["node", "src/index.js"]
