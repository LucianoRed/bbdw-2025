# MCP Server: K8s Live (binpacking)

Servidor MCP que expõe uma ferramenta `get_live_binpacking` e retorna JSON idêntico ao `binpacking-live/liveData.php`, incluindo detalhes de nós e pods (e, se disponível, métricas efetivas via metrics-server).

## Variáveis de ambiente

- `K8S_API_URL` (obrigatório): URL base da API do Kubernetes. Ex.: `https://$CLUSTER:6443`
- `K8S_BEARER_TOKEN` (obrigatório): Token Bearer para autenticação.
- `K8S_SKIP_TLS_VERIFY` (opcional): `true` para ignorar verificação de TLS (self-signed etc.).

## Pré-requisitos

- Node.js 18 ou superior.

## Execução

Instale as dependências e inicie o servidor MCP:

```sh
npm install
npm start
```

> Dica: você pode rodar com as variáveis de ambiente, por exemplo:
>
> ```sh
> K8S_API_URL=https://... K8S_BEARER_TOKEN=... K8S_SKIP_TLS_VERIFY=true npm start
> ```

## Docker

Build da imagem (na pasta `mcp-server-k8s-live/`):
## Como gerar/atualizar o conteúdo de `src/`


```sh
docker build -t mcp-server-k8s-live:latest .
```

Execução HTTP (rodando como usuário não-root dentro da imagem):

```sh
docker run --rm -it \
  -e K8S_API_URL="https://seu-cluster:6443" \
  -e K8S_BEARER_TOKEN="<token>" \
  -e K8S_SKIP_TLS_VERIFY="true" \
  -e PORT=3000 \
  -p 3000:3000 \
  mcp-server-k8s-live:latest
```

Rotas HTTP disponíveis:

- `GET /healthz` → resposta de saúde `{ status: "ok" }`.
- `GET /live?resource=cpu|memory&ns=ns1,ns2` → retorna o JSON idêntico ao `binpacking-live/liveData.php`.

Observação: além do HTTP, o processo também expõe o protocolo MCP via stdio (útil para clientes MCP). Se você só precisa de HTTP, basta usar o `-p` e consumir as rotas acima.

## Integração com cliente MCP

No cliente MCP (ex.: configurações que aceitem servidores MCP via `command`), registre o servidor apontando para `node` e `src/index.js`:

- command: `node`
- args: `["src/index.js"]`
- env: `K8S_API_URL`, `K8S_BEARER_TOKEN`, `K8S_SKIP_TLS_VERIFY`
- cwd: `mcp-server-k8s-live/`

## Ferramenta disponível

### get_live_binpacking

- Parâmetros de entrada:
  - `resource`: `"cpu"` (padrão) ou `"memory"`
  - `ns`: string com namespaces separados por vírgula (opcional)
- Retorno: objeto JSON com as chaves
  - `nodes`, `bins`, `perBinAllowedUnits`, `totalUsedUnits`, `totalAvailableUnits`, `binPackRatio`, `pending`

O formato é compatível com o `binpacking-live/liveData.php`.
