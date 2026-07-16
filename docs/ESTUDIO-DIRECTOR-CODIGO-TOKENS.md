# Estudio: optimización de tokens del Agente Director — Claude planifica / IA barata ejecuta

> **Estado:** estudio (no implementación). Fecha: 2026-07-16. Autor: sesión Claude Code.
> **Decisión de acceso a Claude:** vía **OpenRouter** (reusar infra; sin API directa de Anthropic).
> Fuentes de verdad citadas: `packages/core-ai/src/client.ts`, `apps/plataforma/lib/ia-director.ts`,
> `apps/plataforma/lib/ia-director-codigo.ts`, `apps/plataforma/lib/pasarela.ts`,
> `apps/plataforma/app/api/ai/codigo/route.ts`, `apps/plataforma/app/api/cron/ia-director-refresh/route.ts`,
> `apps/plataforma/CLAUDE.md`.

## 0. Objetivo (lo que pidió Alberto)

Que el desarrollo de código consuma tokens caros de Claude **solo para PENSAR/ORGANIZAR** (planificar con el
Claude más alto — la 5/Opus), y que la **ejecución mecánica de la programación** la haga una IA **gratuita o de
bajo coste**. Alberto también menciona el agente que "actualiza las guías" (el catálogo de modelos, que cambia
continuamente) y la conexión con OpenRouter, ambos ya existentes.

Este documento fotografía lo que YA existe, señala el hueco real frente a esa visión, y especifica el desarrollo
recomendado por fases con la config exacta y una estimación de ahorro.

---

## 1. Lo que YA existe (más de lo que parece)

La arquitectura "caro planifica / barato ejecuta" está **parcialmente montada y en producción**.

### 1.1 Cadena de fallback gratis — `packages/core-ai/src/client.ts`
`aiComplete()` encadena **OpenRouter (si hay key y sin modelo pinneado) → NIM → Groq → Gemini → Kimi**.
Adaptadores puros por proveedor (`nim.ts`, `groq.ts`, `gemini.ts`, `moonshot.ts`, `openrouter.ts`), sin SDKs
(fetch nativo a endpoints OpenAI-compatible), sin dependencias npm. `openrouter.ts` soporta fallback nativo
entre modelos (body `models`), `response_format` (json_schema), tools y prompt caching.

### 1.2 Agente Director (de MODELOS) — `apps/plataforma/lib/ia-director.ts`
Un **router**: por cada petición, un modelo **barato** (`DIRECTOR_MODEL`, default `deepseek/deepseek-chat`)
lee la petición y elige el slug ideal del catálogo con **salida estructurada (json_schema + enum)** → no puede
inventar modelo. En producción (`DIRECTOR_MODO=activo`) desde 10/07/2026. Tiene circuit-breaker, memoización de
decisiones, degradación por presupuesto y preferencia UE (RGPD). **Nunca lanza:** degrada a modelo por defecto.

### 1.3 Director de CÓDIGO — `apps/plataforma/lib/ia-director-codigo.ts` + `POST /api/ai/codigo`
`acotarArchivos(tarea)`: saca keywords, consulta la tabla `mapa_arquitectura` (índice de firmas de TODO el
repo, `word_similarity` pg_trgm) y devuelve **los archivos candidatos + el modelo elegido, a coste ~0 tokens**.
**NO edita ni ejecuta.** Su comentario de cabecera lo dice literal: *"El orquestador entrega esos archivos
COMPLETOS al agente programador y aplica el diff que devuelva."* → **el orquestador ejecutor no está en el repo.**

### 1.4 El "agente que actualiza las guías" — cron `ia-director-refresh` (lunes 05:00)
`apps/plataforma/app/api/cron/ia-director-refresh/route.ts`: lee el catálogo público de OpenRouter, penaliza
modelos con mala racha real (aprendizaje sobre `ai_usos`), y **elige de forma determinista por categoría** desde
la lista `PREFERIDOS`, versionando el prompt/catálogo del Director en la tabla `ia_director_prompt`. Categorías
actuales: `logica`, **`codigo`** (`qwen/qwen-2.5-coder-32b-instruct` → `deepseek/deepseek-chat` →
`anthropic/claude-sonnet-4.5`), `redaccion`, `contexto`, `general`. La skill `buscador-ia` vigila deprecaciones.

### 1.5 Presupuesto y telemetría
Presupuesto **diario** en € (`AI_GATEWAY_LIMITE_DIARIO_EUR`, default 1€) que **bloquea solo el camino de pago**
(la cadena gratis sigue). Degradación gradual al 80% (`DIRECTOR_PRESUPUESTO_UMBRAL`). Todo uso se registra en
`ai_usos` (tokens + coste €), con panel `/operador/ia` y refacturación por cliente.

