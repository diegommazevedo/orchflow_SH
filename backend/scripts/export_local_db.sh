#!/usr/bin/env bash
# export_local_db.sh — Exporta o banco local (Docker) para um arquivo SQL
#
# Uso:
#   bash backend/scripts/export_local_db.sh
#
# Requer: docker em execução com o container orchflow_postgres

set -e

CONTAINER="orchflow-postgres-1"   # ajuste se o nome do seu container for diferente
DB_NAME="orchflow"
DB_USER="orchflow"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT="backup_${TIMESTAMP}.sql"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " OrchFlow — Export do banco local"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Container : $CONTAINER"
echo " Banco     : $DB_NAME"
echo " Arquivo   : $OUTPUT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verifica se o container está rodando
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "❌  Container '$CONTAINER' não encontrado."
    echo "    Containers ativos:"
    docker ps --format '  • {{.Names}}'
    echo ""
    echo "    Corrija a variável CONTAINER no script e rode novamente."
    exit 1
fi

docker exec "$CONTAINER" \
    pg_dump -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-acl \
    --format=plain \
    > "$OUTPUT"

SIZE=$(du -sh "$OUTPUT" | cut -f1)
echo "✓  Exportado com sucesso: $OUTPUT ($SIZE)"
echo ""
echo "Próximo passo:"
echo "  bash backend/scripts/import_to_railway.sh $OUTPUT \"postgresql://...\""
