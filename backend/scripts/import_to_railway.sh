#!/usr/bin/env bash
# import_to_railway.sh — Importa dump SQL para o PostgreSQL do Railway
#
# Uso:
#   bash backend/scripts/import_to_railway.sh backup_20260324_120000.sql "postgresql://..."
#
# Requer: psql instalado localmente (brew install postgresql / apt install postgresql-client)

set -e

SQL_FILE="${1:-}"
RAILWAY_URL="${2:-}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " OrchFlow — Import para Railway"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ -z "$SQL_FILE" ]] || [[ -z "$RAILWAY_URL" ]]; then
    echo "Uso: bash $0 <arquivo.sql> <DATABASE_URL>"
    echo ""
    echo "Exemplo:"
    echo '  bash backend/scripts/import_to_railway.sh backup_20260324.sql "postgresql://user:pass@host:5432/railway"'
    exit 1
fi

if [[ ! -f "$SQL_FILE" ]]; then
    echo "❌  Arquivo não encontrado: $SQL_FILE"
    exit 1
fi

echo " Arquivo   : $SQL_FILE"
echo " Destino   : Railway PostgreSQL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠  Isso IRÁ sobrescrever dados existentes no Railway."
read -r -p "Confirma? (s/N) " CONFIRM

if [[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]]; then
    echo "Cancelado."
    exit 0
fi

# Instala extensão vector se não existir
echo "→ Habilitando pgvector..."
psql "$RAILWAY_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true

# Importa o dump
echo "→ Importando $SQL_FILE..."
psql "$RAILWAY_URL" < "$SQL_FILE"

echo ""
echo "✓  Import concluído com sucesso."
echo ""
echo "Próximos passos:"
echo "  1. Acesse Railway → backend → Redeploy"
echo "  2. Abra a URL do Vercel e teste o login"