### 1.6 Claude — cableado SOLO como slug de OpenRouter
No existe cliente Anthropic; el `@anthropic-ai/sdk` es dependencia muerta en `apps/plataforma/package.json`.
Claude se alcanza como slug `anthropic/claude-...` vía OpenRouter. **Coincide con la decisión de Alberto.**

---

## 2. El hueco real frente a la visión de Alberto

| Visión de Alberto | Estado hoy |
|---|---|
| Claude alto (5/Opus) **planifica** | ❌ No hay fase de PLAN explícita con Claude. Hoy es **un solo modelo por tarea**; el "decisor" es barato (deepseek) y elige el modelo, pero no hay un planificador que produzca un plan paso-a-paso. |
| IA barata/gratis **ejecuta la programación** | ⚠️ Parcial: el catálogo `codigo` tiene coders baratos, pero **no existe el orquestador que agarre el plan + los archivos y haga que un modelo barato escriba el diff**. El `/api/ai/codigo` solo **acota** (qué archivos + qué modelo); el ejecutor **no está en el repo**. |
| Usar **lo más alto de Claude** para pensar | ❌ Opus/5 está **capado** por `DIRECTOR_MAX_PRECIO_OUT` (default 20 USD/M) — el propio comentario del cron dice que para habilitar Opus hay que subir ese techo. |
| **Automatizar** el ciclo | ⚠️ Falta el pegamento plan→ejecuta→verifica→aplica. |

**Conclusión:** el ~70% de la fontanería está (acotado a 0 tokens, router, presupuesto, telemetría, catálogo
auto-actualizado). Falta el **modelo de 3 roles** y el **ejecutor**.

---

## 3. Propuesta: modelo de 3 roles

Mapea exactamente las palabras de Alberto ("Claude organiza, otra línea ejecuta"):

1. **DECISOR** (¿qué modelo uso?) — **barato**, se queda igual (`deepseek/deepseek-chat`, salida estructurada).
2. **PLANIFICADOR** (¿qué hay que hacer, en qué archivos, con qué instrucción por archivo?) — **Claude alto vía
   OpenRouter** (`anthropic/claude-*` más capaz disponible). Consume tokens SOLO para organizar. Salida = plan
   estructurado JSON: `[{ruta, instruccion_precisa, criterio_aceptacion}]`.
3. **EJECUTOR** (escribe el código de cada archivo) — **gratis/barato** (`qwen-2.5-coder-32b`, `deepseek-chat`),
   recibe SOLO ese archivo + su instrucción del plan → devuelve el archivo editado / diff.

El **acotado a 0 tokens** (`mapa_arquitectura`) sigue delante para no leer el repo entero: acota → el
planificador ve solo esos archivos → ejecuta archivo a archivo.

```
tarea ──▶ [DECISOR barato]  elige modelo (igual que hoy)
      │
      └──▶ /api/ai/codigo (acota a ~0 tokens: qué archivos)
                 │
                 ▼
           [PLANIFICADOR = Claude alto vía OpenRouter]  → plan JSON por archivo
                 │
                 ▼
           por cada archivo: [EJECUTOR barato/gratis]  → diff
                 │
                 ▼
           revisar + verificar (tsc/tests) + aplicar
```

---

## 4. Desarrollo recomendado (2 fases)

### Fase 1 (recomendada primero) — Ayudante en las sesiones de Claude Code + endpoint EJECUTOR barato
**Por qué primero:** ataca el dolor real (los tokens de Claude de Alberto en SUS sesiones de desarrollo),
reusa toda la infra, es bajo riesgo (Claude sigue revisando/verificando, nada autónomo se sube a ciegas), y es
un build pequeño. En este modo, el **PLANIFICADOR es la propia sesión** (el Claude más alto que Alberto ya paga)
y el trabajo mecánico se delega a un modelo barato.

Piezas a construir:
- **Endpoint ejecutor** `POST /api/ai/ejecutar` (nuevo), auth `AI_GATEWAY_SECRET`, presupuesto + `ai_usos`
  (`endpoint='ejecutar'`). Body: `{ ruta, contenido, instruccion, criterio? }` → llama a `chatConDirector`
  (reusa `apps/plataforma/lib/pasarela.ts`) con la **categoría `codigo`** (coder barato) y `response_format`
  para devolver el archivo/diff. Reutiliza el presupuesto diario, la caché semántica y la telemetría existentes.
- **Skill de sesión** `.claude/skills/delegar-codigo` (gemela de `code-map`): documenta el protocolo para que,
  en una tarea mecánica/repetitiva, la sesión Claude (a) acote con `/api/ai/codigo`, (b) escriba el plan por
  archivo, (c) delegue cada archivo al ejecutor barato, (d) **revise + verifique + integre** (tests/tsc). Claude
  no genera los diffs grandes (los hace el barato); solo planifica y valida → ahí está el ahorro.
- **Regla de oro en la skill:** delegar SOLO lo mecánico/voluminoso (renames masivos, aplicar un patrón a N
  archivos, boilerplate). La lógica sutil se queda en Claude — el round-trip + revisión no compensa si no.

