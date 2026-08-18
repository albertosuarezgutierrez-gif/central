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
| NVIDIA NIM (primario cadena directa) | `z-ai/glm-5.2` | `NVIDIA_API_KEY` | gratis (~40 RPM) | 🔄 **SWAP 17/08/2026, verificado EN VIVO** — el 3.3-70b deja de soportarse el 25/08/2026 (banner en [su ficha](https://build.nvidia.com/meta/llama-3_3-70b-instruct); ese día además respondía 503 por saturación). El primer sustituto (llama-4-maverick, elegido por ficha web) resultó **410 Gone en el API** (EOL 27/07/2026 — la ficha seguía viva). GLM-5.2 salió del listado real `GET /v1/models` (102 modelos) y pasó la mini-eval con key real: prompt A (huésped) respuesta cálida directa en español, prompt B devuelve exactamente `ESCALAR`, sin razonamiento parásito. Descartado `nvidia/llama-3.3-nemotron-super-49b-v1.5` (razonador: `content:null` con maxTokens cortos). |
| Groq (fallback 1) | `openai/gpt-oss-120b` | `GROQ_API_KEY` / `GROQ_BRAIN_MODEL` | gratis (rate-limited) | ✅ **VIVO** (10/08) — destino de migración recomendado de otros modelos que Groq deprecia |
| Cerebras (fallback 2, plumbing 27/07/2026) | `gpt-oss-120b` | `CEREBRAS_API_KEY` / `CEREBRAS_MODEL` | gratis (1M tok/día, ctx 8192 en tier gratis) | ✅ vivo (10/08) — **INACTIVO sin key**, pendiente de Alberto |
| Gemini (fallback 3, APAGADO por defecto) | `gemini-flash-latest` | `GEMINI_API_KEY` **+ `GEMINI_TEXTO=1`** / `GEMINI_BRAIN_MODEL` | gratis | ✅ vivo (10/08) — alias rodante apunta a Gemini 3.5 Flash GA; sigue apagado por falta de cuota real |
| Kimi/Moonshot (fallback 4, de pago) | `kimi-k2.6` | `MOONSHOT_API_KEY` / `MOONSHOT_MODEL` | $0,95/$4,00 por M | ✅ **VIVO** (10/08) — el sunset del 31/08/2026 es de `kimi-k2.5`/`moonshot-v1`, no afecta |

**Consumidores con modelo propio:**
- `AGENTE_HUESPED_MODEL` — **vacío por defecto** (usa el modelo por defecto de la cadena, desde el
  17/08/2026 GLM-5.2). *(Antes `meta/llama-3.1-405b-instruct`, RETIRADO de NIM → causó "IA no disponible".)*
- `CONTABLE_MODEL` — default `deepseek-ai/deepseek-v4-flash-0731` desde el 17/08/2026: el anterior
  `deepseek-ai/deepseek-v3` **YA NO existe en el API de NIM** (confirmado contra `/v1/models` con key real
  — cierra el "sin confirmar" que arrastrábamos desde el 27/07). El sucesor se probó en vivo con una
  pregunta de cifras: correcta, 1 frase, sin `<think>`.
- Ids pinneados del viejo 70B en apps (rrhh `asistente*.ts`, plataforma `ai-client.ts`/`sonda-ia.ts`,
  ia-rest `ai-client.ts`/`brain.ts` + 4 edge functions) — **todos swapeados a GLM-5.2** (PRs del
  17/08/2026). Las 4 edge functions de ia-rest **ya redesplegadas** por Supabase MCP en la misma sesión.

## Catálogos a comprobar cada pasada
- NVIDIA NIM — https://build.nvidia.com/models
- Groq — https://console.groq.com/docs/models (mirar *deprecated/decommissioned*)
- Google Gemini — https://ai.google.dev/gemini-api/docs/models (retiradas + free tier)
- Moonshot/Kimi — https://platform.moonshot.ai/docs
- Cerebras — https://inference-docs.cerebras.ai (catálogo + rate limits del tier gratis)

## Candidatos en seguimiento

| Candidato | Proveedor | id | Gratis/límite | Encaja para | Mini-eval |
|---|---|---|---|---|---|
| ~~GLM-5.2 (z-ai)~~ **PROMOVIDO a primario NIM el 17/08/2026** | NVIDIA NIM | `z-ai/glm-5.2` | Gratis, ~40 RPM | Ya no es candidato: es el default de la cadena directa (ver tabla). Mini-eval en vivo A 2/2 · B 2/2 | ✅ eval con key real 17/08 |
| MiMo-V2.5 / -Pro (Xiaomi) | OpenRouter (de pago) o self-host (MIT) | `xiaomi/mimo-v2.5[-pro]` | NO gratis por API | Interés por ranking de uso en OpenRouter; fuera del scope de la cadena directa | Sin mini-eval |
| Mistral (La Plateforme, free tier "Experiment") | Mistral | — | ~1B tok/mes, límites no publicados | 5º backstop potencial; el propio proveedor lo marca "evaluación, no producción" | En seguimiento, sin plumbing |

## Bitácora de hallazgos (lo más reciente arriba)

- **2026-08-17 (2ª parte) · 🔴 CORRECCIÓN VERIFICADA EN VIVO: Maverick estaba MUERTO en el API (410) →
  GLM-5.2; y `deepseek-v3` del contable también muerto → `deepseek-v4-flash-0731`.** Al probar el swap
  de la 1ª parte tras el merge (harness temporal en una edge function de ia-rest, que SÍ tiene
  `NVIDIA_API_KEY`), NIM respondió `410 Gone: "meta/llama-4-maverick-17b-128e-instruct has reached its
  end of life on 2026-07-27"` — **la ficha de build.nvidia.com seguía viva; la ficha NO prueba el API.**
  Con la key real: `GET /v1/models` (102 vivos: ni un solo llama-4; el 3.3-70b aún listado pero 503 por
  saturación y EOL 25/08; `deepseek-v3` AUSENTE) + mini-eval en vivo → **`z-ai/glm-5.2`** (A: respuesta
  cálida directa en español · B: exactamente `ESCALAR` · sin razonamiento parásito) y
  **`deepseek-ai/deepseek-v4-flash-0731`** para `CONTABLE_MODEL` (cifras correctas, 1 frase).
  Descartado `nvidia/llama-3.3-nemotron-super-49b-v1.5` (razonador: `content:null` con maxTokens
  cortos — la trampa del gpt-oss-120b de la sonda). Todo el radio re-swapeado y las 4 edge functions
  redesplegadas. **Regla nueva para el Paso 1:** un id solo se da por vivo si aparece en `/v1/models`
  o responde a una llamada real — el catálogo web puede ir semanas por detrás en ambos sentidos.

- **2026-08-17 (1ª parte) · SWAP a Maverick (SUPERADO el mismo día, ver arriba): NIM retira `meta/llama-3.3-70b-instruct` el 25/08/2026.**
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
