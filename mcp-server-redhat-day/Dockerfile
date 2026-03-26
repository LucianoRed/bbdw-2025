FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3007

ENV PORT=3007
ENV REDIS_URL=redis://redis:6379
ENV ENABLE_STDIO=false

CMD ["npm", "start"]
