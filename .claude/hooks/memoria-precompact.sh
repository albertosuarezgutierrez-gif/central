#!/usr/bin/env bash
# PreCompact hook — recordatorio de volcado de memoria antes de compactar.
# En sesiones largas el resumen de compactación se come detalles ANTES de que
# actúe el guardián de cierre. Esto pide a Claude que vuelque el estado clave a
# docs/CONTEXTO-SESIONES.md antes de perder contexto.
# Best-effort: nunca bloquea (PreCompact no admite block), siempre exit 0.
set +e

RECORDATORIO="Antes de compactar: si en esta sesión hay decisiones, PRs/branches o pendientes que aún no estén en docs/CONTEXTO-SESIONES.md, vuélcalos AHORA (entrada nueva arriba) — el resumen de compactación puede perder esos detalles."

printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "PreCompact",\n    "additionalContext": "%s"\n  }\n}\n' "$RECORDATORIO"

exit 0
