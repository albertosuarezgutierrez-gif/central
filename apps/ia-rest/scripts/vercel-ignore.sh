#!/bin/bash
# vercel-ignore.sh — Evita deploys innecesarios en Vercel (free: 100/día)
#
# exit 0 = SALTAR el build
# exit 1 = HACER el build
#
# USO EN VERCEL: Project Settings → Build & Development Settings
#                Ignored Build Step → bash scripts/vercel-ignore.sh
#
# FLUJO RECOMENDADO:
#   - Trabaja en rama 'dev' (o cualquier rama) — nunca despliega
#   - Cuando funcione, mergea a 'main' — despliega 1 sola vez
#   - Esto convierte 10 deploys de debugging en 1 deploy limpio

BRANCH="${VERCEL_GIT_COMMIT_REF:-}"
MSG="${VERCEL_GIT_COMMIT_MESSAGE:-}"

# 1. Solo main despliega — todo lo demás se salta
if [ "$BRANCH" != "main" ]; then
  echo "SKIP: rama '$BRANCH' no es main — trabaja aqui sin gastar cuota"
  exit 0
fi

# 2. Etiquetas manuales en el commit message
if echo "$MSG" | grep -qF "[skip ci]"; then
  echo "SKIP: etiqueta [skip ci] en commit"
  exit 0
fi
if echo "$MSG" | grep -qF "[android]"; then
  echo "SKIP: etiqueta [android] en commit"
  exit 0
fi
if echo "$MSG" | grep -qF "[scripts]"; then
  echo "SKIP: etiqueta [scripts] en commit"
  exit 0
fi

# 3. Deteccion automatica: si todos los archivos son android/ scripts/ docs/
CHANGED=$(git diff --name-only HEAD^ HEAD 2>/dev/null)

if [ -z "$CHANGED" ]; then
  echo "BUILD: sin diff detectable"
  exit 1
fi

RELEVANT=$(echo "$CHANGED" | grep -vE "^(android/|scripts/|docs/|\.github/)" | head -1)

if [ -z "$RELEVANT" ]; then
  echo "SKIP: solo cambios en android/ scripts/ docs/ — sin impacto en app"
  echo "Archivos: $(echo "$CHANGED" | tr '\n' ' ')"
  exit 0
fi

echo "BUILD: cambios en app detectados ($RELEVANT ...)"
exit 1
