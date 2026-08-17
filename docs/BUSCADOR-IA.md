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

## Modelos cableados en la cadena `aiComplete` (OpenRouter → NIM → Groq → Cerebras → [Gemini, gateado] → Kimi)

> ⚠️ **02/08/2026 (PR #1220):** el eslabón Gemini está **apagado por defecto** — 544 llamadas/30d
> con 0 éxitos (429 de cuota). Requiere `GEMINI_TEXTO=1` además de la key. Sigue en la tabla
> como watch de catálogo por si se reactiva.
>
> **09/07/2026 — OpenRouter cableado como PRIMARIO** (si hay `OPENROUTER_API_KEY`): su catálogo lo
> refresca el cron `/api/cron/ia-director-refresh` — FUERA del scope de este agente. La cadena
> directa de abajo es la red de seguridad cuando OpenRouter entero falla.
>
> **27/07/2026 — eslabón Cerebras** (si hay `CEREBRAS_API_KEY`): 4º proveedor gratis, infra WSE
> independiente de NIM/Groq. Hoy INACTIVO (sin key).

| Eslabón | id por defecto | Env (key / override) | Coste | Estado (comprobado 2026-08-17) |
|---|---|---|---|---|
| OpenRouter (primario pasarela — lo vigila SU cron, no este agente) | `deepseek/deepseek-chat` | `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | según modelo (tope 1€/día) | fuera de scope (cron `ia-director-refresh`) |
| NVIDIA NIM (primario cadena directa) | `meta/llama-4-maverick-17b-128e-instruct` | `NVIDIA_API_KEY` | gratis | 🔄 **SWAP 17/08/2026** — el anterior `meta/llama-3.3-70b-instruct` tiene aviso de retirada en su ficha de [build.nvidia.com](https://build.nvidia.com/meta/llama-3_3-70b-instruct): **deja de soportarse el 25/08/2026** (mismo patrón que el 405B del 06/07). NVIDIA no nombra sucesor; se eligió [Maverick](https://build.nvidia.com/meta/llama-4-maverick-17b-128e-instruct/modelcard) (vivo, multilingüe/multimodal, el más usado del catálogo, gratis). PR draft de esta pasada. |
| Groq (fallback 1) | `openai/gpt-oss-120b` | `GROQ_API_KEY` / `GROQ_BRAIN_MODEL` | gratis (rate-limited) | ✅ **VIVO** (10/08) — destino de migración recomendado de otros modelos que Groq deprecia |
| Cerebras (fallback 2, plumbing 27/07/2026) | `gpt-oss-120b` | `CEREBRAS_API_KEY` / `CEREBRAS_MODEL` | gratis (1M tok/día, ctx 8192 en tier gratis) | ✅ vivo (10/08) — **INACTIVO sin key**, pendiente de Alberto |
| Gemini (fallback 3, APAGADO por defecto) | `gemini-flash-latest` | `GEMINI_API_KEY` **+ `GEMINI_TEXTO=1`** / `GEMINI_BRAIN_MODEL` | gratis | ✅ vivo (10/08) — alias rodante apunta a Gemini 3.5 Flash GA; sigue apagado por falta de cuota real |
| Kimi/Moonshot (fallback 4, de pago) | `kimi-k2.6` | `MOONSHOT_API_KEY` / `MOONSHOT_MODEL` | $0,95/$4,00 por M | ✅ **VIVO** (10/08) — el sunset del 31/08/2026 es de `kimi-k2.5`/`moonshot-v1`, no afecta |

**Consumidores con modelo propio:**
- `AGENTE_HUESPED_MODEL` — **vacío por defecto** (usa el modelo por defecto de la cadena, desde el
  17/08/2026 Maverick). *(Antes `meta/llama-3.1-405b-instruct`, RETIRADO de NIM → causó "IA no disponible".)*
- `CONTABLE_MODEL` — default `deepseek-ai/deepseek-v3` (NIM). ⚠️ **sigue sin confirmar** (17/08): el
  catálogo NIM visible por búsqueda solo lista `deepseek-v3.1`/`v3.1-terminus`/`v3.2`; WebFetch directo a
  NIM bloqueado por proxy y sin `NVIDIA_API_KEY` en sesión. Sin evidencia de rotura; pendiente de
  comprobación con key real.
- Ids pinneados del viejo 70B en apps (rrhh `asistente*.ts`, plataforma `ai-client.ts`/`sonda-ia.ts`,
  ia-rest `ai-client.ts`/`brain.ts` + 4 edge functions) — **todos swapeados a Maverick en el PR del
  17/08/2026**. ⚠️ Las edge functions de ia-rest necesitan `supabase functions deploy` aparte (como en PR #822).

## Catálogos a comprobar cada pasada
- NVIDIA NIM — https://build.nvidia.com/models
- Groq — https://console.groq.com/docs/models (mirar *deprecated/decommissioned*)
- Google Gemini — https://ai.google.dev/gemini-api/docs/models (retiradas + free tier)
- Moonshot/Kimi — https://platform.moonshot.ai/docs
- Cerebras — https://inference-docs.cerebras.ai (catálogo + rate limits del tier gratis)

## Candidatos en seguimiento

| Candidato | Proveedor | id | Gratis/límite | Encaja para | Mini-eval |
|---|---|---|---|---|---|
| GLM-5.2 (z-ai) | NVIDIA NIM | `z-ai/glm-5.2` | Gratis, ~40 RPM (lento en hora punta) | Candidato a `AGENTE_HUESPED_MODEL`/`CONTABLE_MODEL`: reseñas de julio/2026 lo señalan top open-weight en razonamiento/código/agentic. El 17/08 se consideró como sustituto del 70B y se prefirió Maverick (mismo vendor Meta, más rodado en el catálogo, multilingüe para huéspedes; GLM-5.2 más lento en hora punta) | **Sin eval en vivo (sin key)** — solo datos publicados |
| MiMo-V2.5 / -Pro (Xiaomi) | OpenRouter (de pago) o self-host (MIT) | `xiaomi/mimo-v2.5[-pro]` | NO gratis por API | Interés por ranking de uso en OpenRouter; fuera del scope de la cadena directa | Sin mini-eval |
| Mistral (La Plateforme, free tier "Experiment") | Mistral | — | ~1B tok/mes, límites no publicados | 5º backstop potencial; el propio proveedor lo marca "evaluación, no producción" | En seguimiento, sin plumbing |

## Bitácora de hallazgos (lo más reciente arriba)

- **2026-08-17 · 🔴 SWAP APLICADO (PR draft): NIM retira `meta/llama-3.3-70b-instruct` el 25/08/2026.**
  Confirmado por búsquedas dirigidas sobre la ficha de [build.nvidia.com](https://build.nvidia.com/meta/llama-3_3-70b-instruct):
  «will be deprecated on 08/25/2026 and will no longer be supported after that date» — el banner pide
  migrar pero **no nombra sucesor** (remite al API Reference). WebFetch directo a `build.nvidia.com`/
  `docs.api.nvidia.com` sigue bloqueado por el proxy y no hay `NVIDIA_API_KEY` en sesión, así que la
  elección del reemplazo se hizo por catálogo visible: **`meta/llama-4-maverick-17b-128e-instruct`**
  (vivo en NIM, [modelcard](https://build.nvidia.com/meta/llama-4-maverick-17b-128e-instruct/modelcard),
  free tier, multilingüe+multimodal, el modelo más usado del catálogo; sin aviso de retirada encontrado).
  Alternativa considerada: `z-ai/glm-5.2` (se queda como candidato — más lento en hora punta y menos
  rodado para redacción a huésped). **Sin eval en vivo (sin key)**; mini-eval A/B pendiente para la
  próxima pasada con key o vía producción. Swap aplicado en TODO el radio (no solo `client.ts`):
  core-ai (`client.ts`/`nim.ts`/`types.ts`), plataforma (`ai-client.ts`, `sonda-ia.ts`), rrhh
  (`asistente.ts`/`asistente-admin.ts`), ia-rest (`ai-client.ts`, `brain.ts`, `.env.example`, labels
  `modelo_usado`, 4 edge functions — ⚠️ **necesitan `supabase functions deploy` aparte**). Los ids
  `meta-llama/llama-3.3-70b-instruct` de OpenRouter (pasarela/director) NO se tocan: es otro proveedor,
  la retirada es solo del hosting NIM. Telegram enviado (preflight 200).

- **2026-08-10 · pasada semanal — los 5 eslabones cableados VIVOS, sin candidatos nuevos.**
  NIM 70B vivo entonces (el aviso de retirada apareció después); Groq `openai/gpt-oss-120b` vivo;
  Cerebras vivo (free tier 1M tok/día; fuentes discrepan 5-30 req/min — cablear con margen); Gemini
  `gemini-flash-latest` vivo (sigue apagado por cuota). **Kimi — ojo con la lectura rápida:** una
  búsqueda sugería que TODA la serie K2 se retiraba el 25/05/2026; una segunda pasada dirigida lo
  desmiente — esa fecha retiró `k2-0711-preview`/`k2-0905-preview`, y el catálogo oficial sigue
  listando `kimi-k2.6`; el único sunset real es `kimi-k2.5`+`moonshot-v1` (31/08/2026). Lección: las
  búsquedas sobre nombres de versión similares se contradicen — segunda pasada dirigida antes de dar
  un id por muerto. Kimi K3 (flagship nuevo, $3/$15 por M) NO desplaza a K2.6 como último fallback
  (~3-4× más caro sin caso de uso aquí). `CONTABLE_MODEL` sin confirmar. Sin hallazgos críticos → sin
  Telegram, solo doc.

- **2026-07-27 · pasada limpia — 4 eslabones vivos + plumbing Cerebras (PR draft `claude/youthful-gates-ntyg6c`).**
  Primera pasada sin ningún id roto. Cerebras añadido como 4º backstop gratis (infra WSE, mismo
  `gpt-oss-120b` que Groq → mini-eval trivial; 1M tok/día, ctx 8192, inactivo sin key). Candidato
  `z-ai/glm-5.2` anotado. Aviso Telegram FALLÓ (401 — `ALERTA_TOKEN` desincronizado; luego arreglado).

- **2026-07-11 · SWAP APLICADO (PR #822).** Gemini `gemini-2.5-flash`, Kimi `kimi-k2.6`, Groq
  `openai/gpt-oss-120b` en `client.ts` + adaptadores + otras llamadas vivas que seguían en
  `gemini-2.0-flash` (pasarela, api/ai/search, websearch de eventos, edge function `eventos-entorno`
  — esta con deploy aparte). El catálogo del Director quedó fuera de scope (su cron).

- **2026-07-11 · 1ª pasada real — 3 de 4 backstops de la cadena directa podridos.**
  NIM 70B vivo; Groq `llama-3.3-70b-versatile` DEPRECADO 17/06/2026 (reemplazo `openai/gpt-oss-120b`);
  Gemini `gemini-2.0-flash` EOL 01/06/2026 (404); Kimi `kimi-k2-0711-preview` discontinuado 25/05/2026.
  Riesgo del escenario 06/07 confirmado → PR de swap (ver arriba).

- **2026-07-09 · OpenRouter primario.** Nuevo eslabón PRIMARIO gateado por `OPENROUTER_API_KEY` +
  Agente Director + cron `ia-director-refresh` (ese cron vigila el catálogo de OpenRouter; este agente,
  la cadena directa).

- **2026-07-06 · semilla.** El agente nace del incidente "IA no disponible" del agente de huéspedes:
  `meta/llama-3.1-405b-instruct` retirado de NIM (404) el día que los 3 gratis fallaron a la vez.
  Arreglo puntual: `AGENTE_HUESPED_MODEL` a vacío (PR #769).
