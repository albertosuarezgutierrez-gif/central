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
# Resúmenes de uso de herramientas por sesión (los escribe el hook PostToolUse
# scripts/uso-herramientas.mjs). Se persisten junto a la memoria y NO cuentan como
# "trabajo real" para el guardián: son medición, no trabajo.
USO="docs/uso-herramientas"
GITDIR="$(git rev-parse --git-dir 2>/dev/null)"
MARKER="$GITDIR/.central-session-base"
# El hook PostToolUse escribe en STAGING (fuera del árbol, dentro de .git/) en cada tool call. Aquí
# se copia a docs/ y se commitea SOLO junto a la memoria o, como mucho, una vez cada USO_CADA_S.
# Medido el 12/09/2026: persistirlo en cada Stop = un push por turno = CI + 12 deployments de Vercel
# por turno (cuatro pushes en 40 s con la sesión despierta por eventos del PR).
USO_STAGING="$GITDIR/uso-herramientas"
USO_STAMP="$GITDIR/.central-uso-last-persist"
USO_CADA_S=1800

uso_vencido() {
  [ -f "$USO_STAMP" ] || return 0
  local ultimo; ultimo="$(cat "$USO_STAMP" 2>/dev/null)"
  [ -z "$ultimo" ] && return 0
  [ $(( $(date +%s) - ultimo )) -ge "$USO_CADA_S" ]
}

copiar_uso() {
  [ -d "$USO_STAGING" ] || return 0
  mkdir -p "$USO" 2>/dev/null
  cp -r "$USO_STAGING"/. "$USO"/ 2>/dev/null
}

# --- ¿La rama actual ya está fusionada en main? Entonces NO se commitea ni empuja a ella:
# mover la punta tras el merge quita el «Delete branch» de GitHub y deja commits huérfanos
# (caso ccf49acad tras #4741). Sin red/gh: devuelve 1 (no fusionada) = comportamiento de siempre.
rama_fusionada() {
  local rama; rama="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  case "$rama" in ""|HEAD|main|master) return 1 ;; esac
  local t=""; command -v timeout >/dev/null 2>&1 && t="timeout 20"
  $t git fetch -q origin main 2>/dev/null
  # 1) Merge normal: la punta ya es ancestro de origin/main. Solo si la rama se llegó a empujar
  #    (origin/<rama> existe): una rama nueva sin empujar también es ancestro de main.
  if git rev-parse -q --verify "refs/remotes/origin/$rama" >/dev/null 2>&1 \
     && git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
    return 0
  fi
  # 2) Squash merge: PR cerrado y fusionado de esta rama, sin PR abierto, con todo su trabajo en HEAD.
  command -v gh >/dev/null 2>&1 || return 1
  local filas; filas="$($t gh api "repos/{owner}/{repo}/pulls?head={owner}:$rama&state=all&per_page=30" \
    --jq '.[] | "\(.state) \(.merged_at // "-") \(.head.sha)"' 2>/dev/null)" || return 1
  [ -n "$filas" ] || return 1
  printf '%s\n' "$filas" | grep -q '^open ' && return 1
  local est fus sha fusionada=1
  while read -r est fus sha; do
    [ "$fus" != "-" ] || continue
    if ! git cat-file -e "$sha" 2>/dev/null || git merge-base --is-ancestor "$sha" HEAD 2>/dev/null; then
      fusionada=0
    fi
  done <<< "$filas"
  return $fusionada
}

# --- Persist: commitea+pushea la memoria si cambió (y el uso, con cadencia). ---
persist_memoria() {
  if rama_fusionada; then
    echo "persist-memoria: la rama ya está fusionada; no se commitea ni empuja la memoria (evita mover la punta tras el merge)." >&2
    return 0
  fi
  if [ -n "$(git status --porcelain -- "$DOC" 2>/dev/null)" ] || uso_vencido; then
    copiar_uso
  fi
  if [ -n "$(git status --porcelain -- "$DOC" "$USO" 2>/dev/null)" ]; then
    git add -- "$DOC" 2>/dev/null
    [ -d "$USO" ] && git add -- "$USO" 2>/dev/null
    git commit -q -m "chore(memoria): actualizar contexto de sesión" -- "$DOC" "$USO" 2>/dev/null
    # Empuje al branch actual; si falla (offline / non-fast-forward) no pasa nada,
    # el commit queda local y se empujará en el próximo cierre.
    git push -q origin HEAD 2>/dev/null
    date +%s > "$USO_STAMP" 2>/dev/null
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
    if [ -n "$(printf '%s\n' "$CHANGED" | grep -v -e '^$' -e "^${DOC}\$" -e "^${USO}/" 2>/dev/null)" ]; then
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
