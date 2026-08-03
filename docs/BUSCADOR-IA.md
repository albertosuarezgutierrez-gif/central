# 🧠 Vigía de LLMs — estado entre ejecuciones

> Estado vivo del agente `buscador-ia` (skill `.claude/skills/buscador-ia`). Cada pasada semanal
> actualiza este doc: modelos cableados (vivos/deprecados), catálogos comprobados, candidatos
> en seguimiento y bitácora de hallazgos. **Fuente de verdad de qué está cableado:**
> `packages/core-ai/src/client.ts` — este doc lo refleja, no lo sustituye.
>
> **27/07/2026 — criterio ampliado a calidad/precio.** Alberto: ya no hace falta que el candidato
> sea gratis, mejor priorizar relación calidad/precio (un modelo de pago barato que rinda claramente
> mejor cuenta como hallazgo). Sigue habiendo salvaguarda: convertir un eslabón HOY gratis y vivo en
> uno de pago nunca es un PR mecánico, va por Telegram con el precio explícito para que decida Alberto.

## Modelos cableados en la cadena `aiComplete` (OpenRouter → NIM → Groq → [Gemini, gateado] → Kimi)

> ⚠️ **02/08/2026 (PR #1220):** el eslabón Gemini está **apagado por defecto** — 544 llamadas/30d
> con 0 éxitos (429 de cuota). Requiere `GEMINI_TEXTO=1` además de la key (ídem el último intento
> de `lib/pasarela.ts`; el websearch de ia-rest va tras `GEMINI_WEBSEARCH=1`). Sigue en la tabla
> como watch de catálogo por si se reactiva.

> **09/07/2026 — OpenRouter cableado como PRIMARIO** (si hay `OPENROUTER_API_KEY`): agregador con
> Agente Director en la pasarela de plataforma + fallback nativo entre modelos. Su catálogo lo
> refresca solo el cron automático `/api/cron/ia-director-refresh` (semanal, tabla
> `ia_director_prompt`) — FUERA del scope de este agente. La cadena directa de abajo sigue siendo
> la red de seguridad cuando OpenRouter entero falla, y sigue siendo lo que este agente vigila.

| Eslabón | id por defecto | Env (key / override) | Coste | Estado (comprobado 2026-08-03) |
|---|---|---|---|---|
| OpenRouter (primario pasarela — lo vigila SU cron, no este agente) | `deepseek/deepseek-chat` | `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | según modelo (tope 1€/día) | fuera de scope (cron `ia-director-refresh`) |
| NVIDIA NIM (primario cadena directa) | `meta/llama-3.3-70b-instruct` | `NVIDIA_API_KEY` | gratis | ✅ **VIVO** — sigue activo en el catálogo NIM/NGC; ningún aviso de retirada (solo 3.0/3.1 se han ido deprecando hacia 3.3, que sigue siendo el destino de migración) |
| Groq (fallback 1) | `openai/gpt-oss-120b` | `GROQ_API_KEY` / `GROQ_BRAIN_MODEL` | gratis (rate-limited) | ✅ **VIVO** — sigue siendo el destino de migración de Groq para OTROS modelos deprecados: `llama-3.1-8b-instant`/`llama-3.3-70b-versatile` (17/06), `llama-4-maverick` (20/02), `kimi-k2-instruct-0905` (23/03) todos migran hacia `gpt-oss-120b`/`gpt-oss-20b` ([console.groq.com/docs/deprecations](https://console.groq.com/docs/deprecations)) |
| Gemini (fallback 2 + grounding, APAGADO por defecto) | `gemini-flash-latest` | `GEMINI_API_KEY` / `GEMINI_BRAIN_MODEL` | gratis | ✅ **VIVO** (alias rodante sin incidencias) — ⚠️ pero ojo: `gemini-2.5-flash` (el modelo que resolvía el alias hasta hace poco) tiene shutdown confirmado el **16/10/2026**, migración a `gemini-3.5-flash`; como es alias (`-latest`), no debería requerir tocar código, pero conviene reconfirmar cerca de esa fecha que el alias sigue resolviendo. Sigue gateado tras `GEMINI_TEXTO=1` (ver PR #1220), así que no es prioridad mientras el eslabón esté apagado. |
| Kimi/Moonshot (fallback 3) | `kimi-k2.6` | `MOONSHOT_API_KEY` / `MOONSHOT_MODEL` | de pago | ✅ **VIVO** — Moonshot lanzó **K3** (julio/2026) como nuevo flagship, pero `kimi-k2.6` sigue en catálogo/pricing oficial como opción de valor ($0.60–0.95 in / $2.50–4.00 out por M según fuente). Sin aviso de retirada. |

**Consumidores con modelo propio:**
- `AGENTE_HUESPED_MODEL` — **vacío por defecto** (usa el 70B de la cadena). *(Antes `meta/llama-3.1-405b-instruct`, RETIRADO de NIM → causó "IA no disponible"; ver abajo.)*
- `CONTABLE_MODEL` — default `deepseek-ai/deepseek-v3` (NIM). ⚠️ **2ª pasada seguida sin confirmar**: el catálogo NIM muestra activamente `deepseek-v3.1`, `deepseek-v3.1-terminus`, `deepseek-v3.2` y (nuevo desde esta pasada) `deepseek-v4-flash`/`deepseek-v4-pro`, pero sigue sin aparecer una página propia para el id plano `deepseek-ai/deepseek-v3` en las búsquedas (WebFetch directo a NIM sigue dando 403 por proxy, sin key en sesión para `curl`). Dos pasadas sin evidencia de rotura tampoco es evidencia de que siga vivo — si alguien con `NVIDIA_API_KEY` puede probarlo por `curl` en la próxima pasada, cierra la duda de una vez.

## Catálogos a comprobar cada pasada
- NVIDIA NIM — https://build.nvidia.com/models
- Groq — https://console.groq.com/docs/models (mirar *deprecated/decommissioned*)
- Google Gemini — https://ai.google.dev/gemini-api/docs/models (retiradas + free tier)
- Moonshot/Kimi — https://platform.moonshot.ai/docs

## Candidatos gratis en seguimiento

| Candidato | Proveedor | id | Gratis/límite | Encaja para | Mini-eval |
|---|---|---|---|---|---|
| GLM-5.2 (z-ai) | NVIDIA NIM (mismo proveedor que el primario directo) | `z-ai/glm-5.2` | Gratis, ~40 RPM (lento en hora punta) | Candidato a sustituir/complementar el 70B en `AGENTE_HUESPED_MODEL`/`CONTABLE_MODEL`: reseñas de julio/2026 lo señalan como uno de los mejores open-weight actuales en razonamiento/código/agentic | **Sin eval en vivo (sin key en esta sesión)** — solo datos publicados: descrito como top open-weight all-round 2026. Sin prompts A/B propios todavía. |
| MiMo-V2.5 / MiMo-V2.5-Pro (Xiaomi) | Vía OpenRouter (de pago, $0,14/$0,28 por M el estándar) o self-host (pesos MIT, HF) | `xiaomi/mimo-v2.5[-pro]` | **NO gratis por API** (sí pesos abiertos MIT si alguien lo autoalojara) | Motivo del interés: subiendo mucho en el ranking de uso de OpenRouter (top 1 por tokens esta semana, +12%) — Alberto preguntó por él directamente | Sin mini-eval (no hay eslabón gratis al que engancharlo). Pro empata con Kimi K2.6 en el índice de Artificial Analysis. Fuera del scope de esta cadena directa mientras no haya un endpoint gratis — el catálogo de OpenRouter en sí lo vigila su propio cron (`ia-director-refresh`), no este agente. |

## Bitácora de hallazgos (lo más reciente arriba)

- **2026-08-03 · pasada limpia — los 4 eslabones VIVOS, canal Telegram MUDO (401).** Watch de
  deprecación (Paso 1): NIM `meta/llama-3.3-70b-instruct`, Groq `openai/gpt-oss-120b`, Gemini
  `gemini-flash-latest`, Kimi `kimi-k2.6` — los 4 confirmados vivos por WebSearch (WebFetch directo a
  los 4 catálogos dio 403 de proxy en esta sesión, se resolvió por búsqueda). Único aviso a vigilar:
  Gemini 2.5 Flash (lo que resolvía el alias hasta ahora) tiene shutdown confirmado 16/10/2026 →
  `gemini-3.5-flash`; el eslabón sigue apagado por defecto (`GEMINI_TEXTO`) así que no urge. Sigue sin
  confirmarse `CONTABLE_MODEL` (`deepseek-ai/deepseek-v3`, sin key en sesión — 2ª pasada seguida).
  Descubrimiento (Paso 2): nada nuevo que desplace a la cadena — `z-ai/glm-5.2` sigue como candidato
  fuerte en seguimiento (confirmado top open-weight otra vez, gratis en NIM, 40 RPM), aún sin mini-eval
  en vivo por falta de `NVIDIA_API_KEY` en esta sesión. **Hallazgo del propio preflight**: el canal de
  Telegram de esta rutina dio `401` (`causa: "el token no coincide..."`) — el `ALERTA_TOKEN` de este
  entorno/prompt está desincronizado del valor vivo en Vercel. Sin hallazgos críticos de modelo →
  sin PR; el 401 se avisa por push nativo (`🔇 SIN TELEGRAM (401)`) y queda anotado aquí.

- **2026-07-27 · pasada limpia — los 4 eslabones de la cadena directa VIVOS.** Primera vez desde que
  existe el agente que no hay ningún id roto: NIM `meta/llama-3.3-70b-instruct`, Groq
  `openai/gpt-oss-120b`, Kimi `kimi-k2.6` confirmados en catálogo; Gemini `gemini-flash-latest` es
  la prueba de que el alias rodante (aplicado 12/07) funciona — Google lanzó Gemini 3.5 Flash GA y el
  alias migró solo, sin 404 ni PR. Único cabo suelto: `CONTABLE_MODEL` (`deepseek-ai/deepseek-v3`) sin
  confirmar por bloqueo de proxy en WebFetch a NIM y sin key en esta sesión para probar por `curl` —
  no hay evidencia de rotura, solo falta de confirmación directa. Descubrimiento (Paso 2): `z-ai/glm-5.2`
  gratis en NIM, candidato fuerte a mini-eval con key real en próxima pasada. Alberto preguntó aparte por
  MiMo-V2.5 (Xiaomi, subiendo mucho en OpenRouter) — de pago/self-host, no aplica a la cadena gratis
  directa; anotado por si el catálogo de OpenRouter lo sube al Director. Sin hallazgos críticos → sin
  Telegram, solo doc.

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