### Fase 2 (opcional, después) — Orquestador autónomo en servidor
Un cron/endpoint que haga las 2 fases de verdad sin humano: acota → **planifica con Claude vía OpenRouter** →
ejecuta cada archivo con el coder barato → verifica → **abre PR draft + avisa Telegram** (nunca merge directo;
misma disciplina que el resto de agentes del repo). Se aborda solo cuando la Fase 1 haya **medido** que el split
ahorra de verdad y que la calidad del ejecutor barato es aceptable. Riesgo/coste altos (calidad de código
autónomo, no puede correr build/tests dentro de una función Vercel fácilmente) → por eso va después.

### Config común (habilitar Claude alto como planificador vía OpenRouter)
- Añadir categoría **`plan`** a `PREFERIDOS` en `ia-director-refresh/route.ts` con el `anthropic/claude-*` más
  alto disponible (verificar el slug vivo en el catálogo de OpenRouter en el momento de construir; hoy el tope
  cableado es `claude-sonnet-4.5`).
- **Subir `DIRECTOR_MAX_PRECIO_OUT`** lo justo para que el planificador premium (Opus/5) no quede capado — SOLO
  para la categoría `plan`; el resto sigue con su techo. Gobernado por el presupuesto diario existente.
- El cron semanal ya mantiene el catálogo fresco → las nuevas categorías `plan`/`codigo` se auto-actualizan sin
  trabajo extra (esto es el "agente que actualiza las guías" que menciona Alberto, ya existente).

---

## 5. Archivos que se tocarían (cuando se implemente; NO en este estudio)
- `apps/plataforma/app/api/cron/ia-director-refresh/route.ts` — nueva categoría `plan` + slug Claude alto.
- `apps/plataforma/CLAUDE.md` — documentar `plan`, el nuevo techo de precio y el endpoint ejecutor.
- `apps/plataforma/app/api/ai/ejecutar/route.ts` (nuevo) — puerto del ejecutor barato.
- `apps/plataforma/lib/pasarela.ts` — reutilizado (`chatConDirector`), quizá helper `ejecutarArchivo()`.
- `.claude/skills/delegar-codigo/SKILL.md` (nuevo) — protocolo de delegación en sesión.
- `docs/DIRECTOR-CODIGO.md` — ampliar con las fases PLAN/EJECUTA.
- Reutiliza sin cambios: `lib/ia-director-codigo.ts`, `lib/ia-director.ts`, `mapa_arquitectura`, `ai_usos`.

## 6. Estimación de ahorro (medible con lo que ya hay)
- El acotado ya mide `tokensIndice` (cientos de tokens) frente a leer el repo (decenas de miles).
- El split plan/ejecuta ahorra donde hoy Claude generaría el diff completo: el **planificador** emite un plan
  corto (poca salida cara); el **ejecutor** barato/gratis emite el código voluminoso (coste ~0). `ai_usos`
  (columnas `tokens`/`coste_eur`, panel `/operador/ia`) permite comparar coste por tarea antes/después.
- Riesgo a vigilar: si el ejecutor barato produce diffs malos, el coste de revisión de Claude se come el ahorro.
  Por eso Fase 1 delega SOLO lo mecánico y mide antes de automatizar (Fase 2).

## 7. Qué NO contempla este estudio
- No se reactiva la API directa de Anthropic (decisión: todo por OpenRouter).
- No se implementa código en este paso (es un estudio).
- No se toca la cadena gratis ni el presupuesto existentes.

## 8. Estado de implementación

**✅ Fase 1 IMPLEMENTADA (16/07/2026, esta misma rama).** Piezas entregadas:
- `lib/ia-director.ts::elegirPorCategoria(categoria)` — elección determinista por tag del catálogo, sin hop.
- `lib/pasarela.ts::chatConDirector` — nueva opción `categoria?` (aditiva; callers actuales sin cambios).
- `app/api/ai/ejecutar/route.ts` — endpoint ejecutor barato (`categoria:'codigo'`, `endpoint='ejecutar'`).
- `app/api/cron/ia-director-refresh/route.ts` — categoría `plan` (Claude alto) + techo `DIRECTOR_PLAN_PRECIO_OUT`.
- `.claude/skills/delegar-codigo/SKILL.md` — protocolo de delegación en sesión.
- Docs: este estudio, `docs/DIRECTOR-CODIGO.md`, `apps/plataforma/CLAUDE.md`.

**Pendiente de activación (no bloqueante):** la categoría `plan` solo entra en el catálogo tras la próxima
corrida del cron `ia-director-refresh` (o disparo manual). El ejecutor (`codigo`) ya funciona hoy.

**Fase 2 (futura):** orquestador autónomo servidor (plan→ejecuta→verifica→PR draft + Telegram), solo tras
medir en `ai_usos` que el split ahorra de verdad.
