#!/usr/bin/env bash
set -euo pipefail

export OLLAMA_HOST="${OLLAMA_HOST:-0.0.0.0}"
export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-24h}"
MODEL_TAG="${OLLAMA_MODEL_TAG:-bbdw-tiny}"
MODELFILE_PATH="${MODELFILE_PATH:-/etc/ollama/Modelfile}"
BASE_MODEL="${BASE_MODEL:-tinyllama}"

echo "[entrypoint] Iniciando ollama serve em ${OLLAMA_HOST}:11434"
ollama serve &
SERVE_PID=$!

# aguarda daemon ficar pronto
for i in {1..60}; do
  if ollama list >/dev/null 2>&1; then
    break
  fi
  echo "[entrypoint] Aguardando ollama daemon... (${i}s)"
  sleep 1
  if ! kill -0 "$SERVE_PID" 2>/dev/null; then
    echo "[entrypoint] ollama serve saiu inesperadamente" >&2
    exit 1
  fi
done

# garante base model presente (puxa apenas se necessário)
if ! ollama list | awk '{print $1}' | grep -q "^${BASE_MODEL}[:@]"; then
  echo "[entrypoint] Baixando modelo base: ${BASE_MODEL}"
  ollama pull "${BASE_MODEL}" || true
fi

# cria o modelo customizado se não existir
if ! ollama list | awk '{print $1}' | grep -q "^${MODEL_TAG}[:@]"; then
  echo "[entrypoint] Criando modelo ${MODEL_TAG} a partir de ${MODELFILE_PATH}"
  ollama create "${MODEL_TAG}" -f "${MODELFILE_PATH}"
else
  echo "[entrypoint] Modelo ${MODEL_TAG} já existe — mantendo"
fi

echo "[entrypoint] Pronto. Modelos disponíveis:"
ollama list || true

# mantém o processo principal em foreground
wait "$SERVE_PID"
