FROM node:18-alpine

WORKDIR /app

# Copia package.json e instala dependências
COPY package.json .
RUN npm install

# Copia o código fonte
COPY src/ ./src/
COPY data/ ./data/

# Garante permissões de escrita na pasta data
RUN chmod -R 777 ./data

# Expõe a porta para a interface Web
EXPOSE 3000

# Executa o servidor
CMD ["node", "src/index.js"]
