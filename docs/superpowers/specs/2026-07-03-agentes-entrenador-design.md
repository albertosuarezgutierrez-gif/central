# Diseño — `agentes-entrenador` (agente que mejora los prompts de los agentes)

> **Fecha:** 2026-07-03 · **Estado:** spec aprobado en conversación (enfoque A), pendiente
> de revisión final de Alberto antes de implementar.
>
> **Idea de Alberto:** "un agente que actualice los prompts de los propios agentes — un
> agente de un agente, un loop". Decisiones tomadas en el brainstorming: alcance **ambas
> patas** (mejora por rendimiento + refuerzo de la revisión de calidad), **todas** las
> fuentes de feedback, **rutina propia semanal**, enfoque **A (bitácora en repo)**.

## Qué existe ya (y este agente NO duplica)

- `/auditoria-diaria` ya cierra el loop de **frescura factual**: reconcilia skills/docs
  contra el código real, auto-aplica arreglos de texto a `main` (bitácora en
  `docs/AUTO-APLICADOS.md`) y manda lo "raro" a PR draft + Telegram.
- `docs/FUENTES-DE-VERDAD.md` mapea cada doc/skill → los paths de código que describe.

**Lo nuevo:** un agente que mejora los prompts por **rendimiento** (qué hicieron de verdad
los agentes programados, qué fallaron, qué corrigió Alberto a mano) y por **calidad
transversal** (contradicciones entre skills, redundancias, secciones muertas). La frescura
factual sigue siendo territorio de `/auditoria-diaria`: si el entrenador detecta drift
factual puro, lo anota y lo deja para la auditoría.

## Piezas nuevas

1. **Skill `agentes-entrenador`** (`.claude/skills/agentes-entrenador/SKILL.md`) +
   comando `.claude/commands/agentes-entrenador.md`: el prompt del meta-agente.
2. **`docs/AGENTES-BITACORA.md`** — bitácora de auto-informes. Cada skill programada gana
   un paso final barato: apéndice de UNA entrada por ejecución (3-5 líneas máx.):
   ```
   - **YYYY-MM-DD · <agente>** · hizo: …; dudas: …; fallos: …; PRs/commits: #xxx
   ```
   El entrenador **poda las entradas ya procesadas** en su pasada (git guarda el
   histórico; el archivo no engorda).
3. **`docs/FEEDBACK-AGENTES.md`** — canal de feedback explícito de Alberto: una línea a
   mano cuando un agente la líe ("facturas-correo clasificó mal los recibos de Endesa").
   El entrenador las consume y las marca como procesadas (`✅ procesado YYYY-MM-DD → PR #x`).
4. **Trigger semanal propio** — domingo ~07:30 CEST (los agentes de la semana ya han
   corrido: facturas diaria, pricing lunes, psd2 miércoles, ialimp viernes…). Documentado
   en `docs/RUTINAS-PROGRAMADAS.md` con el mismo patrón que las demás rutinas.
5. **Retoque de las 7 skills programadas** (facturas-correo, pricing-agente,
   fiscal-novedades, psd2-health-check, ialimp-client-health, rrhh-compliance-calendar,
   github-vigia): añadir el paso final de auto-informe en `AGENTES-BITACORA.md`.

## Flujo semanal del entrenador

1. **Reunir evidencia** (todas las fuentes acordadas):
   - `docs/AGENTES-BITACORA.md` (auto-informes de la semana).
   - `docs/FEEDBACK-AGENTES.md` (feedback explícito de Alberto sin procesar).
   - `git log` + PRs de la semana: un PR abierto por un agente y **cerrado sin mergear**
     = señal de fallo; mergeado = acierto. Commits de Alberto que corrigen trabajo de un
     agente = señal fuerte.
   - `docs/AUTO-APLICADOS.md` y `docs/CONTEXTO-SESIONES.md` (rastros que ya persisten).
   - BD por MCP **solo-lectura**: `pricing_aprendizaje`, `fiscal_novedades` (decisión del
     agente vs resultado real, para los agentes con huella en BD).
2. **Diagnóstico por agente:** ¿hizo lo que su skill promete? ¿errores o dudas
   repetidas? ¿le tocó a Alberto corregir algo a mano después?
3. **Revisión de calidad transversal** (la pata "reforzar lo existente"): contradicciones
   entre skills, redundancias, secciones muertas que ya no describen nada.
4. **Entrega en dos carriles** — como la auditoría pero MÁS estricto:
   - **Carril 2 (por defecto): cualquier cambio de comportamiento de un prompt → PR
     draft + aviso Telegram.** Un PR por skill tocada, con la cadena evidencia→cambio en
     la descripción del PR.
   - **Carril 1 (excepción):** solo correcciones factuales triviales (typo, ruta muerta,
     nombre de archivo movido) directas a `main`, con línea en `docs/AUTO-APLICADOS.md`.
5. **Mantenimiento:** podar bitácora procesada, marcar feedback, anotar la pasada en
   `docs/CONTEXTO-SESIONES.md`.

## Guardarraíles anti-loop (para que el "agente de agentes" no degenere)

- El entrenador **NUNCA auto-aplica cambios a su propia skill** — a sí mismo, siempre PR
  draft. (Un agente que reescribe sus propias instrucciones sin revisión degrada en
  silencio: cada reescritura pierde un matiz.)
- **Nunca reescribe una skill entera:** diffs acotados, preferiblemente aditivos. Si cree
  que media skill está mal planteada, lo argumenta en el PR — no lo ejecuta.
- Las **decisiones fechadas de Alberto** dentro de las skills (reglas de negocio, "decisión
  de Alberto (fecha)") no se tocan sin PR jamás.
- **Tope de 5 auto-aplicados por pasada;** el resto, a PR. Ante la duda, PR.
- **Sin evidencia nueva en la semana → pasada silenciosa:** sin Telegram, sin PRs, solo la
  poda/anotación de rutina.

## Integración con lo existente

- `/auditoria-diaria` queda tal cual (frescura factual); el entrenador cubre rendimiento +
  calidad transversal. Frontera explícita en ambas skills para no pisarse.
- Filas nuevas en `docs/SKILLS.md` (sección "Auditoría y memoria" o "Agentes programados"),
  `docs/FUENTES-DE-VERDAD.md` (skill → `.claude/skills/**`, docs nuevos) y
  `docs/RUTINAS-PROGRAMADAS.md` (cadencia + setup del trigger).
- Mención breve en `CLAUDE.md` raíz (bloque "Memoria entre sesiones", junto a la auditoría).
- Telegram degrada con gracia si faltan `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (mismo
  patrón que la auditoría: no manda aviso, el resto sigue).

## Puesta en marcha y verificación

1. Implementar skill + docs + retoques de las 7 skills (un solo PR).
2. **Primera pasada A MANO** (`/agentes-entrenador`) para validar: lee las fuentes, genera
   PRs bien formados, el Telegram llega, la poda de bitácora funciona.
3. Solo entonces crear el trigger semanal (domingo 07:30 CEST) y documentarlo en
   `RUTINAS-PROGRAMADAS.md`.

## Fuera de alcance (YAGNI)

- Tablas de BD para informes/feedback (enfoque B): se descartó — los docs en repo bastan
  y son visibles en `git log`. Si la bitácora se queda corta, migrar después.
- Feedback vía respuesta al Telegram del bot (requiere webhook → BD): se descartó por ahora.
- Auto-evaluación numérica/scoring de agentes: sin métricas fiables sería ruido.
- Tocar los agentes que viven FUERA de `.claude/skills` (crons de Vercel, Edge Functions):
  eso es territorio de `github-vigia`/auditoría.
