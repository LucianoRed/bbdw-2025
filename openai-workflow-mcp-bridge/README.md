# openai-workflow-mcp-bridge

Bridge MCP mínimo para validar um `workflow_id` publicado no Agent Builder usando a API do OpenAI ChatKit.

## O que ele faz

- expõe um endpoint MCP em `http://localhost:8080/mcp`
- cria sessões ChatKit a partir de:
  - `OPENAI_API_KEY`
  - `OPENAI_WORKFLOW_ID`
- permite testar isso com o MCP Inspector
- mantém um registro local das sessões criadas

## Limitação importante

Este container **não consegue enviar uma mensagem diretamente ao workflow publicado apenas com `workflow_id`**.

Motivo: na documentação oficial que eu usei para montar este bridge, o caminho documentado com `workflow_id` é criar uma **ChatKit session** (`POST /v1/chatkit/sessions`) e usar o workflow no ChatKit; para integração programática avançada, a própria OpenAI orienta **exportar o código do workflow** pelo Agent Builder e rodar/customizar esse código no seu backend.

Em outras palavras:

- **validar workflow + criar sessão**: sim
- **mandar mensagem programaticamente para o workflow só com workflow_id**: não ficou documentado de forma equivalente ao ChatKit client no material consultado

## Variáveis de ambiente

- `OPENAI_API_KEY` - obrigatória
- `OPENAI_WORKFLOW_ID` - obrigatória
- `PORT` - opcional, padrão `8080`
- `OPENAI_BASE_URL` - opcional, padrão `https://api.openai.com/v1`
- `USER_PREFIX` - opcional, padrão `mcp-inspector`

## Build

```bash
docker build -t openai-workflow-mcp-bridge .
```

## Run

```bash
docker run --rm -p 8080:8080 \
  -e OPENAI_API_KEY=sk-... \
  -e OPENAI_WORKFLOW_ID=wf_... \
  openai-workflow-mcp-bridge
```

## Testando com MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Depois conecte no servidor MCP:

- Transport: `Streamable HTTP`
- URL: `http://localhost:8080/mcp`

## Tools disponíveis

### `health`
Mostra configuração básica e explica a limitação atual.

### `start_workflow_session`
Cria uma ChatKit session nova.

Exemplo de argumentos:

```json
{
  "user": "luciano",
  "state_variables": {
    "ambiente": "teste"
  }
}
```

### `list_local_sessions`
Lista as sessões locais já criadas.

### `cancel_workflow_session`
Cancela uma sessão criada antes.

Exemplo:

```json
{
  "local_session_id": "..."
}
```

### `send_message_to_workflow`
Hoje retorna uma explicação estruturada dizendo por que o envio de mensagem ainda não foi conectado no modo `workflow_id-only`.

## Como transformar isso no que você realmente quer

Para a tool `send_message_to_workflow` de fato conversar com o workflow:

1. no Agent Builder, clique em **Code**
2. escolha **Advanced integration**
3. exporte o código do workflow
4. adicione esse runtime exportado neste container
5. troque a implementação da tool `send_message_to_workflow` para chamar o runtime exportado

Aí sim você terá um MCP server de verdade que:

- cria/gerencia sessão
- envia mensagem ao workflow
- devolve a resposta ao Quarkus ou ao MCP Inspector

## Fontes oficiais usadas

- Agent Builder: workflow publicado pode ser usado com ChatKit via workflow ID, ou exportado como código para advanced integration.
- ChatKit: criação de sessão com `POST /v1/chatkit/sessions` usando `workflow.id`.
- MCP server: uso do MCP Inspector com endpoint local `/mcp`.
