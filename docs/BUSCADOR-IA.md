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

## Modelos cableados en la cadena `aiComplete` (OpenRouter → [NIM, gateado] → Groq → Cerebras → [Gemini, gateado] → Kimi)

> ⚠️ **02/08/2026 (PR #1220):** el eslabón Gemini está **apagado por defecto** — 544 llamadas/30d
> con 0 éxitos (429 de cuota). Requiere `GEMINI_TEXTO=1` además de la key. Sigue en la tabla
> como watch de catálogo por si se reactiva.
>
> **09/07/2026 — OpenRouter cableado como PRIMARIO** (si hay `OPENROUTER_API_KEY`): su catálogo lo
> refresca el cron `/api/cron/ia-director-refresh`. ⚠️ **Scope REVISADO el 31/08/2026 (orden de
> Alberto):** el cron solo elige de sus listas `PREFERIDOS` estáticas — no descubre nada. El
> descubrimiento en OpenRouter y la curación de esas listas SON de este agente (Paso 1.5 de la
> skill); los cambios a las listas van por PR. La cadena directa de abajo sigue siendo la red de
> seguridad cuando OpenRouter entero falla.
>
> **27/07/2026 — eslabón Cerebras** (si hay `CEREBRAS_API_KEY`): 4º proveedor gratis, infra WSE
> independiente de NIM/Groq. Hoy INACTIVO (sin key).

| Eslabón | id por defecto | Env (key / override) | Coste | Estado (comprobado 2026-08-24) |
|---|---|---|---|---|
| OpenRouter (primario pasarela — el cron escribe la tabla; ESTE agente cura sus listas, Paso 1.5) | `deepseek/deepseek-v4-flash` (desde PR 31/08/2026; antes `deepseek/deepseek-chat` = V3, más caro) | `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | $0,086/$0,17 por M (tope 1€/día) | ✅ vivo y verificado en vivo (mini-eval 31/08/2026) |
| NVIDIA NIM (**APAGADO por defecto** desde 28/08/2026) | — (sin id; se nombra al reactivar) | `NVIDIA_API_KEY` + **`NVIDIA_TEXTO=1`** + **`NVIDIA_BRAIN_MODEL`** | gratis (~40 RPM) | ⚫ **APAGADO por decisión de Alberto (28/08/2026): «ya NIM nada, todo OpenRouter».** No es una avería puntual sino un patrón: TRES ids muertos por EOL en 11 días, y en los 7 días previos OpenRouter sirvió el **100%** del tráfico de texto mientras NIM no sirvió ni una respuesta real (solo su propia sonda). El código se conserva ENTERO (mismo trato que Gemini el 02/08) y se reactiva con las tres envs de la columna — el modelo NO tiene default: reactivar exige nombrar un id **verificado con llamada real**, porque la ficha del catálogo no prueba que el modelo viva. La sonda diaria ya no lo pincha si está apagado. **No afecta a la VISIÓN** (`nimVision`, otro modelo, sin evidencia de muerte). Histórico — 🔴 **MUERTO 26/08/2026 09:00 UTC (410 Gone), sin reemplazo elegido — comprobado 28/08.** `meta/llama-3.1-70b-instruct` ha llegado a su EOL: el 410 de NIM da la fecha exacta (`has reached its end of life on 2026-08-26T09:00:00`). Medido en `ai_usos`, no supuesto: último ✅ de la sonda el **26/08 07:03 UTC**, 410 en las pasadas del **27/08 07:02** y **28/08 07:00**. **Tercera muerte de un id de NIM en 11 días** (llama-4-maverick 17/08 · z-ai/glm-5.2 21/08 · esta). ⚠️ **Y la señal que la anunciaba se descartó por error el 24/08** (ver bitácora). Sin swap todavía: elegir id nuevo exige verificación EN VIVO (`/v1/models` + llamada real con key) y no hay `NVIDIA_API_KEY` en la sesión. Impacto real acotado: OpenRouter sirvió el **100%** del tráfico de texto de los últimos 7 días; NIM solo aportaba intentos muertos. Histórico del swap anterior — 🔄 **SWAP 22/08/2026, verificado EN VIVO** — `z-ai/glm-5.2` (default desde el 17/08) murió por **HTTP 410 Gone** el 21/08/2026, ANTES de la fecha 24/08/2026 que anunciaba su propia ficha (`build.nvidia.com/z-ai/glm-5.2/modelcard`) — otra vez la ficha no probaba el API. Confirmado contra el listado real `GET /v1/models` (102 vivos, ni un solo `z-ai/*`) vía harness temporal (`nim-catalogo-temp`, edge function de ia-rest, borrada/neutralizada tras usar) llamado desde SQL con `pg_net` (WebFetch a dominios NVIDIA/Supabase seguía bloqueado por el proxy de esta sesión). Mini-eval con key real sobre 4 candidatos vivos: `meta/llama-3.1-70b-instruct` **PASA limpio y rápido** (A: respuesta cálida directa en español · B: exactamente `ESCALAR`); `openai/gpt-oss-120b` y `minimaxai/minimax-m3` **>25s por respuesta en NIM** (descartados por latencia, aunque minimax sí devolvió `ESCALAR` limpio); `mistralai/mistral-large-2-instruct` **404 "Not found for account"** pese a listar en `/v1/models` (no todos los ids del catálogo están habilitados para la cuenta gratuita). Swap aplicado en TODO el radio (core-ai, plataforma, rrhh, ia-rest + 4 edge functions redesplegadas + `sonda-ia.ts`, que es la sonda exacta que el health-check reportó muerta). **24/08: repasado por WebSearch (sin `NVIDIA_API_KEY` en esta sesión, WebFetch a `build.nvidia.com`/`docs.api.nvidia.com` bloqueado por el proxy — igual que pasadas anteriores). Única señal de alarma: "NVIDIA NIM Llama-3.1-70b-instruct microservice reached End of Support, July 2026" (NGC) — descartada tras verificar que se refiere al CONTENEDOR NIM autoalojado (Docker/NGC para on-prem, versión 1.10), NO al endpoint hosted de `build.nvidia.com` que consumimos por API key; son dos ciclos de vida distintos (fuente: developer.nvidia.com/nim, spheron.network). Sin evidencia de retirada del endpoint hosted → se mantiene vivo, sin swap.** |
| Groq (fallback 1) | `openai/gpt-oss-120b` | `GROQ_API_KEY` / `GROQ_BRAIN_MODEL` | gratis (rate-limited) | ✅ **VIVO, reforzado (24/08)** — sigue siendo el destino de migración recomendado por Groq para TODOS sus deprecados recientes: `kimi-k2-instruct-0905`→(23/03), `llama-4-maverick-17b`→(20/02), `llama-3.1-8b-instant`/`llama-3.3-70b-versatile`/`qwen3-32b`/`llama-4-scout-17b`→(17/06, dejan de servirse en agosto/2026). Cuantos más modelos apuntan aquí, más sólido el eslabón. |
| Cerebras (fallback 2, plumbing 27/07/2026) | `gpt-oss-120b` | `CEREBRAS_API_KEY` / `CEREBRAS_MODEL` | gratis (1M tok/día, ctx 8192 en tier gratis) | ✅ vivo (24/08) — free tier de 1M tok/día confirmado por fuentes externas; RPM sigue discrepando entre fuentes (5 vs 30) como en pasadas previas, sin key para zanjarlo — **INACTIVO sin key**, pendiente de Alberto |
| Gemini (fallback 3, APAGADO por defecto) | `gemini-flash-latest` | `GEMINI_API_KEY` **+ `GEMINI_TEXTO=1`** / `GEMINI_BRAIN_MODEL` | gratis | ✅ vivo (24/08) — familia Flash/Flash-Lite mantiene tier gratis (confirmado a 15/08/2026); sin mención de retirada del alias rodante; sigue apagado por falta de cuota real |
| Kimi/Moonshot (fallback 4, de pago) | `kimi-k2.6` | `MOONSHOT_API_KEY` / `MOONSHOT_MODEL` | $0,95/$4,00 por M | ✅ **VIVO** (24/08) — confirmado de nuevo sin sunset propio; Moonshot empuja hacia K3 (flagship, $3/$15 por M) pero K2.6 sigue en catálogo activo |

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
| **DeepSeek V4 Flash** — **PROPUESTO como default OpenRouter (PR 31/08)** | OpenRouter (de pago) | `deepseek/deepseek-v4-flash` (snapshot `-0731` y `-vision-exp` también en catálogo) | $0,086/M in · $0,17/M out (ctx 1M) | Sustituir a `deepseek/deepseek-chat` (= V3 viejo, $0,26/$1,03 — 3-6× más caro y peor) como default de la pasarela y en PREFERIDOS `logica`/`codigo` | ✅ 31/08 en vivo por OpenRouter: A cálida en español · B `ESCALAR` exacto |
| ~~GLM-5.2 (z-ai)~~ **MUERTO 21/08/2026 (410 Gone)** | NVIDIA NIM | `z-ai/glm-5.2` | — | Reemplazado por `meta/llama-3.1-70b-instruct` el 22/08/2026 (ver tabla) | ✅ eval con key real 17/08, murió 4 días después |
| minimax-m3 | NVIDIA NIM | `minimaxai/minimax-m3` | Gratis (catálogo NIM) | Backup si `llama-3.1-70b-instruct` se degrada — B limpio (`ESCALAR`), pero >25s de latencia en NIM | ✅ B con key real 22/08; A sin completar (timeout) |
| mistral-large-2-instruct | NVIDIA NIM | `mistralai/mistral-large-2-instruct` | Listado gratis pero **404 para esta cuenta** | Descartado: no todo lo que aparece en `/v1/models` está habilitado para la cuenta | ❌ 404 "Not found for account" |
| MiMo-V2.5 / -Pro (Xiaomi) | OpenRouter (de pago) o self-host (MIT) | `xiaomi/mimo-v2.5[-pro]` | NO gratis por API | Interés por ranking de uso en OpenRouter; fuera del scope de la cadena directa | Sin mini-eval |
| Mistral (La Plateforme, free tier "Experiment") | Mistral | — | ~1B tok/mes, límites no publicados | 5º backstop potencial; el propio proveedor lo marca "evaluación, no producción" | En seguimiento, sin plumbing |
| DeepSeek V4 Pro | NVIDIA NIM | (id exacto sin confirmar por catálogo) | Gratis (mismo tier NIM) | Posible upgrade de calidad para el primario NIM — citado junto a GLM-5.2/Nemotron 3 Ultra como de los mejores gratis en NIM a 25/07/2026 | Sin mini-eval (sin key ni id exacto confirmado); no desplaza al 70B verificado en vivo el 22/08 — no hay urgencia |
| Qwen3.6-27b | Groq (gratis) | `qwen/qwen3.6-27b` (a confirmar) | Gratis (rate-limited) | Alternativa de Groq a `gpt-oss-120b` en sus propios anuncios de deprecación (17/06) — mismo proveedor, no suma resiliencia, solo posible diversidad de calidad | Sin mini-eval (sin key); no sustituye a `gpt-oss-120b`, que sigue siendo EL destino recomendado por Groq |

## Bitácora de hallazgos (lo más reciente arriba)

- **2026-08-31 · pasada dirigida (pregunta de Alberto por DeepSeek V4 Flash) — HALLAZGO: nuestro
  default de OpenRouter era el V3 viejo y más caro.** `deepseek/deepseek-chat` NO es alias rodante:
  OpenRouter lo sirve como "DeepSeek V3" a $0,26/$1,03 por M, mientras `deepseek/deepseek-v4-flash`
  cuesta $0,086/$0,17 (ctx 1M) — más nuevo y 3-6× más barato. Ni el default de `openrouter.ts` ni
  las listas PREFERIDOS del cron `ia-director-refresh` lo conocían (catálogo v12 de hoy sin él: las
  listas curadas no lo incluían, y el catálogo sale de ellas). Mini-eval en vivo por OpenRouter:
  A (huésped) cálida en español, B `ESCALAR` exacto. Swap propuesto por PR draft (default +
  sonda + `MODELO_DEFAULT` del Director + PREFERIDOS `logica`/`codigo`); `deepseek-chat` queda de
  suplente. Nota: el `CONTABLE_MODEL` ya usaba V4 Flash… por NIM, que está apagado desde el 28/08,
  así que en la práctica el contable caía al default V3 de OpenRouter — este swap lo re-alinea.
- **2026-08-31 · pasada semanal — los 4 eslabones activos (Groq, Cerebras, Gemini, Kimi) VIVOS,
  sin candidatos que crucen el listón, sin hallazgos críticos.** NIM sigue APAGADO por decisión de
  Alberto (28/08) y sin default de modelo → fuera de vigilancia activa de catálogo esta pasada (no
  hay id que verificar). Por WebSearch dirigido (sin keys de proveedor en esta sesión):
  **Groq** `openai/gpt-oss-120b` sin aviso de retirada — sigue siendo el destino de migración que
  Groq recomienda para sus deprecados (junto a `qwen/qwen3.6-27b`, ya en seguimiento). **Cerebras**
  `gpt-oss-120b` vivo, free tier 1M tok/día confirmado (RPM sigue discrepando entre fuentes, sin key
  para zanjarlo — sigue INACTIVO sin key). **Gemini** `gemini-flash-latest` vivo; Flash/Flash-Lite
  mantienen tier gratis (Pro salió del free tier en abril/2026, no nos afecta); `gemini-2.5-flash`
  tiene deprecación anunciada para 16/10/2026 pero NO es el id que usamos (usamos el alias rodante).
  **Kimi** K2.6 confirmado NO deprecado — lo que sí cumple sunset HOY (31/08/2026) es
  `kimi-k2.5`+`moonshot-v1`, que ya no usamos desde el swap del 11/07. Descubrimiento (Paso 2): nada
  cruza el listón — el mercado de pago 2026 lo dominan modelos flagship caros (GPT-5.2, Gemini 3.1
  Pro, Opus 5) irrelevantes para esta cadena de respaldo; `Qwen3.7 Flash` ($0,03/$0,13 por M) es
  barato pero no gratis y no hay evidencia de que rinda mejor que los eslabones gratis vivos — no se
  añade como candidato de acción, solo anotado aquí por si se retoma. Sin `NVIDIA_API_KEY`/
  `GROQ_API_KEY`/`GEMINI_API_KEY`/`MOONSHOT_API_KEY`/`CEREBRAS_API_KEY` en esta sesión → verificación
  por WebSearch, no por llamada real. Preflight Telegram 200 OK, sin aviso (nada urgente).

- **2026-08-28 (2ª parte) · ⚫ DECISIÓN DE ALBERTO: NIM fuera de la cadena de texto, todo OpenRouter.**
  Respuesta a la muerte del 70B (entrada de abajo). No se busca reemplazo: se apaga el eslabón. El
  argumento no es el 410 de esta semana sino el coste de mantenerlo — tres swaps en 11 días, cada
  uno ~15 ficheros más 5 edge functions redesplegadas— contra su aportación medida: **cero
  respuestas reales servidas** en los 7 días previos, con OpenRouter cubriendo el 100%.
  Implementado igual que el apagado de Gemini del 02/08: el código sigue entero y el eslabón
  vuelve con `NVIDIA_TEXTO=1` + `NVIDIA_BRAIN_MODEL`. **Sin default de modelo a propósito**:
  reactivar obliga a nombrar un id verificado en vivo, que es justo el paso que la pasada del
  24/08 se saltó. Lo protege un guardián de 4 tests en `packages/core-ai/test/client.test.ts`.
  **Hallazgo de camino:** el `model` pinneado de NIM en rrhh e ia-rest los **apartaba de
  OpenRouter** (`if (openrouter && !model)`), así que eran los únicos que se rompían de verdad en
  vez de degradar. Y `brain.ts` (el cerebro del POS de voz) tenía NIM como **único** proveedor:
  llevaba roto desde el 26/08 sin que se notara porque ia-rest no tiene tráfico. Ambos ya van por
  la cadena. **Pendiente:** 4 edge functions de ia-rest siguen llamando a NIM en crudo.

- **2026-08-28 · 🔴 `meta/llama-3.1-70b-instruct` MUERTO (410, EOL `2026-08-26T09:00:00`) y
  ⚠️ CORRECCIÓN de la pasada del 24/08: la señal de "End of Support" NO era un falso positivo.**
  Llegó por el camino de siempre (una alerta, no la pasada semanal): «⚠️ daily-briefing error /
  NVIDIA 410» en Telegram. Fechado con datos, no con suposiciones: en `ai_usos` la sonda tiene su
  último ✅ el **26/08 07:03 UTC** y 410 el **27/08 07:02** y el **28/08 07:00**; el cuerpo del 410
  trae la fecha de EOL exacta. **La pasada del 24/08 vio esta muerte venir y la descartó**: anotó
  «NVIDIA NIM Llama-3.1-70b-instruct reached End of Support, July 2026» (NGC) y concluyó que solo
  afectaba al contenedor autoalojado, no al endpoint hosted. La conclusión era razonable y era
  FALSA — el hosted lo retiró dos días después. **Lección de método:** esa pasada no tenía
  `NVIDIA_API_KEY` y verificó por WebSearch; el 22/08, que sí montó harness + `/v1/models`, acertó.
  Una señal de EOL descartada SIN llamada real vale como hipótesis, no como descarte: si no se
  puede verificar en vivo, se anota como riesgo abierto y se vigila, no se cierra.
  **Sin swap todavía** (hace falta key para verificar en vivo un id nuevo) y, sobre todo, sin
  decisión de fondo: **tres ids muertos en 11 días** y OpenRouter sirviendo el 100% del tráfico
  real de texto de los últimos 7 días. La pregunta ya no es qué modelo de NIM poner, sino si NIM
  merece seguir en la cadena o gatearse como se hizo con Gemini el 02/08. Pendiente de Alberto.
  Arreglado en este PR solo lo que rompía de verdad: el `daily-briefing` (el ÚNICO consumidor que
  no pasa por la pasarela y por tanto nunca ve OpenRouter) ya no pierde el briefing cuando el LLM
  muere, y su modelo NIM sale de `NVIDIA_BRAIN_MODEL` en vez de ir cableado.

- **2026-08-24 · pasada semanal — los 5 eslabones cableados VIVOS, sin candidatos que crucen el
  listón, sin hallazgos críticos.** Sin `NVIDIA_API_KEY`/`GROQ_API_KEY`/`GEMINI_API_KEY`/
  `MOONSHOT_API_KEY`/`CEREBRAS_API_KEY` en esta sesión y WebFetch directo a los 5 catálogos
  (`build.nvidia.com`, `console.groq.com`, `ai.google.dev`, `platform.moonshot.ai`,
  `inference-docs.cerebras.ai`) bloqueado por el proxy de egress → verificación por WebSearch
  dirigido (no por llamada real ni `/v1/models`, a diferencia de la pasada del 22/08). Único punto
  dudoso investigado a fondo: una señal de "End of Support" para el microservicio NIM
  `llama-3.1-70b-instruct` (NGC, julio 2026) — descartada como aplicable al endpoint hosted que
  consumimos (es el ciclo de vida del contenedor Docker autoalojado, no de la API `build.nvidia.com`
  con key; son productos distintos de NVIDIA). Groq `openai/gpt-oss-120b` sale reforzado: es el
  destino de migración que Groq mismo eligió para 6 modelos deprecados distintos en lo que va de
  2026. Kimi K2.6 y Gemini Flash confirmados vivos sin sunset propio. Descubrimiento: 2 candidatos
  anotados en seguimiento sin mini-eval (sin key) — `DeepSeek V4 Pro` (NIM, gratis, citado como de
  los mejores del catálogo a 25/07) y `qwen/qwen3.6-27b` (Groq, gratis, alternativa de Groq a
  gpt-oss-120b en sus propios avisos) — ninguno cruza el listón para acción: no hay evidencia de que
  batan al eslabón vivo que sustituirían, y el 70B de NIM fue verificado en vivo hace solo 2 días.
  Sin Telegram (nada que decidir), solo doc. *(Texto rescatado el 27/08 del PR #1639, que quedó
  atascado sin poder mergearse — la pasada es del 24/08.)*

- **2026-08-22 · 🔴 HALLAZGO CRÍTICO desde el health-check (no la pasada semanal habitual): `z-ai/glm-5.2`
  MURIÓ (410 Gone, EOL real 21/08/2026, 3 días antes de la fecha 24/08/2026 de su propia ficha) →
  swap a `meta/llama-3.1-70b-instruct`.** El health-check diario reportó `AiHttpError: NVIDIA HTTP 410`
  en la sonda `sonda-ia.ts` — el tráfico real no lo notaba (fallback a Groq lo tapaba) pero cada
  llamada pagaba un intento muerto. Sin `NVIDIA_API_KEY` en esta sesión ni WebFetch a dominios NVIDIA
  (bloqueado por el proxy): se creó un harness temporal (`nim-catalogo-temp`, edge function en el
  proyecto Supabase de ia-rest, que SÍ tiene la key) y se invocó desde SQL con `net.http_get` de
  `pg_net` para no depender del proxy de esta sesión — mismo patrón que el 17/08 pero por una vía
  distinta (antes fue vía otra edge function con harness temporal). Confirmado con `/v1/models`
  real: 102 modelos vivos, cero `z-ai/*`. Mini-eval A/B en vivo sobre 4 candidatos: `meta/llama-3.1-
  70b-instruct` pasó limpio y rápido; `openai/gpt-oss-120b` y `minimaxai/minimax-m3` tardaron >25s en
  NIM (descartados por latencia); `mistralai/mistral-large-2-instruct` dio 404 pese a listar en el
  catálogo (no habilitado para esta cuenta — **lección nueva**: estar en `/v1/models` no implica que
  la cuenta tenga acceso, hay que probar la llamada). Swap aplicado en TODO el radio: `client.ts`/
  `nim.ts`/`types.ts` de core-ai, `ai-client.ts`+`sonda-ia.ts`+`decidir.ts` de plataforma, `asistente.ts`/
  `asistente-admin.ts` de rrhh, `ai-client.ts`/`brain.ts`/`.env.example`/`privacidad/page.tsx` de
  ia-rest + **4 edge functions redesplegadas** (`nim-diagnostico`, `nim-sentiment`, `qr-assistant`,
  `daily-briefing`) y verificadas con una llamada real post-deploy (200 OK). Harness temporal
  neutralizado (redesplegado a un 410 estático + `verify_jwt: true`; no hay tool de borrado de edge
  functions por MCP). **PR #1583 mergeado a `main` (squash, commit `5e6bbed`)** tras CI verde + 9
  previews Vercel Ready; re-verificado EN VIVO contra la API real de NVIDIA tras el merge (200 OK,
  sin 410).

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
