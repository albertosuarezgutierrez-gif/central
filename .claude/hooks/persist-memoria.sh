#!/usr/bin/env bash
# Persiste el "estado vivo" entre contenedores efímeros: la memoria de sesión y
# el skill maestro. Si alguno cambió, lo commitea y empuja (solo esos archivos).
# Best-effort: nunca falla ni bloquea el cierre de la sesión.
set +e

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# Archivos que deben sobrevivir al contenedor efímero.
FILES=(
  "docs/CONTEXTO-SESIONES.md"
  ".claude/skills/ia-rest-maestro/SKILL.md"
)

CHANGED=()
for f in "${FILES[@]}"; do
  if [ -n "$(git status --porcelain -- "$f" 2>/dev/null)" ]; then
    CHANGED+=("$f")
  fi
done

if [ ${#CHANGED[@]} -gt 0 ]; then
  git add -- "${CHANGED[@]}" 2>/dev/null
  git commit -q -m "chore(memoria): actualizar contexto/skill de sesión" -- "${CHANGED[@]}" 2>/dev/null
  # Empuje al branch actual; si falla (offline / non-fast-forward) no pasa nada,
  # el commit queda local y se empujará en el próximo cierre.
  git push -q origin HEAD 2>/dev/null
fi

exit 0
