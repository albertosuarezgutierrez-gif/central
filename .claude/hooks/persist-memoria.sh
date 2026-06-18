#!/usr/bin/env bash
# Stop hook — guardián de memoria + persistencia entre contenedores efímeros.
#
# Dos funciones:
#  1) GUARDIÁN: si la sesión hizo trabajo real (commits que tocan algo distinto
#     de la memoria) pero NO anotó docs/CONTEXTO-SESIONES.md, bloquea UNA vez y
#     pide anotarlo antes de cerrar. El flag stop_hook_active evita el bucle.
#  2) PERSIST: si docs/CONTEXTO-SESIONES.md cambió, lo commitea y empuja.
#
# Best-effort: nunca falla ni rompe el cierre. Las sesiones de solo lectura /
# preguntas (sin commits) nunca se bloquean.
set +e

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

DOC="docs/CONTEXTO-SESIONES.md"
MARKER="$(git rev-parse --git-dir 2>/dev/null)/.central-session-base"

# --- Persist: commitea+pushea la memoria si cambió (solo ese archivo). ---
persist_memoria() {
  if [ -n "$(git status --porcelain -- "$DOC" 2>/dev/null)" ]; then
    git add -- "$DOC" 2>/dev/null
    git commit -q -m "chore(memoria): actualizar contexto de sesión" -- "$DOC" 2>/dev/null
    # Empuje al branch actual; si falla (offline / non-fast-forward) no pasa nada,
    # el commit queda local y se empujará en el próximo cierre.
    git push -q origin HEAD 2>/dev/null
  fi
}

# --- Lee stop_hook_active del JSON de stdin (sin depender de jq). ---
INPUT="$(cat 2>/dev/null)"
STOP_ACTIVE="false"
case "$INPUT" in
  *'"stop_hook_active"'*true*) STOP_ACTIVE="true" ;;
esac

# Si ya avisamos en este ciclo de cierre, no volver a bloquear: persist y salir.
if [ "$STOP_ACTIVE" = "true" ]; then
  persist_memoria
  exit 0
fi

# --- Guardián: ¿trabajo real sin memoria anotada? ---
# Sin marcador base no podemos acotar la sesión → no bloqueamos (solo persist).
if [ -f "$MARKER" ]; then
  BASE="$(cat "$MARKER" 2>/dev/null)"
  if [ -n "$BASE" ] && git cat-file -e "$BASE" 2>/dev/null; then
    # Archivos tocados por commits nuevos de esta sesión.
    CHANGED="$(git log --name-only --pretty=format: "$BASE..HEAD" 2>/dev/null | sort -u)"

    # ¿Hay commits que toquen algo distinto de la memoria? = trabajo real.
    TRABAJO_REAL=""
    if [ -n "$(printf '%s\n' "$CHANGED" | grep -v -e '^$' -e "^${DOC}\$" 2>/dev/null)" ]; then
      TRABAJO_REAL="1"
    fi

    # ¿Se anotó la memoria? = el doc está en los commits o en el working-tree.
    MEMORIA_ANOTADA=""
    if printf '%s\n' "$CHANGED" | grep -qx "$DOC" 2>/dev/null; then
      MEMORIA_ANOTADA="1"
    elif [ -n "$(git status --porcelain -- "$DOC" 2>/dev/null)" ]; then
      MEMORIA_ANOTADA="1"
    fi

    if [ -n "$TRABAJO_REAL" ] && [ -z "$MEMORIA_ANOTADA" ]; then
      printf '{"decision":"block","reason":"Hiciste cambios en esta sesión pero no actualizaste docs/CONTEXTO-SESIONES.md. Añade una entrada ARRIBA (qué hiciste, PRs/branches, pendientes) antes de cerrar. Si de verdad no hay nada que recordar, dilo y cierra."}\n'
      exit 0
    fi
  fi
fi

# Sin trabajo real, o memoria ya anotada: persist y salir.
persist_memoria
exit 0
