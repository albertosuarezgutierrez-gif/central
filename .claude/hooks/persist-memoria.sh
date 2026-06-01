#!/usr/bin/env bash
# Persiste la memoria de sesión entre contenedores efímeros.
# Si docs/CONTEXTO-SESIONES.md cambió, lo commitea y empuja (solo ese archivo).
# Best-effort: nunca falla ni bloquea el cierre de la sesión.
set +e

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

DOC="docs/CONTEXTO-SESIONES.md"

# ¿Hay cambios (staged o sin stage) en el doc de memoria?
if [ -n "$(git status --porcelain -- "$DOC" 2>/dev/null)" ]; then
  git add -- "$DOC" 2>/dev/null
  git commit -q -m "chore(memoria): actualizar contexto de sesión" -- "$DOC" 2>/dev/null
  # Empuje al branch actual; si falla (offline / non-fast-forward) no pasa nada,
  # el commit queda local y se empujará en el próximo cierre.
  git push -q origin HEAD 2>/dev/null
fi

exit 0
