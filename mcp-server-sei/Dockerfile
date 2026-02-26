FROM node:18-alpine

WORKDIR /app

# Copia package.json e instala dependências
COPY package.json .
RUN npm install

# Copia o código fonte
COPY src/ ./src/

# Variáveis de ambiente necessárias (devem ser fornecidas na execução)
# SEI_URL       - URL base do SEI (ex: https://sei.orgao.gov.br)
# SEI_TOKEN     - Token de API do SEI
# SEI_UNIDADE   - Código da unidade no SEI (ex: 110000123)
ENV SEI_URL=""
ENV SEI_TOKEN=""
ENV SEI_UNIDADE=""

# Expõe a porta para a interface Web
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

# Executa o servidor
CMD ["node", "src/index.js"]
