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

| Eslabón | id por defecto | Env (key / override) | Coste | Estado (comprobado 2026-07-11) |
|---|---|---|---|---|
| OpenRouter (primario pasarela — lo vigila SU cron, no este agente) | `deepseek/deepseek-chat` | `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | según modelo (tope 1€/día) | fuera de scope (cron `ia-director-refresh`) |
| NVIDIA NIM (primario cadena directa) | `meta/llama-3.3-70b-instruct` | `NVIDIA_API_KEY` | gratis | ✅ **VIVO** — catálogo NIM actualizado ~hace 2 sem |
| Groq (fallback 1) | `openai/gpt-oss-120b` | `GROQ_API_KEY` / `GROQ_BRAIN_MODEL` | gratis (rate-limited) | ✅ **swap aplicado (PR #822)** — antes `llama-3.3-70b-versatile`, DEPRECADO 17/06/2026 |
| Gemini (fallback 2 + grounding) | `gemini-flash-latest` | `GEMINI_API_KEY` / `GEMINI_BRAIN_MODEL` | gratis | ✅ **swap aplicado (12/07/2026)** — Google retiró `gemini-2.5-flash` de la API directa el **09/07/2026** (404, ANTES de la EOL oficial 16/10). Ahora alias rodante `gemini-flash-latest` (→ Flash GA vigente) para no volver a romperse con las retiradas de versión. Afectaba a `core-ai` (`gemini.ts`/`client.ts`), la edge fn `eventos-entorno` de ia-rest, `/api/ai/search` y el fallback de `pasarela.ts` |
| Kimi/Moonshot (fallback 3) | `kimi-k2.6` | `MOONSHOT_API_KEY` / `MOONSHOT_MODEL` | de pago | ✅ **swap aplicado (PR #822)** — antes `kimi-k2-0711-preview`, discontinuado 25/05/2026 |

**Consumidores con modelo propio:**
- `AGENTE_HUESPED_MODEL` — **vacío por defecto** (usa el 70B de la cadena). *(Antes `meta/llama-3.1-405b-instruct`, RETIRADO de NIM → causó "IA no disponible"; ver abajo.)*
- `CONTABLE_MODEL` — default `deepseek-ai/deepseek-v3` (NIM).

## Catálogos a comprobar cada pasada
- NVIDIA NIM — https://build.nvidia.com/models
- Groq — https://console.groq.com/docs/models (mirar *deprecated/decommissioned*)
- Google Gemini — https://ai.google.dev/gemini-api/docs/models (retiradas + free tier)
- Moonshot/Kimi — https://platform.moonshot.ai/docs

## Candidatos gratis en seguimiento

| Candidato | Proveedor / id | Coste | Capacidad (AA idx) | Mini-eval | Veredicto |
|---|---|---|---|---|---|
| **Kimi K3** | OpenRouter `moonshotai/kimi-k3` (canónico `kimi-k3-20260715`, salió 15/07/2026) | de pago — $3/M in · $15/M out · $0,30/M cache | intelligence **57,1** · coding **76,2** · agentic **50,1**; multimodal texto+imagen; contexto 1M | **sin eval en vivo** (OpenRouter MCP `401 User not found`; docs Moonshot `403`). Solo datos publicados del catálogo OpenRouter | **En seguimiento, NO cablear como backstop.** Más capaz que `kimi-k2.6` en papel, pero **razonamiento OBLIGATORIO a esfuerzo `max`** (no desactivable) → latencia + coste altos y roza el `timeoutMs=30_000` del último fallback; además pésimo para `debeEscalar` (1 palabra). La Kimi cableada usa la **API directa de Moonshot** (`MOONSHOT_MODEL`), no OpenRouter; K3 "en OpenRouter" cae en el catálogo del **Director** (cron `ia-director-refresh`, fuera de scope). Decisión de Alberto 17/07/2026: **solo documentar**. |

## Bitácora de hallazgos (lo más reciente arriba)

- **2026-07-17 · Kimi K3 evaluado (a petición de Alberto: "kimi k3 mira en openrouter").** K3
  confirmado VIVO en OpenRouter (`moonshotai/kimi-k3`, salió 15/07/2026): 2,8T params, multimodal,
  contexto 1M, AA intelligence 57,1 / coding 76,2 / agentic 50,1, precio $3/$15 por M. **No se hizo
  eval en vivo** (OpenRouter MCP `401 User not found` — sin cuenta/créditos conectados; docs Moonshot
  `403`), solo datos publicados. **Hallazgo clave:** K3 tiene **razonamiento obligatorio a `max`** (no
  desactivable) → mal encaje para el rol del backstop de pago (rápido/barato) por latencia, coste y el
  timeout de 30s de `aiComplete`; y contraproducente para `debeEscalar`. **Decisión de Alberto:** solo
  documentar; el backstop directo sigue en `kimi-k2.6`. Sin PR, sin cambio de código. *(No se pudo
  reconfirmar la liveness de `kimi-k2.6` en la API DIRECTA de Moonshot esta pasada — docs `403`; sigue
  listado y servido en el catálogo de OpenRouter, que no es la misma superficie que la API directa.)*

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
