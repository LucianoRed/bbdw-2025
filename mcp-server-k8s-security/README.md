# MCP Server: K8s Security (NetworkPolicies)

Servidor MCP focado em segurança da informação em clusters Kubernetes/OpenShift. Expõe ferramentas para:

- Listar Namespaces
- Listar/criar/deletar NetworkPolicies
- Ler logs de Pods

Deliberadamente NÃO inclui ações de alteração em Deployments, MachineSets, VPA etc.

## Transportes suportados

- STDIO (padrão)
- HTTP JSON-RPC streamable: `POST /mcp`
- SSE: `GET /mcp/sse` + `POST /mcp/messages?sessionId=<id>`

## Variáveis de ambiente

- `K8S_API_URL` (obrigatório): ex. `https://seu-cluster:6443`
- `K8S_BEARER_TOKEN` (obrigatório)
- `K8S_SKIP_TLS_VERIFY` (opcional): `true` para ignorar TLS
- `K8S_CLUSTER_NAME` (opcional): nome amigável do cluster nas mensagens
- `PORT` (opcional): porta HTTP (padrão 3000)
- `ENABLE_STDIO` (opcional): `true` (padrão) para habilitar STDIO

## Execução

```sh
npm install
npm start
```

Exemplo via Docker:

```sh
docker build -t mcp-server-k8s-security:latest .

docker run --rm -it \
  -e K8S_API_URL="https://seu-cluster:6443" \
  -e K8S_BEARER_TOKEN="<token>" \
  -e K8S_SKIP_TLS_VERIFY="true" \
  -e PORT=3000 \
  -p 3000:3000 \
  mcp-server-k8s-security:latest
```

## Ferramentas

1) list_namespaces
- Parâmetros: `labelSelector` (opcional)
- Retorno: lista de namespaces (name, labels, status, creationTimestamp)

2) list_networkpolicies
- Parâmetros: `namespace` (opcional), `labelSelector` (opcional)
- Retorno: lista de NetworkPolicies (name, namespace, policyTypes, podSelector, ingressCount, egressCount)

2.1) get_networkpolicy
- Parâmetros: `namespace` (string, obrigatório), `name` (string, obrigatório)
- Retorno: objeto completo da NetworkPolicy

3) create_networkpolicy
- Parâmetros: `namespace` (string, obrigatório), `name` (string, obrigatório), `spec` (objeto, obrigatório), `confirm` (boolean, obrigatório), `dryRun` (boolean, opcional)
- Retorno: objeto criado (ou simulado se `dryRun=true`)

4) delete_networkpolicy
- Parâmetros: `namespace` (string, obrigatório), `name` (string, obrigatório), `confirm` (boolean, obrigatório), `dryRun` (boolean, opcional)
- Retorno: status da deleção (ou simulado)

4.1) create_np_template
- Parâmetros: `namespace` (string, obrigatório), `name` (string, obrigatório), `template` (enum: `deny-all`, `allow-same-namespace`, `allow-dns`), `options` (objeto opcional), `confirm` (boolean, obrigatório), `dryRun` (boolean, opcional)
- Retorno: objeto criado (ou simulado)
- Observações:
  - `deny-all`: cria policy que nega todo tráfego (Ingress/Egress).
  - `allow-same-namespace`: permite tráfego Ingress/Egress apenas entre pods do mesmo namespace.
  - `allow-dns`: permite egress para DNS (TCP/UDP 53) a pods no namespace de DNS. Padrões: `dnsNamespace=kube-system`, `dnsLabelKey=k8s-app`, `dnsLabelValue=kube-dns` (parametrizáveis em `options`).

5) get_pod_logs
- Parâmetros: `namespace` (string), `name` (string), `container` (opcional), `tailLines` (opcional), `sinceSeconds` (opcional), `previous` (opcional), `timestamps` (opcional)
- Retorno: texto dos logs (limitado a 10000 caracteres finais)
