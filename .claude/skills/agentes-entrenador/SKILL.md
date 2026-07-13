---
name: agentes-entrenador
description: Agente PROGRAMADO semanal que mejora los prompts de los agentes del monorepo por RENDIMIENTO (qué hicieron de verdad, qué falló, qué corrigió Alberto) y por CALIDAD transversal (contradicciones/redundancias entre skills). NO vigila frescura factual (eso es de /auditoria-diaria). Lee docs/AGENTES-BITACORA.md, docs/FEEDBACK-AGENTES.md, git/PRs de la semana y BD (solo lectura). Entrega cambios de comportamiento SIEMPRE por PR draft + aviso Telegram; solo lo factual trivial directo a main. Úsala cuando Alberto pida "revisa/mejora los prompts de los agentes" o cuando la dispare su trigger semanal (domingo). Sin secretos, solo nombres de variable.
---

# agentes-entrenador — mejora semanal de los prompts de los agentes

> **Qué es.** El "agente de agentes" (idea de Alberto, 03/07/2026): una pasada semanal que
> mira cómo RINDIERON los agentes programados y propone mejoras a sus prompts (skills).
> Spec: `docs/superpowers/specs/2026-07-03-agentes-entrenador-design.md`.
>
> **Qué NO es.** No es la auditoría de frescura: si un doc/skill contradice el CÓDIGO
> (drift factual), eso lo reconcilia `/auditoria-diaria` — anótalo como hallazgo para ella
> (o déjalo pasar: su pasada nocturna lo cazará) y NO lo dupliques aquí.
>
> **MCPs que necesita:** GitHub (PRs de la semana + abrir PR draft) y Supabase (solo
> lectura). Para el aviso Telegram: `POST {PLATAFORMA_URL}/api/internal/alerta` con Bearer
> `ALERTA_SECRET` (token de alertas del ENTORNO; `CRON_SECRET` de respaldo; mismo patrón que psd2-health-check; si faltan, el aviso se omite y el
> resto sigue).

## Guardarraíles anti-loop (léelos ANTES de tocar nada — son la razón de ser del diseño)

1. **A ti mismo, jamás por el carril automático.** Cualquier cambio a
   `.claude/skills/agentes-entrenador/**` o `.claude/commands/agentes-entrenador.md` va
   SIEMPRE a PR draft, aunque sea un typo. Un agente que reescribe sus propias
   instrucciones sin revisión degrada en silencio.
2. **Nunca reescribas una skill entera.** Diffs acotados y preferiblemente ADITIVOS
   (añadir una regla, un caveat, un ejemplo). Si crees que media skill está mal planteada,
   argúmentalo en el cuerpo de un PR draft — no lo ejecutes.
3. **Las decisiones fechadas de Alberto son intocables sin PR.** Cualquier línea tipo
   "Decisión de Alberto (fecha)" o regla de negocio dictada por él: ni tocarla ni
   parafrasearla por el carril automático.
4. **Tope de 5 auto-aplicados por pasada.** Del sexto en adelante, PR draft. Ante la
   duda de si algo es "trivial", es carril 2 (PR).
5. **Semana sin evidencia → pasada silenciosa.** Sin PRs, sin Telegram; solo la poda y la
   anotación de rutina en la bitácora ("sin evidencia nueva").

## Dos carriles de entrega

- **Carril 2 — PR draft + Telegram (POR DEFECTO):** cualquier cambio que altere el
  COMPORTAMIENTO de un agente (reglas nuevas, umbrales, reordenar pasos, matices de
  clasificación…). **Un PR por skill tocada**, rama `claude/entrenador-<skill>-<fecha>`,
  y en el cuerpo la cadena completa **evidencia → diagnóstico → cambio propuesto**
  (cita las entradas de bitácora/feedback/PRs que lo justifican). Aviso Telegram con el
  link al PR.
- **Carril 1 — directo a `main` (EXCEPCIÓN):** solo correcciones factuales triviales de
  las skills de agentes (typo, ruta de archivo movida, nombre de tabla renombrado) que NO
  cambian comportamiento. Cada una deja línea en `docs/AUTO-APLICADOS.md` (mismo formato
  que la auditoría). Máximo 5 por pasada (guardarraíl 4).

## Pasos (crea un TodoWrite por bloque)

1. **Encuadre.** Lee `docs/SKILLS.md` § "Agentes programados" (la lista de agentes a
   evaluar) y la sección "Última poda" de `docs/AGENTES-BITACORA.md` para saber el rango
   temporal (desde la última pasada; si no hay, últimos 7 días).

