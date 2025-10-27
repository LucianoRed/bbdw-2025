#!/usr/bin/env bash
set -euo pipefail

# Defaults and env normalization
HOST="${VLLM_HOST:-0.0.0.0}"
PORT="${VLLM_PORT:-8000}"
DEVICE_RAW="${VLLM_DEVICE:-cpu}"
ARGS_RAW="${VLLM_ARGS:-}"
MODEL_RAW="${MODEL_ID:-}"

# Normalize device values
case "${DEVICE_RAW,,}" in
  gpu)
    echo "[start.sh] Aviso: VLLM_DEVICE=gpu não é válido; usando 'cuda'." >&2
    DEVICE="cuda"
    ;;
  cuda|cpu)
    DEVICE="${DEVICE_RAW,,}"
    ;;
  *)
    echo "[start.sh] VLLM_DEVICE='${DEVICE_RAW}' não reconhecido; usando 'cpu'." >&2
    DEVICE="cpu"
    ;;
esac

# Choose defaults based on device when not provided
if [[ -z "${MODEL_RAW}" ]]; then
  if [[ "${DEVICE}" == "cuda" ]]; then
    MODEL="meta-llama/Llama-3.1-8B-Instruct"
  else
    MODEL="TinyLlama/TinyLlama-1.1B-Chat-v1.0"
  fi
else
  MODEL="${MODEL_RAW}"
fi

if [[ -z "${ARGS_RAW}" ]]; then
  if [[ "${DEVICE}" == "cuda" ]]; then
    ARGS="--dtype auto --gpu-memory-utilization 0.90"
  else
    ARGS="--dtype auto"
  fi
else
  ARGS="${ARGS_RAW}"
fi

# Echo config
cat <<EOF
[start.sh] Iniciando vLLM com:
  Host/Porta : ${HOST}:${PORT}
  Device     : ${DEVICE}
  Modelo     : ${MODEL}
  Args       : ${ARGS}
EOF

# Start server
exec vllm serve "${MODEL}" --host "${HOST}" --port "${PORT}" ${ARGS} --device "${DEVICE}"
