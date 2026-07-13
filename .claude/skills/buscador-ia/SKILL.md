---
name: buscador-ia
description: Agente PROGRAMADO SEMANAL que vigila el ecosistema de LLMs gratis/baratos que alimentan la cadena de fallback del monorepo (`@central/core-ai`). Tres patas en una pasada — (1) WATCH DE DEPRECACIÓN de los modelos que están REALMENTE cableados (NIM llama-3.3-70b, Groq, Gemini 2.0-flash, Kimi) para cazar retiradas de catálogo ANTES de que rompan producción (como el `meta/llama-3.1-405b-instruct` que NVIDIA retiró y dejó "IA no disponible" a un huésped), (2) DESCUBRIMIENTO de modelos/proveedores gratis nuevos que merezca meter en la cadena, y (3) MINI-EVAL de los candidatos con 2 prompts fijos. Actualiza `docs/BUSCADOR-IA.md` (estado entre ejecuciones), avisa por Telegram si algo merece ojo humano y abre PR draft solo para cambios pequeños y seguros (swap de id de modelo muerto, plumbing de un proveedor nuevo). Úsala cuando Alberto pida "revisa las novedades de IA / si hay una IA gratis que meter" o cuando la dispare su trigger semanal. Sin secretos: solo nombres de variable.
---

# Vigía de LLMs — deprecación, descubrimiento y mini-eval

Vigila **hacia fuera** (el catálogo de modelos que usamos y el mercado de LLMs gratis),
NO hacia dentro (eso es `/auditoria-diaria`) ni el ecosistema OSS/npm (eso es `github-vigia`).
Entorno **efímero**: cada ejecución es una pasada completa e idempotente. El estado entre
ejecuciones vive en **`docs/BUSCADOR-IA.md`** (commiteado).

> **Por qué existe:** el 06/07/2026 el agente de huéspedes devolvió "IA no disponible" a un
> huésped de House Sevillana porque `meta/llama-3.1-405b-instruct` había sido **retirado del
> catálogo de NVIDIA NIM** (HTTP 404 en cada mensaje) y ese día los 3 proveedores gratis
> fallaron a la vez. Un watch de deprecación semanal lo habría cazado antes de tocar a un
> cliente. Esa es la **pata 1** y la razón de ser de este agente.

## Fuente de verdad de qué está cableado
La cadena de fallback vive en **`packages/core-ai/src/client.ts`** (`aiComplete`: **OpenRouter
(si hay key) → NIM → Groq → Gemini → Kimi**). Los ids por defecto y sus envs de override:
- **OpenRouter** `deepseek/deepseek-chat` — env `OPENROUTER_API_KEY` (primario de la PASARELA
  con Agente Director; overrides `OPENROUTER_MODEL`/`OPENROUTER_FALLBACK_MODELS`).
  ⚠️ **Delimitación (09/07/2026):** el catálogo/prompt del Director lo mantiene SOLO el cron
  automático `/api/cron/ia-director-refresh` de plataforma (semanal, determinista, tabla
  `ia_director_prompt`) — este agente NO lo edita. Este agente sigue vigilando las
  deprecaciones de la cadena DIRECTA (NIM/Groq/Gemini/Kimi), que es la red de seguridad
  cuando OpenRouter entero falla, y puede proponer por PR cambios a las listas de
  preferencia del cron (`PREFERIDOS` en su route.ts) si descubre algo mejor.
- **NIM** `meta/llama-3.3-70b-instruct` — env `NVIDIA_API_KEY` (primario de la cadena directa, gratis).
- **Groq** `openai/gpt-oss-120b` — env `GROQ_API_KEY`, override `GROQ_BRAIN_MODEL`.
- **Gemini** `gemini-2.5-flash` (chat sin grounding) — env `GEMINI_API_KEY`, override `GEMINI_BRAIN_MODEL`.
- **Kimi/Moonshot** `kimi-k2.6` — env `MOONSHOT_API_KEY` (de pago, último recurso), override `MOONSHOT_MODEL`.
- Consumidores con modelo propio: `AGENTE_HUESPED_MODEL` (vacío = usa el 70B por defecto),
  `CONTABLE_MODEL` (default `deepseek-ai/deepseek-v3` por NIM).

