# MCP Inspector

Interface gráfica para testar e depurar servidores MCP (Model Context Protocol).

Baseado no [MCP Inspector oficial](https://github.com/modelcontextprotocol/inspector).

## O que é

O MCP Inspector é uma ferramenta interativa de desenvolvimento que permite:

- **Conectar** a qualquer servidor MCP (SSE ou STDIO)
- **Listar** resources, prompts e tools
- **Testar** tools com inputs customizados
- **Inspecionar** respostas e logs em tempo real

## Portas

| Porta | Descrição |
|-------|-----------|
| 6274  | UI Web do Inspector |
| 6277  | MCP Proxy Server |

## Build e execução local

```bash
docker build -t mcp-inspector .
docker run -p 6274:6274 -p 6277:6277 mcp-inspector
```

Acesse: http://localhost:6274

## Deploy no OpenShift

O deploy é feito automaticamente pelo **Demo Deployer** via Ansible, usando `oc new-app --strategy=docker`.

## Uso

1. Abra a interface web do Inspector
2. Selecione o tipo de transporte (SSE)
3. Informe a URL do servidor MCP (ex: `http://mcp-server-k8s-live:3000/sse`)
4. Conecte e explore os tools, resources e prompts disponíveis
