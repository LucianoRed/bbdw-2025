# Llama Stack (vLLM) container

Este container empacota o servidor vLLM em UBI 9 com Python 3.11. O script de entrada (`start.sh`) ajusta defaults para CPU (macOS, sem GPU) ou GPU (CUDA) com base na variável `VLLM_DEVICE`.

## TL;DR

- macOS/CPU (rápido para testar):

```bash
# dentro do diretório llama-stack
docker build -t llama-stack:cpu .
docker run --rm -p 8000:8000 llama-stack:cpu
```

- Linux com GPU NVIDIA (CUDA):

```bash
# construir normalmente
docker build -t llama-stack:gpu .
# executar com GPU (requer Docker + NVIDIA Container Toolkit)
docker run --rm --gpus all \
  -e VLLM_DEVICE=cuda \
  -e MODEL_ID=meta-llama/Llama-3.1-8B-Instruct \
  -e VLLM_ARGS="--dtype auto --gpu-memory-utilization 0.90" \
  -p 8000:8000 llama-stack:gpu
```

> Observação: `VLLM_DEVICE=gpu` não é reconhecido pelo `vllm serve`. Use `cuda` (GPU) ou `cpu`.

## Variáveis de ambiente

- `VLLM_DEVICE` (padrão: `cpu`)
  - Valores suportados: `cpu` ou `cuda`.
- `MODEL_ID` (padrões):
  - `cpu`: `TinyLlama/TinyLlama-1.1B-Chat-v1.0` (modelo pequeno para teste).
  - `cuda`: `meta-llama/Llama-3.1-8B-Instruct`.
- `VLLM_ARGS` (padrões):
  - `cpu`: `--dtype auto`.
  - `cuda`: `--dtype auto --gpu-memory-utilization 0.90`.
- `VLLM_HOST` (padrão: `0.0.0.0`) e `VLLM_PORT` (padrão: `8000`).

## Healthcheck e APIs

O container expõe a porta `8000` e faz healthcheck em `/v1/models`.

Exemplo para listar modelos:

```bash
curl -s http://localhost:8000/v1/models | jq
```

## Dicas para macOS

- Docker Desktop no macOS não oferece CUDA. Portanto, rode em `VLLM_DEVICE=cpu` ou use uma máquina Linux com GPU.
- Modelos grandes (8B+) em CPU podem ficar lentos e/ou estourar memória. Use um modelo menor para validar o fluxo (ex.: TinyLlama) e depois mude para GPU.

## Erros comuns

- `unrecognized device 'gpu'`: substitua `VLLM_DEVICE=gpu` por `VLLM_DEVICE=cuda`.
- Falhas imediatas ao iniciar em macOS: provavelmente devido ao default `cuda` em imagens antigas; esta versão já inicia em `cpu` por padrão.

## Alternativa 100% CPU (Ollama) — OpenAI compatível

Se você só precisa validar a API OpenAI compatível em CPU, uma opção simples é usar o Ollama:

```bash
# construir (opcional, pode usar a imagem oficial diretamente)
docker build -f Dockerfile.ollama -t llama-stack:ollama .

# executar mapeando 8000 -> 11434
docker run --rm -p 8000:11434 --name ollama llama-stack:ollama
# ou diretamente com a imagem oficial
# docker run --rm -p 8000:11434 --name ollama ollama/ollama:latest

# (em outro terminal) baixar um modelo leve
docker exec -it ollama ollama pull tinyllama

# testar endpoint OpenAI compatível
curl -s http://localhost:8000/v1/models | jq
```

Observações:

- A API do Ollama expõe endpoints OpenAI-compatíveis em `/v1/*`, funcionando com muitas libs cliente existentes.
- Em produção/GPU, prefira vLLM; para desenvolvimento em macOS sem GPU, Ollama é prático.
