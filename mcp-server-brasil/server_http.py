import uvicorn
from starlette.middleware.cors import CORSMiddleware
from mcp_brasil.server import mcp

if __name__ == "__main__":
    app = mcp.http_app(stateless_http=True)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    uvicorn.run(app, host="0.0.0.0", port=8000)
