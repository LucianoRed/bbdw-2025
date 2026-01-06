# MCP Server Downdetector

Este servidor MCP fornece ferramentas para verificar o status de websites e serviços, similar ao conceito do Downdetector.

## Ferramentas

### `check_status`
Verifica se um website está acessível.
- **Input**: `url` (string), `timeout` (number, opcional)
- **Output**: Status (UP/DOWN), código HTTP, latência.

### `downdetector`
Verifica o status de um serviço no Downdetector.
- **Input**: `serviceName` (string), `domain` (string, opcional - default: 'com')
- **Output**: Status (UP/PROBLEMS/POSSIBLE_PROBLEMS), mensagem descritiva.

## Métricas
O servidor exporta métricas Prometheus em `/metrics`.

## Como rodar

### Localmente
```bash
npm install
npm start
```

### Docker
```bash
docker build -t mcp-server-downdetector .
docker run -p 3000:3000 mcp-server-downdetector
```
