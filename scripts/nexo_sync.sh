#!/bin/bash
# nexo_sync.sh — Sincroniza estado de sesión con git
# Uso al TERMINAR sesión: bash scripts/nexo_sync.sh "descripción opcional"
# Uso al EMPEZAR sesión:  bash scripts/nexo_sync.sh --pull

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

if [ "$1" = "--pull" ]; then
    echo "==> Actualizando desde remoto..."
    git pull
    echo ""
    echo "==> Último estado registrado:"
    head -20 NEXO_ESTADO.md
    exit 0
fi

# Fin de sesión: commit del estado actual
MSG="${1:-sin descripción}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

git add NEXO_ESTADO.md
git diff --cached --quiet && echo "Sin cambios en NEXO_ESTADO.md" && exit 0

git commit -m "estado: $TIMESTAMP — $MSG"
git push && echo "" && echo "Contexto sincronizado. Otra PC puede hacer: bash scripts/nexo_sync.sh --pull"
