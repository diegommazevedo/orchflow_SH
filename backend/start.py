"""Inicia o backend OrchFlow sem o problema de socket no Windows."""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8010,
        reload=True,
        reload_dirs=["app"],
    )
