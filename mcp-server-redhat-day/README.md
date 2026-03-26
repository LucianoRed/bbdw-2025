# MCP Server — Red Hat Day Planner

Serviço Node.js que expõe ferramentas MCP para planejar **Red Hat Days**: dias de apresentações de produtos Red Hat para clientes.

## Funcionalidades

- Criar e gerenciar Red Hat Days (dia inteiro, manhã ou tarde)
- Adicionar apresentações com produto, apresentador e duração configurável
- Buscar produtos Red Hat dinamicamente de [docs.redhat.com](https://docs.redhat.com/en/products) (cache Redis 24h)
- Sugerir agenda automaticamente com base nos interesses do cliente
- Gerar relatório completo com horários calculados
- Web UI para gestão visual
- MCP server HTTP compatível com o **agent-ai (Dora)**

## Ferramentas MCP (10 tools)

| Tool | Descrição |
|------|-----------|
| `criar_redhat_day` | Cria um novo Red Hat Day |
| `listar_redhat_days` | Lista todos os dias cadastrados |
| `buscar_redhat_day` | Detalha um dia pelo ID |
| `deletar_redhat_day` | Remove um dia |
| `adicionar_apresentacao` | Adiciona apresentação à agenda |
| `remover_apresentacao` | Remove uma apresentação |
| `atualizar_apresentacao` | Atualiza campos de uma apresentação |
| `listar_produtos_redhat` | Lista produtos do catálogo Red Hat |
| `sugerir_agenda` | Sugere apresentações por interesse do cliente |
| `gerar_relatorio` | Gera schedule completo com horários |

## Horários calculados automaticamente

| Tipo | Horário |
|------|---------|
| `full` (dia inteiro) | 09:00–12:00 + 13:30–17:00 (com intervalo de almoço) |
| `morning` (manhã) | 09:00–12:00 |
| `afternoon` (tarde) | 13:30–17:00 |

Cada apresentação tem default de **20 min** + **10 min** de discussão, configurável por apresentação.

## Iniciando

```bash
# Instalar dependências
npm install

# Subir (requer Redis)
REDIS_URL=redis://localhost:6379 npm start
```

O servidor sobe na porta **3007** por padrão.

- Web UI: http://localhost:3007
- Health: http://localhost:3007/healthz
- API REST: http://localhost:3007/api/days
- MCP endpoint: POST http://localhost:3007/mcp

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3007` | Porta HTTP |
| `REDIS_URL` | `redis://localhost:6379` | URL do Redis |
| `ENABLE_STDIO` | `false` | Habilitar transporte STDIO |

## Integração com Dora (agent-ai)

Após subir o serviço, registre o MCP server no agent-ai via API REST:

```bash
curl -X POST http://localhost:8080/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "redhat-day",
    "url": "http://mcp-server-redhat-day:3007/mcp",
    "transportType": "http",
    "logRequests": false,
    "logResponses": false
  }'
```

### System prompt sugerido para a Dora

Adicione o seguinte ao system prompt da Dora (via `PUT /api/system-prompt` ou no Redis em `dora:system:prompt`):

```
Você também tem acesso a ferramentas de planejamento de Red Hat Day. Use-as quando o usuário quiser:
- Planejar um dia de apresentações Red Hat para um cliente
- Criar, editar ou visualizar agendas de Red Hat Days
- Ver o catálogo de produtos Red Hat para sugerir apresentações
- Gerar relatórios de schedule com horários calculados automaticamente

Ao criar uma agenda, sempre pergunte: nome do cliente, data, formato do dia (inteiro/manhã/tarde) e interesses principais do cliente.
```

## Docker Compose

Adicione ao seu `docker-compose.yml`:

```yaml
  mcp-server-redhat-day:
    build: ./mcp-server-redhat-day
    ports:
      - "3007:3007"
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    networks:
      - app-network
```

## Exemplo de conversa com a Dora

```
Usuário: Quero planejar um Red Hat Day para a empresa XYZ Technologies
Dora: [usa criar_redhat_day]
       Criado! Qual o formato — dia inteiro, manhã ou tarde?
       
Usuário: Dia inteiro, dia 15 de abril. Eles têm interesse em containers e automação
Dora: [usa sugerir_agenda com addToAgenda=true]
       Sugeri 10 apresentações alinhadas com containers e automação. Quer ver o schedule?
       
Usuário: Sim, gera o relatório
Dora: [usa gerar_relatorio]
       ## Red Hat Day — XYZ Technologies
       | Campo | Valor |
       ...
```
