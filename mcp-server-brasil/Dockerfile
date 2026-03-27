FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    mcp-brasil \
    "fastmcp[http]" \
    uvicorn \
    starlette

COPY server_http.py .

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

CMD ["python", "server_http.py"]
