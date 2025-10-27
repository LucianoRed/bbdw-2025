FROM registry.access.redhat.com/ubi9/ubi-minimal:9.4

ENV PYTHONUNBUFFERED=1 VLLM_WORKER_USE_SSE=1 VLLM_ALLOW_EMPTY_PROMPT=1 CUDA_VISIBLE_DEVICES="-1" \
  VLLM_USE_EXPERIMENTAL_CPU_ENGINE=1

# Evita weak deps e conflitos; usa curl-minimal
RUN microdnf -y update \
 && microdnf -y --setopt=install_weak_deps=0 install \
   python3.11 python3.11-pip git ca-certificates shadow-utils curl-minimal bash \
 && microdnf clean all

# Venv + vLLM
RUN python3.11 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
RUN pip install -U pip \
 && pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
   'torch>=2.4,<3' 'torchvision>=0.19,<1' 'torchaudio>=2.4,<3' \
 && pip install --no-cache-dir "vllm>=0.5.0"

WORKDIR /app
RUN useradd -u 1001 -m appuser && chown -R 1001:0 /app
USER 1001

ENV VLLM_HOST="0.0.0.0" \
  VLLM_PORT="8000" \
  # Padrão seguro para ambientes sem GPU (ex.: macOS com Docker Desktop)
  VLLM_DEVICE="cpu" \
  # Modelo padrão pequeno para CPU; pode ser sobrescrito em runtime
  MODEL_ID="TinyLlama/TinyLlama-1.1B-Chat-v1.0" \
  # Args genéricos; em GPU você pode sobrescrever para incluir --gpu-memory-utilization
  VLLM_ARGS="--dtype auto"

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -sf http://127.0.0.1:8000/v1/models || exit 1

# Copia script de inicialização que ajusta automaticamente defaults para CPU/GPU
COPY --chown=1001:0 start.sh /app/start.sh
RUN chmod +x /app/start.sh

# use 'exec' p/ repassar sinais
CMD ["/app/start.sh"]