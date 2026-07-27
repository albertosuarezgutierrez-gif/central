# 🧠 Vigía de LLMs — estado entre ejecuciones

> Estado vivo del agente `buscador-ia` (skill `.claude/skills/buscador-ia`). Cada pasada semanal
> actualiza este doc: modelos cableados (vivos/deprecados), catálogos comprobados, candidatos
> gratis en seguimiento y bitácora de hallazgos. **Fuente de verdad de qué está cableado:**
> `packages/core-ai/src/client.ts` — este doc lo refleja, no lo sustituye.

## Modelos cableados en la cadena `aiComplete` (OpenRouter → NIM → Groq → Cerebras → Gemini → Kimi)

> **09/07/2026 — OpenRouter cableado como PRIMARIO** (si hay `OPENROUTER_API_KEY`): agregador con
> Agente Director en la pasarela de plataforma + fallback nativo entre modelos. Su catálogo lo
> refresca solo el cron automático `/api/cron/ia-director-refresh` (semanal, tabla
> `ia_director_prompt`) — FUERA del scope de este agente. La cadena directa de abajo sigue siendo
> la red de seguridad cuando OpenRouter entero falla, y sigue siendo lo que este agente vigila.
>
> **27/07/2026 — nuevo eslabón Cerebras** (si hay `CEREBRAS_API_KEY`): 4º proveedor gratis,
> infra WSE independiente de NIM/Groq. Ver bitácora de hoy.

