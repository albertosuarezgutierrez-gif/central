#!/usr/bin/env bash
# SessionStart hook — superpowers (vendorizado en ia.rest)
#
# Inyecta la meta-skill `using-superpowers` al arrancar/compactar/limpiar la
# sesión, para que Claude recuerde consultar los skills antes de actuar.
# Adaptado del `hooks/session-start` original de obra/superpowers para leer
# desde el repo (no desde $CLAUDE_PLUGIN_ROOT) — entorno solo Linux/Claude Code.
#
# Subset instalado: systematic-debugging, verification-before-completion,
# writing-plans, brainstorming, requesting-code-review, receiving-code-review.

set -euo pipefail

# Raíz del proyecto: Claude Code expone $CLAUDE_PROJECT_DIR; si no, deducir.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
SKILL_FILE="${PROJECT_DIR}/.claude/skills/using-superpowers/SKILL.md"

using_superpowers_content="$(cat "$SKILL_FILE" 2>/dev/null || echo "Error reading using-superpowers skill at ${SKILL_FILE}")"

# Escapado a JSON con substitución de parámetros (rápido, una pasada por regla).
escape_for_json() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

using_superpowers_escaped="$(escape_for_json "$using_superpowers_content")"
session_context="<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\n**Below is the full content of your 'using-superpowers' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n${using_superpowers_escaped}\n</EXTREMELY_IMPORTANT>"

# Formato que consume Claude Code (printf en vez de heredoc por bash 5.3+).
printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "SessionStart",\n    "additionalContext": "%s"\n  }\n}\n' "$session_context"

exit 0