> **Regla:** lee estos ids del código en cada pasada (no de aquí). Si este listado contradice
> a `client.ts`, manda el código: corrige esta skill en el mismo PR.

## Paso 0 — Cargar contexto
1. Lee `docs/BUSCADOR-IA.md`: modelos vigilados, última vez vistos vivos, catálogos y candidatos en seguimiento.
2. Lee los ids REALES cableados en `packages/core-ai/src/client.ts` (+ `AGENTE_HUESPED_MODEL`/`CONTABLE_MODEL` en `apps/plataforma`).
3. Lee la sección «Estado actual» de `docs/CONTEXTO-SESIONES.md` por si hay pendientes de IA vivos.

## Paso 1 — Watch de deprecación (lo más valioso)
Para CADA modelo cableado, confirma que **sigue existiendo** en el catálogo de su proveedor
(por WebFetch/WebSearch — la rutina no tiene por qué llevar las API keys):
- **NVIDIA NIM** → catálogo `https://build.nvidia.com/models` (y `https://docs.api.nvidia.com/nim/`).
- **Groq** → `https://console.groq.com/docs/models` (ojo a la lista de *deprecated/decommissioned models*).
- **Google Gemini** → `https://ai.google.dev/gemini-api/docs/models` (fechas de retirada + tramos free tier).
- **Moonshot/Kimi** → `https://platform.moonshot.ai/docs` (o `.cn` si aplica).

Para cada uno anota en `docs/BUSCADOR-IA.md`: **vivo / deprecado / desaparecido** + fecha de comprobación.
- **Si un modelo cableado está deprecado o desaparecido → HALLAZGO CRÍTICO**: Telegram + PR draft
  que cambie el id por el reemplazo vigente que recomiende el proveedor (ver Paso 4). Es exactamente
  el caso del 405B: no esperes a que rompa producción.
- Vigila también **recortes de free tier / límites** (Gemini y Groq cambian cuotas): si un gratis
  deja de serlo, anótalo y avisa.