2. **Reunir evidencia del rango** (todas las fuentes; no inventes señal donde no la hay):
   - `docs/AGENTES-BITACORA.md`: entradas pendientes (qué hicieron, dudas, fallos).
   - `docs/FEEDBACK-AGENTES.md`: pendientes de Alberto (señal de máxima prioridad).
   - GitHub: PRs del rango abiertos por agentes (ramas `claude/*`). Cerrado sin mergear =
     señal de fallo (¿por qué no valió?); mergeado = acierto. Commits de Alberto o de otras
     sesiones que CORRIGEN trabajo reciente de un agente = señal fuerte.
   - `docs/AUTO-APLICADOS.md` y `docs/CONTEXTO-SESIONES.md`: rastros del rango.
   - Supabase (solo lectura): `pricing_aprendizaje` (decisión del agente vs resultado
     real) y `fiscal_novedades` (¿avisos correctos?). Solo para los agentes con huella en
     BD; no fuerces conclusiones de tablas que no conoces.

3. **Diagnóstico por agente.** Para cada agente programado con evidencia en el rango:
   ¿hizo lo que su skill promete? ¿errores o dudas REPETIDAS (2+ veces)? ¿le tocó a
   Alberto corregir algo a mano? Una duda puntual no justifica tocar el prompt; un patrón
   sí. Anota por agente: evidencia → diagnóstico → acción (mejorar prompt / sin acción).

4. **Revisión de calidad transversal** (una pasada por TODAS las skills del repo, no solo
   agentes): contradicciones entre skills (dos skills dan reglas opuestas), redundancias
   (lo mismo dicho en dos sitios que divergirán), secciones muertas (describen algo que ya
   no existe — si es drift factual puro, derívalo a `/auditoria-diaria` en vez de tocarlo).

5. **Entregar por carriles.** Para cada acción del paso 3-4: decide carril (recuerda: por
   defecto carril 2). Abre los PR draft (uno por skill) y aplica los carril-1 con su línea
   en `AUTO-APLICADOS.md`. Manda UN solo Telegram resumen con los links a los PRs (no uno
   por PR). Sin acciones → sin Telegram (guardarraíl 5).

6. **Mantenimiento y cierre.**
   - Poda de `AGENTES-BITACORA.md`: elimina las entradas procesadas y actualiza "Última
     poda" (fecha + nº de entradas del rango).
   - `FEEDBACK-AGENTES.md`: mueve las pendientes atendidas a "Procesadas" con su marca
     (`✅ procesado <fecha> → PR #xxx` o `→ sin acción: <motivo>`).
   - Añade TU PROPIA entrada de auto-informe en la bitácora (el entrenador también es un
     agente programado y se evalúa igual — pero recuerda el guardarraíl 1: sus mejoras las
     propone en PR, nunca se las auto-aplica).
   - Anota la pasada en `docs/CONTEXTO-SESIONES.md` (entrada nueva arriba).

## Reglas

- **Evidencia o silencio:** cada cambio propuesto cita su evidencia concreta (entrada de
  bitácora, feedback, PR, fila de BD). Sin evidencia trazable, no se propone.
- **Prompts en CÓDIGO, no solo en skills:** algunos agentes no guardan su prompt en un `.md`
  sino en código. El más notable es **`agente-huésped` (SIVRA)**: su system prompt vive en
  `apps/plataforma/lib/sivra/agente-huesped/decidir.ts` (y reglas en `reglas.ts`/
  `sensibilidad.ts`/`graduacion.ts`). Para estos, el carril 2 abre el **PR draft tocando ESE
  archivo** (mismo criterio: diff acotado y aditivo, cadena evidencia→diagnóstico→cambio en el
  cuerpo); no busques una skill que reescribir. Su señal principal está en `FEEDBACK-AGENTES.md`
  y en commits/PRs que corrigen sus borradores.
- **Idempotente:** re-ejecutar la misma semana no duplica PRs ni avisos (revisa si ya
  existe un PR `claude/entrenador-*` abierto para esa skill antes de crear otro).
- **No inventes métricas:** sin datos suficientes para juzgar un agente, dilo ("sin
  evidencia esta semana") en vez de rellenar con impresiones.
- Multi-tenant BD: cualquier query con scope (`cuenta_id`/`empresa_id`) lo respeta;
  solo lectura SIEMPRE.
