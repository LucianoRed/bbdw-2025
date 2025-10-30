# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm i --omit=dev

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

RUN addgroup -g 1001 -S app \
    && adduser -S -u 1001 app -G app \
    && chown -R app:app /app
USER app

# Variáveis esperadas em tempo de execução:
# - K8S_API_URL
# - K8S_BEARER_TOKEN
# - K8S_SKIP_TLS_VERIFY (opcional)

EXPOSE 3000

CMD ["node", "src/index.js"]
