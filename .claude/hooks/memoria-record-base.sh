#!/usr/bin/env bash
# SessionStart hook — graba el SHA base de la sesión.
# El guardián de cierre (persist-memoria.sh) compara BASE..HEAD para saber si la
# sesión hizo trabajo real sin anotar memoria. El marcador vive dentro de .git
# (nunca trackeado). Idempotente: no sobreescribe (p.ej. en `compact` la sesión
# sigue siendo la misma, conserva el BASE original).
# Best-effort: nunca falla ni bloquea.
set +e

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

MARKER="$(git rev-parse --git-dir 2>/dev/null)/.central-session-base"

# Solo escribe si aún no existe (idempotente).
if [ ! -f "$MARKER" ]; then
  HEAD_SHA="$(git rev-parse HEAD 2>/dev/null)"
  [ -n "$HEAD_SHA" ] && printf '%s\n' "$HEAD_SHA" > "$MARKER" 2>/dev/null
fi

exit 0
