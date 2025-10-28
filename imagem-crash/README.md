# imagem-crash

Imagem de demonstração que entra em CrashLoopBackOff (em Kubernetes) quando falta uma variável de ambiente obrigatória.

- Variável obrigatória por padrão: `APP_REQUIRED_TOKEN` (pode mudar via `REQUIRED_VAR_NAME`).
- Log explícito na inicialização indicando qual variável faltou e como corrigir.

## Como testar localmente (Docker)

```bash
# no diretório imagem-crash
docker build -t imagem-crash:latest .

# Sem a env -> deve falhar com código 42 e mensagem clara
docker run --rm imagem-crash:latest

# Com a env -> deve ficar "rodando" (idle loop)
docker run --rm -e APP_REQUIRED_TOKEN=abc imagem-crash:latest
```

Exemplo de log de erro:

```
[startup][ERROR] Missing required environment variable: APP_REQUIRED_TOKEN
[startup][HINT] To fix locally: docker run -e APP_REQUIRED_TOKEN=<value> <image>
[startup][HINT] To fix in Kubernetes: kubectl set env deployment/<name> APP_REQUIRED_TOKEN=<value> -n <namespace>
[startup][EXIT] Exiting with code 42
```

## Como reproduzir CrashLoopBackOff no Kubernetes

1) Construa e publique a imagem (ou carregue no seu cluster):

```bash
# Build local
docker build -t <registry>/<user>/imagem-crash:latest .
# Publique em um registry acessível pelo cluster (ajuste para o seu)
docker push <registry>/<user>/imagem-crash:latest
```

2) Aplique o Deployment de exemplo (sem a env obrigatória):

```bash
kubectl apply -f k8s/deployment.yaml
kubectl get pods -w
# Em poucos segundos, o Pod entrará em CrashLoopBackOff
```

3) Veja os logs do Pod (a mensagem ficará explícita):

```bash
kubectl logs deploy/imagem-crash
```

4) Corrija adicionando a variável de ambiente:

```bash
kubectl set env deployment/imagem-crash APP_REQUIRED_TOKEN=super-secreto
# aguarde o rollout
kubectl rollout status deployment/imagem-crash
```

5) Opcional: usar o MCP server desta repo para aplicar o ajuste:

- Ferramenta: `add_deployment_env_var`
- Exemplo de chamada (HTTP JSON-RPC):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "add_deployment_env_var",
    "arguments": {
      "namespace": "default",
      "deployment": "imagem-crash",
      "name": "APP_REQUIRED_TOKEN",
      "value": "super-secreto",
      "confirm": true
    }
  }
}
```

## Manifesto de exemplo

Arquivos em `k8s/`:
- `deployment.yaml`: cria o Deployment sem a env (gera CrashLoopBackOff)

Ajuste a imagem `image: <registry>/<user>/imagem-crash:latest` conforme seu registry.
