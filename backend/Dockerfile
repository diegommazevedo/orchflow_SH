# ── Stage: build + runtime ────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Dependências do sistema necessárias para psycopg2 e bcrypt
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Instala dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia código-fonte
COPY . .

# Cria diretório de logs e usuário não-root
RUN mkdir -p /app/logs && \
    addgroup --system appgroup && \
    adduser --system --ingroup appgroup --no-create-home appuser && \
    chown -R appuser:appgroup /app

USER appuser

# Railway injeta PORT via env var; default 8010 para dev local
ENV PORT=8010
EXPOSE ${PORT}

# CMD usa sh para expandir $PORT em runtime
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