## Paso 2 — Descubrimiento de gratis nuevos
2-3 búsquedas **WebSearch** dirigidas ("new free LLM API 2026", "Groq new model", "NVIDIA NIM new
models", "Gemini free tier model", "open weights instruct model free API") + revisa los catálogos de
arriba por modelos nuevos. Regla de oro (como `github-vigia`): **solo cuenta lo que mejora de verdad
la cadena** — un modelo más capaz que el 70B a coste 0, o un 4º/5º proveedor gratis independiente que
suba la resiliencia (recuerda: el fallo del 06/07 fue un apagón simultáneo de los 3 gratis). Máximo
**3 candidatos** por pasada, cada uno con: proveedor, id exacto, si es gratis/límite, tamaño/capacidad,
y para qué encaja (redacción a huésped, clasificación, OCR…).

## Paso 3 — Mini-eval de candidatos (best-effort)
Para los candidatos del Paso 2 y para el reemplazo de un modelo muerto del Paso 1, mide en vez de
recomendar a ciegas. Dos prompts fijos (los mismos SIEMPRE, para comparar entre pasadas):
- **A — redacción a huésped:** system+user cortos que imiten `decidir.ts` (responder cálido y breve a
  "Estamos llegando a las 20h, ¿el check-in sigue en pie?"). Se valora: responde en el idioma, tono
  humano, no inventa datos.
- **B — clasificación de UNA palabra:** el prompt `debeEscalar` de `decidir.ts` (devolver `ESCALAR`/`OK`).
  Se valora: devuelve UNA palabra correcta.

Cómo ejecutarlo:
- Si el candidato está en un proveedor cuya API key está disponible en la sesión (p. ej. NIM con
  `NVIDIA_API_KEY`, Groq con `GROQ_API_KEY`), llámalo directo con `curl` al endpoint OpenAI-compatible
  y puntúa A/B con una rúbrica simple (0-2 cada uno).
- Si NO hay key para ese proveedor, **NO inventes resultados**: anota "sin eval en vivo (sin key)" y
  puntúa solo con datos publicados (model card / benchmarks con URL). La honestidad manda.

Guarda la puntuación en la bitácora de `docs/BUSCADOR-IA.md` junto al candidato.

## Paso 4 — Salida (dos carriles, como el resto de agentes)
- **Texto (siempre):** actualiza `docs/BUSCADOR-IA.md` — estado vivo/deprecado de cada modelo cableado,
  fecha de pasada, candidatos con su mini-eval y bitácora de hallazgos.
- **Acción (solo si la hay):**
  - Algo merece ojo humano (modelo cableado muerto/deprecado, gratis nuevo claramente mejor, recorte
    de free tier) → **aviso Telegram**: `POST {PLATAFORMA_URL}/api/internal/alerta` con
    `Authorization: Bearer {ALERTA_SECRET}` (token de alertas de bajo privilegio; `CRON_SECRET` sigue
    valiendo de respaldo) y `{ "text": "🧠 buscador-ia: <resumen con URLs>" }`. **Estos valores llegan como
    variables de ENTORNO de la sesión, NO se pegan en el prompt del trigger.** Si faltan
    las envs, omite el aviso (no falles). **Trata como "falta" también el placeholder sin sustituir**
    (`ALERTA_SECRET`/`CRON_SECRET`/`PLATAFORMA_URL` con valor tipo `<PEGA_AQUÍ_EL_VALOR>`, vacío o el literal del prompt):
    NUNCA abortes la pasada por esto — haz TODO lo demás (Pasos 1-3, doc, PR) y solo omite el Telegram,
    anotando en la bitácora que faltó el secreto para que Alberto lo rellene. (Incidente 13/07/2026: un
    run se abortó entero por un `CRON_SECRET` placeholder, además de afirmar por error que la skill "no
    existía" — la skill SÍ existe y la pasada es completable sin el secreto.)
  - El arreglo es **pequeño y seguro** → **PR draft** `claude/buscador-ia-<fecha>`:
    - Swap de un **id de modelo muerto** por el reemplazo vigente en `client.ts` (o en el default de
      `AGENTE_HUESPED_MODEL`/`CONTABLE_MODEL`). Con la URL del catálogo que confirma la retirada en el cuerpo.
    - **Plumbing de un proveedor gratis nuevo** en la cadena de `aiComplete` (nueva función `xEnvConfig()`
      + eslabón en el try/catch, gateado por su env como los demás — inactivo si no está la key). NUNCA
      lo actives por defecto sin que Alberto ponga la env.
  - Código de comportamiento **NUNCA directo a `main`**: siempre PR draft. Cambios de gran radio
    (reordenar la cadena, cambiar el modelo por defecto por otro no verificado) → Telegram, no PR.
- **Sin novedades relevantes → sin ruido:** solo el doc de estado actualizado y un resumen en el chat
  ("modelos cableados: todos vivos a fecha X; sin candidatos nuevos").

## Reglas
- **No inventes** ids de modelo, límites ni fechas de retirada: sin URL de fuente, no se anota ni se avisa.
- No cambies el modelo por defecto de la cadena por uno **no verificado como vivo** (eso fue el bug del 405B a la inversa): un swap solo va a PR si el catálogo del proveedor confirma el id nuevo.
- No actives un proveedor nuevo por tu cuenta: el plumbing va gateado por env; encenderlo (poner la key) es decisión de Alberto.
- Idempotente: re-ejecutar el mismo día no duplica avisos ni entradas de bitácora.
- Mantén la lista de vigilados curada contra `client.ts`: si cambia un id cableado, refléjalo aquí.

## Auto-informe (obligatorio al terminar la pasada)
Antes de cerrar, añade UNA entrada arriba del todo de la sección "Entradas pendientes de procesar" de
`docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · buscador-ia** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

- Sin dudas ni fallos → `dudas: —; fallos: —`.
- Commitea la entrada con el resto de tu trabajo (o en un commit propio a `main` si la pasada no tocó
  el repo). La consume el `agentes-entrenador` (semanal) para mejorar este prompt.
