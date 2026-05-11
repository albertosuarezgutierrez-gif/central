#!/bin/bash
# vercel-ignore.sh — Evita deploys innecesarios en Vercel (free: 100/día)
#
# exit 0 = SALTAR el build
# exit 1 = HACER el build
#
# USO EN VERCEL: Project Settings → Build & Development Settings
#                Ignored Build Step → bash scripts/vercel-ignore.sh
#
# Para saltar manualmente, añade al commit message:
#   [skip ci]   — saltar siempre
#   [android]   — commit solo de APK/Android
#   [scripts]   — commit solo de scripts

MSG="${VERCEL_GIT_COMMIT_MESSAGE:-}"

# 1. Etiquetas manuales en el commit
if echo "$MSG" | grep -qF "[skip ci]"; then
  echo "⏭  SKIP — etiqueta [skip ci] en commit"
  exit 0
fi
if echo "$MSG" | grep -qF "[android]"; then
  echo "⏭  SKIP — etiqueta [android] en commit"
  exit 0
fi
if echo "$MSG" | grep -qF "[scripts]"; then
  echo "⏭  SKIP — etiqueta [scripts] en commit"
  exit 0
fi

# 2. Detección automática: si TODOS los archivos cambiados son de android/ scripts/ docs/
CHANGED=$(git diff --name-only HEAD^ HEAD 2>/dev/null)

if [ -z "$CHANGED" ]; then
  echo "✅ BUILD — no hay diff (primer commit o merge)"
  exit 1
fi

RELEVANT=$(echo "$CHANGED" | grep -vE "^(android/|scripts/|docs/|\.github/)" | head -1)

if [ -z "$RELEVANT" ]; then
  echo "⏭  SKIP — solo cambios en android/ scripts/ docs/ (sin impacto en app)"
  echo "Archivos modificados:"
  echo "$CHANGED"
  exit 0
fi

echo "✅ BUILD — hay cambios relevantes en la app"
echo "Primer archivo relevante: $RELEVANT"
exit 1
