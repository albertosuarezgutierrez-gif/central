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

| Eslabón | id por defecto | Env (key / override) | Coste | Estado (comprobado 2026-07-20) |
|---|---|---|---|---|
| OpenRouter (primario pasarela — lo vigila SU cron, no este agente) | `deepseek/deepseek-chat` | `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | según modelo (tope 1€/día) | fuera de scope (cron `ia-director-refresh`) |
| NVIDIA NIM (primario cadena directa) | `meta/llama-3.3-70b-instruct` | `NVIDIA_API_KEY` | gratis | ✅ **VIVO** — sigue en catálogo NIM, sin aviso de deprecación (la que SÍ está en cuenta atrás es la 3.1-70b, hermana vieja, EOL julio 2026 — no nos afecta, ya vamos en 3.3) |
| Groq (fallback 1) | `openai/gpt-oss-120b` | `GROQ_API_KEY` / `GROQ_BRAIN_MODEL` | gratis (rate-limited) | ✅ **VIVO** — no aparece en `console.groq.com/docs/deprecations`; de hecho es el modelo de MIGRACIÓN al que Groq manda a otros ids muertos (`kimi-k2-instruct` deprecado 23/03/2026, `llama-4-maverick-17b-128e-instruct` deprecado 20/02/2026) |
| Gemini (fallback 2 + grounding) | `gemini-flash-latest` | `GEMINI_API_KEY` / `GEMINI_BRAIN_MODEL` | gratis | ✅ **VIVO — alias funcionando como se diseñó**: `gemini-flash-latest` ahora resuelve a Gemini **3.5 Flash GA** (release reciente) sin que hiciera falta tocar código, confirma que la estrategia de alias rodante (swap 12/07) evita la próxima retirada de versión. El id fijo `gemini-2.5-flash` (que ya NO usamos directo) sigue con EOL 16/10/2026 — no nos afecta |
| Kimi/Moonshot (fallback 3) | `kimi-k2.6` | `MOONSHOT_API_KEY` / `MOONSHOT_MODEL` | de pago | ✅ **VIVO** — sigue siendo el flagship de Moonshot (release abril 2026); ya existen `k2.7-code` y rumores de `k3`, pero k2.6 no tiene aviso de retirada |

**Consumidores con modelo propio:**
- `AGENTE_HUESPED_MODEL` — **vacío por defecto** (usa el 70B de la cadena). *(Antes `meta/llama-3.1-405b-instruct`, RETIRADO de NIM → causó "IA no disponible"; ver abajo.)*
- `CONTABLE_MODEL` — default `deepseek-ai/deepseek-v3` (NIM).

## Catálogos a comprobar cada pasada
- NVIDIA NIM — https://build.nvidia.com/models
- Groq — https://console.groq.com/docs/models (mirar *deprecated/decommissioned*)
- Google Gemini — https://ai.google.dev/gemini-api/docs/models (retiradas + free tier)
- Moonshot/Kimi — https://platform.moonshot.ai/docs

## Candidatos gratis en seguimiento

*(sin eval en vivo — sin key en esta sesión; puntuación solo con datos publicados, sin URL no se anota)*

| Candidato | Proveedor | Gratis/límite | Encaja para | Mini-eval | Veredicto |
|---|---|---|---|---|---|
| `gpt-oss-120b` / `llama-3.3-70b` / `qwen3-235b` (catálogo variable) | **Cerebras** (LPU, infra propia — independiente de NIM/Groq/Gemini/Kimi) | 1M tokens/día, sin tarjeta, pero **catálogo volátil**: cayó de ~12 modelos a solo 2 (`gpt-oss-120b`, `zai-glm-4.7`) el 31/05/2026 y volvió a subir después — no hay garantía de qué modelo estará disponible mañana | 5º/6º proveedor independiente — justo lo que faltaba el 06/07 (los 3 gratis cayeron a la vez) | Sin eval en vivo (sin `CEREBRAS_API_KEY`). Publicado: mismo Llama 3.3 70B / GPT-OSS-120B que ya usamos en NIM/Groq → capacidad no añade nada nueva, solo infra de respaldo | **Interesante como backstop, pero la volatilidad del catálogo es justo el tipo de riesgo que este agente vigila — no proponer plumbing hasta que el catálogo se estabilice** |
| 50+ modelos (Llama 3/4, Mistral, Gemma, Qwen, DeepSeek-R1) | **Cloudflare Workers AI** (edge, 300+ ubicaciones — infra más distinta aún de las 4 actuales) | 10.000 "Neurons"/día gratis, sin tarjeta | 5º/6º proveedor independiente, catálogo más estable que Cerebras | Sin eval en vivo (sin key). Publicado: auth **distinta** a las demás (requiere `account_id` + token en la URL, no solo Bearer key — el patrón `xEnvConfig()` de `client.ts` habría que adaptarlo, no es un copy-paste de `groq.ts`) | **Candidato más sólido que Cerebras para subir resiliencia, pero el plumbing es más laborioso (auth de 2 piezas) — merece que Alberto decida si compensa antes de escribir código** |

Ninguno de los dos es "claramente mejor" (ambos con caveats reales) → no cruza el umbral de PR/Telegram
de esta pasada. Quedan en seguimiento para la próxima; si Cerebras estabiliza catálogo o Alberto quiere
más resiliencia ya, son los 2 candidatos a plumbing.

## Bitácora de hallazgos (lo más reciente arriba)

- **2026-07-20 · pasada rutinaria — todo vivo, sin acción.** Watch de deprecación (Paso 1) sobre los 4
  ids reales de `client.ts`: NIM `meta/llama-3.3-70b-instruct` ✅, Groq `openai/gpt-oss-120b` ✅, Gemini
  `gemini-flash-latest` ✅ (confirmado que el alias ya rodó solo a Gemini 3.5 Flash GA — la estrategia
  del swap del 12/07 funciona), Kimi `kimi-k2.6` ✅. Sin retiradas, sin recortes de free tier detectados.
  Descubrimiento (Paso 2): 2 candidatos a 5º/6º proveedor independiente (Cerebras, Cloudflare Workers AI)
  — ambos con caveats (catálogo volátil / auth distinta), ninguno "claramente mejor" → sin PR ni Telegram,
  solo anotados en seguimiento. Sin WebFetch directo a los catálogos (403 del proxy en los 4); watch hecho
  con WebSearch en su lugar, fuentes citadas en cada fila.

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
