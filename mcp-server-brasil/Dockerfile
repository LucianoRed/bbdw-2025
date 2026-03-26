FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir mcp-brasil fastmcp

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

CMD ["fastmcp", "run", "mcp_brasil.server:mcp", "--transport", "http", "--port", "8000", "--host", "0.0.0.0"]