| Eslabón | id por defecto | Env (key / override) | Coste | Estado (comprobado 2026-07-27) |
|---|---|---|---|---|
| OpenRouter (primario pasarela — lo vigila SU cron, no este agente) | `deepseek/deepseek-chat` | `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | según modelo (tope 1€/día) | fuera de scope (cron `ia-director-refresh`) |
| NVIDIA NIM (primario cadena directa) | `meta/llama-3.3-70b-instruct` | `NVIDIA_API_KEY` | gratis | ✅ **VIVO** — sigue en catálogo ([build.nvidia.com](https://build.nvidia.com/meta/llama-3_3-70b-instruct)), sin aviso de retirada |
| Groq (fallback 1) | `openai/gpt-oss-120b` | `GROQ_API_KEY` / `GROQ_BRAIN_MODEL` | gratis (rate-limited) | ✅ **VIVO** — no aparece en la lista de deprecados/decomisionados ([console.groq.com/docs/deprecations](https://console.groq.com/docs/deprecations)); de hecho es el reemplazo recomendado de otros ids que Groq sí retiró (17/06 y 20/02/2026) |
| **Cerebras (fallback 1.5, NUEVO 27/07/2026)** | `gpt-oss-120b` | `CEREBRAS_API_KEY` / `CEREBRAS_MODEL` | gratis (1M tok/día, ctx 8192 tok en tier gratis) | 🆕 **plumbing añadido, INACTIVO sin key** — ver candidato abajo |
| Gemini (fallback 2 + grounding) | `gemini-flash-latest` | `GEMINI_API_KEY` / `GEMINI_BRAIN_MODEL` | gratis | ✅ **VIVO** — el alias rodante ya apunta a **Gemini 3.5 Flash GA** (release oficial de julio 2026, [ai.google.dev/gemini-api/docs/whats-new-gemini-3.5](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5)). Hubo reportes de 404 intermitentes en el alias en mayo-junio (ligados a la retirada de `gemini-2.0-flash`, ya conocida), pero son anteriores al swap del 12/07 y a la GA de julio — sin incidencias nuevas encontradas hoy |
| Kimi/Moonshot (fallback 3) | `kimi-k2.6` | `MOONSHOT_API_KEY` / `MOONSHOT_MODEL` | de pago | ✅ **VIVO** — Moonshot solo anuncia retirada de `kimi-k2.5` y `moonshot-v1` (31/08/2026); `kimi-k2.6` no está afectado ([platform.kimi.ai/docs/pricing/chat-k26](https://platform.kimi.ai/docs/pricing/chat-k26)) |

**Consumidores con modelo propio:**
- `AGENTE_HUESPED_MODEL` — **vacío por defecto** (usa el 70B de la cadena). *(Antes `meta/llama-3.1-405b-instruct`, RETIRADO de NIM → causó "IA no disponible"; ver abajo.)*
- `CONTABLE_MODEL` — default `deepseek-ai/deepseek-v3` (NIM).

## Catálogos a comprobar cada pasada
- NVIDIA NIM — https://build.nvidia.com/models
- Groq — https://console.groq.com/docs/models (mirar *deprecated/decommissioned*)
- Google Gemini — https://ai.google.dev/gemini-api/docs/models (retiradas + free tier)
- Moonshot/Kimi — https://platform.moonshot.ai/docs
- **Cerebras** (nuevo, desde 27/07/2026) — https://inference-docs.cerebras.ai (catálogo + rate limits del tier gratis)

## Candidatos gratis en seguimiento

- **Cerebras** — proveedor de inferencia sobre su propio hardware (WSE), infra genuinamente
  independiente de NIM/Groq/Gemini. Free tier: **1M tokens/día**, sin tarjeta, sirve
  `gpt-oss-120b` (el MISMO modelo que ya usamos como fallback de Groq, ya validado en producción)
  — eso convierte la mini-eval en trivial: si el modelo ya es bueno vía Groq, lo es igual vía
  Cerebras (misma calidad, otra infra/cuenta). Encaja exactamente en el hueco que dejó el
  incidente del 06/07/2026 (3 proveedores gratis cayeron a la vez): un 4º backstop independiente.
  Caveat del tier gratis: contexto limitado a 8192 tokens y 30 req/min — vale para respuestas
  cortas (huésped, clasificación), no para prompts largos. **Sin eval en vivo (sin
  `CEREBRAS_API_KEY` en esta sesión)** — puntuación por datos publicados: A (redacción) 2/2,
  B (clasificación) 2/2 (mismo modelo gpt-oss-120b que ya puntúa así vía Groq). Fuentes:
  [Cerebras free tier / rate limits](https://tokenmix.ai/blog/cerebras-api-key-rate-limits-free-tier-2026),
  [Cerebras chat completions API](https://inference-docs.cerebras.ai/api-reference/chat-completions).
  **Acción tomada hoy:** plumbing añadido a `client.ts` (`cerebrasEnvConfig()` + eslabón en el
  try/catch entre Groq y Gemini), gateado por `CEREBRAS_API_KEY` — **inactivo hasta que Alberto
  ponga la key** (PR draft de esta pasada).

- **Mistral (La Plateforme, "Experiment" free tier)** — proveedor y familia de modelos
  independiente (Mistral Large / Codestral), tope ~1B tokens/mes. En seguimiento, NO plumbing
  todavía: los límites de rate ya no se publican (hay que mirar el Admin Console por cuenta) y el
  propio proveedor marca el tier como "para evaluación, no producción" — menos apto como backstop
  de guardia que Cerebras. Revisar en la próxima pasada si publican límites más claros. Fuente:
  [Mistral free tier 2026](https://pricepertoken.com/endpoints/mistral/free).

## Bitácora de hallazgos (lo más reciente arriba)

- **2026-07-27 · pasada semanal — todo vivo, +1 backstop nuevo (Cerebras, PR draft).** Watch de
  deprecación (Paso 1): los 4 eslabones cableados de la cadena directa (NIM, Groq, Gemini, Kimi)
  siguen VIVOS a día de hoy — ninguno con retirada anunciada (ver tabla arriba con fuentes).
  Nota sobre Gemini: se encontraron hilos de mayo-junio 2026 sobre 404 intermitentes en el alias
  `gemini-flash-latest`/`gemini-3.5-flash`, pero todos anteriores al swap del 12/07 (que ya
  arregló el caso conocido) y a la GA de julio de Gemini 3.5 Flash — no es un hallazgo nuevo, solo
  contexto de por qué seguir vigilando los alias rodantes. Descubrimiento (Paso 2): **Cerebras**
  como 4º proveedor gratis independiente (infra WSE, 1M tok/día, mismo modelo `gpt-oss-120b` que
  Groq) — mini-eval trivial por reutilizar un modelo ya validado. Se añadió el plumbing
  (`packages/core-ai/src/cerebras.ts` + eslabón en `client.ts`, gateado por `CEREBRAS_API_KEY`,
  **inactivo sin la key**) vía PR draft `claude/youthful-gates-ntyg6c` — pendiente de que Alberto
  decida si activarlo. Candidato secundario anotado sin plumbing: Mistral (free tier con menos
  garantías, ver arriba). Sin modelos muertos → sin aviso urgente de Telegram por deprecación;
  aviso informativo enviado sobre el candidato nuevo.

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
