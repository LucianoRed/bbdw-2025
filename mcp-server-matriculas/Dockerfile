FROM node:18-alpine

WORKDIR /app

# Copia package.json e instala dependências
COPY package.json .
RUN npm install

# Copia o código fonte
COPY src/ ./src/

# Cria a pasta data e garante permissões
RUN mkdir data && chmod 777 data

# Expõe a porta para a interface Web
EXPOSE 3000

# Executa o servidor
CMD ["node", "src/index.js"]
