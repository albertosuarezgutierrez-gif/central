# 🧠 Vigía de LLMs — estado entre ejecuciones

> Estado vivo del agente `buscador-ia` (skill `.claude/skills/buscador-ia`). Cada pasada semanal
> actualiza este doc: modelos cableados (vivos/deprecados), catálogos comprobados, candidatos
> gratis en seguimiento y bitácora de hallazgos. **Fuente de verdad de qué está cableado:**
> `packages/core-ai/src/client.ts` — este doc lo refleja, no lo sustituye.

## Modelos cableados en la cadena `aiComplete` (OpenRouter → NIM → Groq → Gemini → Kimi)

> **09/07/2026 — OpenRouter cableado como PRIMARIO** (si hay `OPENROUTER_API_KEY`): agregador con
> Agente Director en la pasarela de plataforma + fallback nativo entre modelos. Su catálogo lo
> refresca solo el cron automático `/api/cron/ia-director-refresh` (semanal, tabla
> `ia_director_prompt`) — FUERA del scope de este agente. La cadena directa de abajo sigue siendo
> la red de seguridad cuando OpenRouter entero falla, y sigue siendo lo que este agente vigila.

| Eslabón | id por defecto | Env (key / override) | Coste | Estado (comprobado 2026-07-13) |
|---|---|---|---|---|
| OpenRouter (primario pasarela — lo vigila SU cron, no este agente) | `deepseek/deepseek-chat` | `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | según modelo (tope 1€/día) | fuera de scope (cron `ia-director-refresh`) |
| NVIDIA NIM (primario cadena directa) | `meta/llama-3.3-70b-instruct` | `NVIDIA_API_KEY` | gratis | ✅ **VIVO (13/07/2026)** — presente en [build.nvidia.com](https://build.nvidia.com/meta/llama-3_3-70b-instruct), NGC y [docs.api.nvidia.com](https://docs.api.nvidia.com/nim/reference/meta-llama-3_3-70b-instruct); sin señal de retirada |
| Groq (fallback 1) | `openai/gpt-oss-120b` | `GROQ_API_KEY` / `GROQ_BRAIN_MODEL` | gratis (rate-limited) | ✅ **VIVO (13/07/2026)** — NO está en [deprecations](https://console.groq.com/docs/deprecations); es el **reemplazo recomendado** por Groq (los deprecados 17/06 fueron `llama-3.3-70b-versatile`/`llama-3.1-8b-instant`/`qwen3-32b`/`llama-4-scout`, ninguno cableado) |
| Gemini (fallback 2 + grounding) | `gemini-flash-latest` | `GEMINI_API_KEY` / `GEMINI_BRAIN_MODEL` | gratis | ✅ **VIVO (13/07/2026)** — alias rodante ahora resuelve a **Gemini 3.5 Flash** (GA, lanzado 19/05/2026, sin fecha de EOL). El alias absorbió sin romper la retirada de `gemini-2.5-flash` (cutover 16/10). Fuente: [deprecations](https://ai.google.dev/gemini-api/docs/deprecations) · [models](https://ai.google.dev/gemini-api/docs/models) |
| Kimi/Moonshot (fallback 3) | `kimi-k2.6` | `MOONSHOT_API_KEY` / `MOONSHOT_MODEL` | de pago | ✅ **VIVO (13/07/2026)** — el "discontinuado 25/05" era la serie k2 vieja (`kimi-k2-0711-preview`), NO k2.6 (lanzado 20/04/2026, soportado; también en [build.nvidia.com](https://build.nvidia.com/moonshotai/kimi-k2.6)). ⚠️ Existe sucesor `kimi-k2.7-code` (~12/06, orientado a *coding*) — no encaja mejor para redacción/clasificación de huésped; sin swap |

**Consumidores con modelo propio:**
- `AGENTE_HUESPED_MODEL` — **vacío por defecto** (usa el 70B de la cadena). *(Antes `meta/llama-3.1-405b-instruct`, RETIRADO de NIM → causó "IA no disponible"; ver abajo.)*
- `CONTABLE_MODEL` — default `deepseek-ai/deepseek-v3` (NIM). ✅ **VIVO (13/07/2026)** — sigue en [build.nvidia.com/deepseek-ai](https://build.nvidia.com/deepseek-ai) (conviven V3.2/V4).

## Catálogos a comprobar cada pasada
- NVIDIA NIM — https://build.nvidia.com/models
- Groq — https://console.groq.com/docs/models (mirar *deprecated/decommissioned*)
- Google Gemini — https://ai.google.dev/gemini-api/docs/models (retiradas + free tier)
- Moonshot/Kimi — https://platform.moonshot.ai/docs

## Candidatos gratis en seguimiento

> Mini-eval (Paso 3) de esta pasada: **sin eval en vivo** — la sesión del cron corrió **sin ninguna
> API key** (ni `NVIDIA_API_KEY`/`GROQ_API_KEY`/… ni `CRON_SECRET`), así que solo se puntúa con datos
> publicados (model cards/benchmarks con URL). No se inventan resultados.

- **Cerebras** — `gpt-oss-120b` (y `zai-glm-4.7`) · **gratis** ~1M tokens/día, sin tarjeta · infra
  propia (wafer-scale, independiente de NIM/Groq/Gemini). **Encaje:** sería un **4º proveedor gratis
  independiente** para la cadena directa — justo lo que habría amortiguado el apagón simultáneo del
  06/07. Bonus: sirve **el MISMO `gpt-oss-120b`** que ya usamos en Groq → drop-in de modelo, distinta
  infra. **Caveat:** un reporte de 31/05/2026 vio su lista de modelos caer a solo 2 entradas (fiabilidad
  a vigilar). *Mini-eval: sin key en sesión → solo datos publicados.* Fuente:
  [free-llm-api-resources](https://github.com/cheahjs/free-llm-api-resources) ·
  [ianlpaterson.com/blog/free-llm-api-2026](https://ianlpaterson.com/blog/free-llm-api-2026/).
  **Decisión:** TRACK, no PR — nada roto en la cadena y sin eval en vivo; el plumbing (gateado por
  `CEREBRAS_API_KEY`, inactivo sin key) queda a OK de Alberto.
- **Mistral (free tier)** — todos los modelos, 1B tokens/mes · **gratis** pero **2 RPM** (muy
  limitado) e implica opt-in de datos al training. Independiente. Encaje flojo como backstop por el
  rate-limit. Fuente: [free-llm-apis 2026](https://tokenmix.ai/blog/free-llm-apis-2026-every-provider-free-tier-tested).
  **Decisión:** TRACK (bajo interés por 2 RPM).

## Bitácora de hallazgos (lo más reciente arriba)

- **2026-07-13 · Pasada limpia — los 5 ids cableados VIVOS.** Watch de deprecación (Paso 1) sobre los
  ids REALES de `client.ts`: **NIM `meta/llama-3.3-70b-instruct`** ✅, **Groq `openai/gpt-oss-120b`** ✅
  (es el reemplazo recomendado, no un deprecado), **Gemini `gemini-flash-latest`** ✅ (→ Gemini 3.5
  Flash GA, el alias rodante absorbió la retirada de 2.5-flash), **Kimi `kimi-k2.6`** ✅ (el
  "discontinuado 25/05" era la serie vieja, no k2.6), + consumidor **`CONTABLE_MODEL`
  `deepseek-ai/deepseek-v3`** ✅ sigue en NIM. **Sin hallazgo crítico → sin swap PR.** Descubrimiento
  (Paso 2): **Cerebras** (gratis ~1M tok/día, sirve el mismo `gpt-oss-120b`, infra independiente) como
  candidato a 4º backstop gratis — tracked, no PR (nada roto + caveat de fiabilidad 31/05). **Aviso
  Telegram OMITIDO:** la rutina llegó con `CRON_SECRET=<PEGA_AQUÍ_EL_VALOR>` (placeholder sin sustituir)
  y sin `PLATAFORMA_URL` real inyectada → por regla de la skill "si faltan las envs, omite el aviso (no
  falles)", la pasada se completó igual; solo se pierde la notificación (que además no era crítica: todo
  vivo). **Nota para Alberto:** rellenar `CRON_SECRET` real en la config del trigger `buscador-ia` para
  recuperar el aviso Telegram.

- **2026-07-11 · SWAP APLICADO (PR #822).** Alberto dio OK (opción A) a arreglar los 3. Ids nuevos en
  `client.ts` + adaptadores (`gemini.ts`/`groq.ts`/`moonshot.ts`): Gemini `gemini-2.5-flash`, Kimi
  `kimi-k2.6`, Groq `openai/gpt-oss-120b`. Además se cazaron y corrigieron **otras llamadas vivas** que
  seguían en `gemini-2.0-flash` (404 desde el EOL): `lib/pasarela.ts` (fallback Gemini de la pasarela +
  etiquetas de coste), `api/ai/search`, `api/sivra/eventos/websearch`, y la edge function de ia-rest
  `eventos-entorno` (⚠️ **necesita `supabase functions deploy` aparte** para entrar en runtime). NO tocado
  (fuera de scope, lo lleva su cron): el catálogo del Director (`ia-director-refresh`, `ia-director.ts`
  `SUPLENTES_DEFAULT` con `google/gemini-2.0-flash-001`) — **avisado a Alberto para revisar aparte**.

- **2026-07-11 · 1ª pasada real — 3 de 4 backstops de la cadena directa podridos.** Watch de
  deprecación (Paso 1) sobre los ids REALES de `client.ts`:
  - ✅ **NIM `meta/llama-3.3-70b-instruct`** — VIVO ([build.nvidia.com](https://build.nvidia.com/meta/llama-3_3-70b-instruct), catálogo actualizado ~hace 2 sem).
  - ⚠️ **Groq `llama-3.3-70b-versatile`** — DEPRECADO el 17/06/2026 (aún sirve, free/dev tier;
    enterprise no afectado). Reemplazo que recomienda Groq: `openai/gpt-oss-120b` (o `qwen/qwen3.6-27b`).
    Fuente: [console.groq.com/docs/deprecations](https://console.groq.com/docs/deprecations).
  - 🔴 **Gemini `gemini-2.0-flash`** — APAGADO (EOL) el 01/06/2026; el id ya no existe (mismo patrón
    que el 405B → 404). Migración: `gemini-2.5-flash` (OJO: ese a su vez EOL 16/10/2026 → `gemini-3.5-flash`).
    Fuente: [ai.google.dev/gemini-api/docs/deprecations](https://ai.google.dev/gemini-api/docs/deprecations).
  - 🔴 **Kimi `kimi-k2-0711-preview`** — DISCONTINUADO el 25/05/2026 (toda la serie k2). Migración:
    `kimi-k2.6` (nombre comercial; id API exacto por confirmar en el catálogo). Fuente:
    [platform.kimi.ai/docs/models](https://platform.kimi.ai/docs/models).
  - **Riesgo:** es el escenario del incidente del 06/07 — si OpenRouter (primario) y NIM caen a la
    vez, los backstops Gemini y Kimi responden 404 (ids muertos) y Groq está en cuenta atrás. Solo
    NIM sostiene la cadena directa. **Pendiente decisión de Alberto:** PR que swap-ee los ids muertos
    por los vigentes en `client.ts` (`DEFAULT_GEMINI_MODEL`, `DEFAULT_MOONSHOT_MODEL`, `DEFAULT_GROQ_MODEL`).

- **2026-07-09 · OpenRouter primario.** Alberto conectó OpenRouter para descargar la saturación
  de los proveedores gratis. Nuevo eslabón PRIMARIO en `aiComplete` (gateado por
  `OPENROUTER_API_KEY`) + Agente Director en la pasarela (tabla `ia_director_prompt`, modo
  sombra) + cron semanal propio `ia-director-refresh` que mantiene su catálogo (determinista,
  con aviso Telegram y watch de créditos). Delimitación: ese cron vigila el catálogo de
  OpenRouter; este agente sigue con las deprecaciones de la cadena directa.

- **2026-07-06 · semilla.** Se crea el agente a raíz del incidente de "IA no disponible" en el
  agente de huéspedes: `meta/llama-3.1-405b-instruct` fue **retirado del catálogo de NVIDIA NIM**
  (HTTP 404 en cada mensaje) y ese día los 3 proveedores gratis fallaron a la vez, sin backstop de
  pago (Kimi) activo. Arreglo puntual: `AGENTE_HUESPED_MODEL` a vacío (PR #769, ya en main). Este
  agente nace para cazar la próxima retirada ANTES de que toque a un cliente. Aún sin 1ª pasada
  real: las columnas "última vez visto vivo" están pendientes.
