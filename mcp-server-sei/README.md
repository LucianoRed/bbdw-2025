# MCP Server SEI

Servidor MCP (Model Context Protocol) para integração com o **SEI — Sistema Eletrônico de Informações**, solução de gestão eletrônica de documentos e processos do governo brasileiro (desenvolvido pelo TRF4 e distribuído pelo Ministério da Gestão e Inovação em Serviços Públicos).

## Funcionalidades (Ferramentas MCP)

| Ferramenta | Descrição |
|---|---|
| `listar_processos` | Lista os processos da unidade (com filtros opcionais por tipo, situação, etc.) |
| `consultar_processo` | Retorna os detalhes de um processo específico pelo número ou ID |
| `criar_processo` | Abre um novo processo no SEI |
| `listar_documentos_processo` | Lista todos os documentos de um processo |
| `consultar_documento` | Retorna os metadados e conteúdo de um documento |
| `incluir_documento` | Inclui um novo documento externo em um processo |
| `listar_tipos_processo` | Lista os tipos de processo disponíveis na unidade |
| `listar_unidades` | Lista as unidades acessíveis pelo token configurado |

## Configuração

As credenciais são fornecidas como **variáveis de ambiente**:

| Variável | Obrigatória | Descrição | Exemplo |
|---|---|---|---|
| `SEI_URL` | ✅ | URL base da instalação do SEI | `https://sei.orgao.gov.br` |
| `SEI_TOKEN` | ✅ | Token de API gerado no SEI | `4a5f2c...` |
| `SEI_UNIDADE` | ✅ | ID da unidade no SEI | `110000123` |
| `PORT` | ❌ | Porta HTTP (padrão: 3000) | `3000` |
| `ENABLE_STDIO` | ❌ | Habilita transporte STDIO (padrão: true) | `true` |

### Como gerar o token no SEI

1. Acesse o SEI com uma conta com perfil **Administrador de Protocolo** (ou equivalente)
2. Menu: **Administração → Sistemas → Novo**
3. Preencha o nome do sistema e associe à unidade
4. Gere o token de API
5. Salve o token — ele não será exibido novamente

## Execução

### Com Docker

```bash
docker build -t mcp-server-sei .

docker run -p 3000:3000 \
  -e SEI_URL="https://sei.orgao.gov.br" \
  -e SEI_TOKEN="SEU_TOKEN_AQUI" \
  -e SEI_UNIDADE="110000123" \
  mcp-server-sei
```

### Com Node.js diretamente

```bash
npm install

SEI_URL="https://sei.orgao.gov.br" \
SEI_TOKEN="SEU_TOKEN_AQUI" \
SEI_UNIDADE="110000123" \
npm start
```

## Endpoints disponíveis

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/mcp` | JSON-RPC (Streamable HTTP) |
| `GET` | `/mcp/sse` | SSE transport |
| `POST` | `/mcp/messages` | SSE messages |
| `GET` | `/healthz` | Health check |
| `GET` | `/` | Interface Web |
| `GET` | `/api/processos` | API REST (Web UI) |

## Integração com MCP Inspector / Claude Desktop

```json
{
  "mcpServers": {
    "sei": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Ou via STDIO:

```json
{
  "mcpServers": {
    "sei": {
      "command": "node",
      "args": ["/caminho/para/mcp-server-sei/src/index.js"],
      "env": {
        "SEI_URL": "https://sei.orgao.gov.br",
        "SEI_TOKEN": "SEU_TOKEN",
        "SEI_UNIDADE": "110000123"
      }
    }
  }
}
```

## Compatibilidade com a API SEI

Este servidor foi desenvolvido para a **SEI API REST v1**, disponível em `{SEI_URL}/sei/api/v1/`. A documentação oficial é fornecida para órgãos credenciados pela SEGES/MGI.

### Versões suportadas

- SEI 4.x (API v1 REST)
- SEI 3.x (com limitações)

## Segurança

- O token de API deve ser tratado como segredo
- Utilize variáveis de ambiente ou Secrets (Kubernetes, OpenShift, etc.)
- **Nunca** inclua o token em código-fonte ou imagens Docker
