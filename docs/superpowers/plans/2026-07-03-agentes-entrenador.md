# agentes-entrenador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el agente semanal `agentes-entrenador` que mejora los prompts de los agentes programados por rendimiento y calidad transversal, con su bitácora de auto-informes, canal de feedback de Alberto y guardarraíles anti-loop.

**Architecture:** Todo es Markdown (skills, comandos, docs) — no hay código ejecutable ni tests unitarios; la verificación es consistencia entre archivos (grep). El entrenador entrega por dos carriles (PR draft por defecto; auto-aplicar solo trivial factual) siguiendo el patrón de `/auditoria-diaria`. Spec: `docs/superpowers/specs/2026-07-03-agentes-entrenador-design.md`.

**Tech Stack:** Claude Code skills/commands (Markdown + frontmatter YAML), rutina programada de claude.ai/code, MCP GitHub/Supabase.

**Rama:** `claude/agent-self-update-loop-iyq5ge` (PR #716 ya abierto con el spec; los commits de este plan van a la misma rama/PR).

---

### Task 1: Crear `docs/AGENTES-BITACORA.md`

**Files:**
- Create: `docs/AGENTES-BITACORA.md`

- [ ] **Step 1: Escribir el archivo completo**

```markdown
# Bitácora de auto-informes de agentes — `central`

> **Para qué.** Cada agente programado (skill de `docs/SKILLS.md` § "Agentes programados")
> deja aquí UNA entrada por ejecución: qué hizo, qué dudó, qué falló. Es la materia prima
> del `agentes-entrenador` (rutina semanal) para mejorar los prompts por RENDIMIENTO real,
> no por intuición. El contenedor es efímero: si no queda escrito aquí, no existió.
>
> **Cómo se mantiene.** Los agentes SOLO añaden entradas arriba del todo (3-5 líneas máx.,
> en el mismo commit/PR de su pasada, o en un commit propio a `main` si su pasada no tocó
> el repo). El `agentes-entrenador` PODA las entradas ya procesadas en su pasada semanal
> (git guarda el histórico; este archivo no engorda). Nadie más borra aquí.
>
> **Formato por entrada (una línea de lista, multilinea si hace falta):**
> `- **YYYY-MM-DD · <skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: #xxx / SHA / —`
> Sin dudas ni fallos → escribir `dudas: —; fallos: —` (el "todo bien" también es señal).

## Entradas pendientes de procesar (lo más reciente arriba)

<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

<!-- El agentes-entrenador anota aquí la fecha de su última pasada y cuántas entradas
procesó/podó. Ejemplo: 2026-07-06 · procesadas 9 entradas (rango 29/06–05/07). -->
```

- [ ] **Step 2: Commit**

```bash
git add docs/AGENTES-BITACORA.md
git commit -m "feat(entrenador): bitácora de auto-informes de agentes"
```

---

### Task 2: Crear `docs/FEEDBACK-AGENTES.md`

**Files:**
- Create: `docs/FEEDBACK-AGENTES.md`

- [ ] **Step 1: Escribir el archivo completo**

```markdown
# Feedback de Alberto sobre los agentes — `central`

> **Para qué.** Canal de máxima calidad para el `agentes-entrenador`: cuando un agente
> programado la líe o haga algo mejorable, Alberto apunta UNA línea aquí (desde cualquier
> sesión: "apunta en el feedback de agentes que X"). El entrenador las consume en su pasada
> semanal, propone el arreglo del prompt (PR draft) y las marca como procesadas.
>
> **Formato:** `- [ ] **YYYY-MM-DD · <skill>** · qué pasó / qué esperabas`
> El entrenador marca así: `- [x] … → ✅ procesado YYYY-MM-DD → PR #xxx` (o `→ sin acción:
> <motivo>`). Las procesadas de más de ~2 meses se pueden podar (git guarda el histórico).

## Pendientes

<!-- Alberto (o una sesión en su nombre) inserta aquí. Ejemplo:
- [ ] **2026-07-04 · facturas-correo** · clasificó como "personal" 3 recibos de Endesa del
  local de Socorro que son deducibles — esperaba que los cruzara con perfil-fiscal
-->

## Procesadas
```

- [ ] **Step 2: Commit**

```bash
git add docs/FEEDBACK-AGENTES.md
git commit -m "feat(entrenador): canal de feedback explícito de Alberto sobre agentes"
```

---

### Task 3: Crear la skill `agentes-entrenador`

**Files:**
- Create: `.claude/skills/agentes-entrenador/SKILL.md`

- [ ] **Step 1: Escribir la skill completa**

````markdown
---
name: agentes-entrenador
description: Agente PROGRAMADO semanal que mejora los prompts de los agentes del monorepo por RENDIMIENTO (qué hicieron de verdad, qué falló, qué corrigió Alberto) y por CALIDAD transversal (contradicciones/redundancias entre skills). NO vigila frescura factual (eso es de /auditoria-diaria). Lee docs/AGENTES-BITACORA.md, docs/FEEDBACK-AGENTES.md, git/PRs de la semana y BD (solo lectura). Entrega: cambios de comportamiento SIEMPRE por PR draft + aviso Telegram; solo lo factual trivial directo a main. Úsala cuando Alberto pida "revisa/mejora los prompts de los agentes" o cuando la dispare su trigger semanal (domingo). Sin secretos: solo nombres de variable.
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
> `CRON_SECRET` (mismo patrón que psd2-health-check; si faltan, el aviso se omite y el
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
- **Idempotente:** re-ejecutar la misma semana no duplica PRs ni avisos (revisa si ya
  existe un PR `claude/entrenador-*` abierto para esa skill antes de crear otro).
- **No inventes métricas:** sin datos suficientes para juzgar un agente, dilo ("sin
  evidencia esta semana") en vez de rellenar con impresiones.
- Multi-tenant BD: cualquier query con scope (`cuenta_id`/`empresa_id`) lo respeta;
  solo lectura SIEMPRE.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/agentes-entrenador/SKILL.md
git commit -m "feat(entrenador): skill agentes-entrenador — mejora semanal de prompts por rendimiento"
```

---

### Task 4: Crear el comando `/agentes-entrenador`

**Files:**
- Create: `.claude/commands/agentes-entrenador.md`

- [ ] **Step 1: Escribir el comando** (patrón de `.claude/commands/facturas-correo.md`: frontmatter + delegación a la skill)

```markdown
---
description: Pasada semanal del agentes-entrenador — mejora los prompts de los agentes programados por rendimiento (bitácora + feedback + PRs + BD) y calidad transversal. Cambios de comportamiento SIEMPRE por PR draft + Telegram; solo lo trivial factual directo a main.
---

Ejecuta la skill `agentes-entrenador` (`.claude/skills/agentes-entrenador/SKILL.md`)
siguiendo sus pasos y guardarraíles al pie de la letra. Recordatorios clave:
- Cambios de COMPORTAMIENTO de un prompt → PR draft (uno por skill) + un solo Telegram.
- A la propia skill del entrenador, NUNCA por el carril automático.
- Sin evidencia nueva en el rango → pasada silenciosa (poda + anotación, sin ruido).
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/agentes-entrenador.md
git commit -m "feat(entrenador): comando /agentes-entrenador"
```

---

### Task 5: Añadir el paso de auto-informe a las 7 skills programadas

**Files:**
- Modify: `.claude/skills/facturas-correo/SKILL.md` (añadir sección al FINAL del archivo)
- Modify: `.claude/skills/pricing-agente/SKILL.md` (ídem)
- Modify: `.claude/skills/fiscal-novedades/SKILL.md` (ídem)
- Modify: `.claude/skills/psd2-health-check/SKILL.md` (ídem)
- Modify: `.claude/skills/ialimp-client-health/SKILL.md` (ídem)
- Modify: `.claude/skills/rrhh-compliance-calendar/SKILL.md` (ídem)
- Modify: `.claude/skills/github-vigia/SKILL.md` (ídem)

- [ ] **Step 1: Añadir a CADA uno de los 7 archivos, al final, este bloque exacto** (idéntico en los 7 — el nombre de skill lo pone el agente al escribir su entrada, no hace falta personalizar el bloque):

```markdown

## Auto-informe (obligatorio al terminar la pasada)

Antes de cerrar, añade UNA entrada arriba del todo de la sección "Entradas pendientes de
procesar" de `docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · <nombre-de-esta-skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

- Sin dudas ni fallos → `dudas: —; fallos: —` (el "todo bien" también es señal).
- Commitea la entrada con el resto de tu trabajo (o en un commit propio a `main` si la
  pasada no tocó el repo). La consume el `agentes-entrenador` (semanal) para mejorar este
  prompt; si no queda escrita, esta pasada no existió para él.
```

- [ ] **Step 2: Verificar que los 7 archivos tienen la sección**

Run: `grep -l "## Auto-informe (obligatorio al terminar la pasada)" .claude/skills/*/SKILL.md | wc -l`
Expected: `7` (y `grep -L` sobre los 7 paths no devuelve ninguno)

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/facturas-correo/SKILL.md .claude/skills/pricing-agente/SKILL.md .claude/skills/fiscal-novedades/SKILL.md .claude/skills/psd2-health-check/SKILL.md .claude/skills/ialimp-client-health/SKILL.md .claude/skills/rrhh-compliance-calendar/SKILL.md .claude/skills/github-vigia/SKILL.md
git commit -m "feat(entrenador): paso de auto-informe en las 7 skills programadas"
```

---

### Task 6: Registrar en `docs/SKILLS.md`

**Files:**
- Modify: `docs/SKILLS.md` (tabla "Agentes programados", tras la fila de `github-vigia`, línea 34)

- [ ] **Step 1: Añadir la fila** justo después de la fila de `github-vigia`:

```markdown
| **`agentes-entrenador`** | El "agente de agentes": mejora los prompts de los agentes programados por RENDIMIENTO (bitácora `docs/AGENTES-BITACORA.md` + feedback `docs/FEEDBACK-AGENTES.md` + PRs + BD) y por calidad transversal entre skills. NO toca frescura factual (eso es de `/auditoria-diaria`). Cambios de comportamiento SIEMPRE por PR draft + Telegram; nunca se auto-modifica. Rutina semanal (domingo ~07:30 CEST) o a mano (`/agentes-entrenador`). |
```

- [ ] **Step 2: Commit**

```bash
git add docs/SKILLS.md
git commit -m "docs(skills): registrar agentes-entrenador en el índice"
```

---

### Task 7: Registrar en `docs/FUENTES-DE-VERDAD.md`

**Files:**
- Modify: `docs/FUENTES-DE-VERDAD.md` (tabla "Mapa", al final)

- [ ] **Step 1: Añadir estas 3 filas** al final de la tabla:

```markdown
| skill `agentes-entrenador` | `.claude/skills/**` (todas — es su objeto de trabajo), `docs/AGENTES-BITACORA.md`, `docs/FEEDBACK-AGENTES.md` |
| `docs/AGENTES-BITACORA.md` | `.claude/skills/{facturas-correo,pricing-agente,fiscal-novedades,psd2-health-check,ialimp-client-health,rrhh-compliance-calendar,github-vigia}/SKILL.md` (sección "Auto-informe") |
| `docs/FEEDBACK-AGENTES.md` | `.claude/skills/agentes-entrenador/SKILL.md` (formato de procesado) |
```

- [ ] **Step 2: Commit**

```bash
git add docs/FUENTES-DE-VERDAD.md
git commit -m "docs(fuentes-de-verdad): mapear agentes-entrenador y sus docs"
```

---

### Task 8: Registrar la rutina en `docs/RUTINAS-PROGRAMADAS.md`

**Files:**
- Modify: `docs/RUTINAS-PROGRAMADAS.md` (nueva sección 10 tras la rutina 9, línea ~103; fila en "Resumen de cadencias"; punto nuevo en "Pendientes manuales de Alberto")

- [ ] **Step 1: Añadir la sección de la rutina 10** después de la rutina 9 (github-vigia) y antes del separador `---` del resumen de cadencias:

```markdown
### 10. Agentes-entrenador (mejora de prompts) — *pendiente de trigger*
| | |
|---|---|
| **Cuándo** | Semanal, **domingo ~07:30 CEST** (tras la auditoría profunda de las 04:00; los agentes de la semana ya corrieron) |
| **Prompt** | `Ejecuta la skill agentes-entrenador` + al final `PLATAFORMA_URL`/`CRON_SECRET` (mismo workaround que las rutinas 6, 7 y 9) |
| **MCPs / envs** | Supabase (solo lectura). **GitHub nativo** (leer PRs de la semana + abrir los PR draft). `PLATAFORMA_URL` + `CRON_SECRET` para el aviso Telegram (si faltan, se omite). |
| **Qué hace** | Mejora los prompts de los agentes programados por RENDIMIENTO: lee `docs/AGENTES-BITACORA.md` (auto-informes), `docs/FEEDBACK-AGENTES.md` (feedback de Alberto), PRs/commits de la semana y BD (`pricing_aprendizaje`, `fiscal_novedades`); diagnostica por agente y revisa calidad transversal entre skills. La frescura factual es de `/auditoria-diaria` — no se pisan. |
| **Resultado** | Cambios de **comportamiento** → **PR draft por skill** (`claude/entrenador-<skill>-<fecha>`, con evidencia→diagnóstico→cambio en el cuerpo) + **UN Telegram** con los links. Solo lo factual trivial (máx. 5) directo a `main` con línea en `docs/AUTO-APLICADOS.md`. **Nunca se auto-modifica** (a su propia skill, siempre PR). Sin evidencia → pasada silenciosa (solo poda de bitácora). |
```

- [ ] **Step 2: Añadir la fila en "Resumen de cadencias"** tras `| Domingo 04:00 | Auditoría semanal profunda |`:

```markdown
| Domingo 07:30 | Agentes-entrenador (mejora de prompts) |
```

- [ ] **Step 3: Añadir el pendiente manual** como punto 6 de "Pendientes manuales de Alberto":

```markdown
6. **Crear el trigger de la rutina 10 (agentes-entrenador)** — SOLO tras validar una
   primera pasada a mano (`/agentes-entrenador` en una sesión con GitHub + Supabase):
   semanal domingo ~07:30, prompt `Ejecuta la skill agentes-entrenador` + al final
   `PLATAFORMA_URL`/`CRON_SECRET` (workaround de las rutinas 6/7/9). Al crearlo, cambiar
   su estado a *activa* en este doc.
```

- [ ] **Step 4: Commit**

```bash
git add docs/RUTINAS-PROGRAMADAS.md
git commit -m "docs(rutinas): rutina 10 agentes-entrenador (domingo 07:30, pendiente de trigger)"
```

---

### Task 9: Mención en `CLAUDE.md` raíz

**Files:**
- Modify: `CLAUDE.md` (bloque "Memoria entre sesiones (entorno efímero)", tras el bullet de "Auditoría programada")

- [ ] **Step 1: Añadir este bullet** después del bullet "**Auditoría programada** (`/auditoria-diaria`): …" y antes del bullet "**Límite conocido:** …":

```markdown
- **Entrenador de agentes** (`/agentes-entrenador`, semanal): mejora los prompts de los
  agentes programados por **rendimiento** (auto-informes en `docs/AGENTES-BITACORA.md`,
  feedback de Alberto en `docs/FEEDBACK-AGENTES.md`, PRs de la semana, BD) y calidad
  transversal. Cambios de comportamiento SIEMPRE por PR draft + Telegram; **nunca se
  auto-modifica**. La frescura factual sigue siendo de la auditoría.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): mención del entrenador de agentes en memoria entre sesiones"
```

---

### Task 10: Verificación de consistencia + push

**Files:** ninguno nuevo (solo checks y push)

- [ ] **Step 1: Verificar consistencia cruzada**

Run:
```bash
ls .claude/skills/agentes-entrenador/SKILL.md .claude/commands/agentes-entrenador.md docs/AGENTES-BITACORA.md docs/FEEDBACK-AGENTES.md
grep -c "agentes-entrenador" docs/SKILLS.md docs/FUENTES-DE-VERDAD.md docs/RUTINAS-PROGRAMADAS.md CLAUDE.md
grep -l "## Auto-informe (obligatorio al terminar la pasada)" .claude/skills/*/SKILL.md | wc -l
```
Expected: los 4 archivos existen; cada doc tiene ≥1 mención; el último comando da `7`.

- [ ] **Step 2: Verificar que no se rompió el guardián de tests** (los docs no lo tocan, pero es el gate del repo)

Run: `pnpm test:guardia` (desde la raíz; si el script no existe en la raíz, saltar — es de apps)
Expected: PASS o script inexistente en raíz (los cambios son solo Markdown).

- [ ] **Step 3: Anotar la sesión en la memoria** — añadir entrada nueva ARRIBA en `docs/CONTEXTO-SESIONES.md` siguiendo el formato de las entradas existentes: fecha 2026-07-03, resumen "agentes-entrenador implementado (spec + skill + bitácora + feedback + rutina 10, PR #716); pendiente: merge del PR, primera pasada a mano y crear trigger dominical".

- [ ] **Step 4: Commit final + push**

```bash
git add docs/CONTEXTO-SESIONES.md
git commit -m "docs(memoria): sesión agentes-entrenador — implementación completa en PR #716"
git push -u origin claude/agent-self-update-loop-iyq5ge
```

- [ ] **Step 5: Actualizar el PR #716** — editar título/cuerpo (deja de ser "solo spec"): título `feat(entrenador): agentes-entrenador — agente que mejora los prompts de los agentes (spec + implementación)` y añadir al cuerpo la lista de piezas implementadas y los 2 pasos post-merge (primera pasada a mano, luego trigger).

---

## Post-merge (manual, NO parte de este plan)

1. Alberto mergea el PR #716.
2. Primera pasada a mano: `/agentes-entrenador` en una sesión con GitHub + Supabase → validar PRs bien formados, Telegram, poda.
3. Crear el trigger dominical (pendiente 6 de `RUTINAS-PROGRAMADAS.md`) y marcar la rutina 10 como *activa*.
