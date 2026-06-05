# IA en ia.rest — búsqueda web, proveedores y opciones de futuro

> Doc de referencia tras sacar Anthropic del camino crítico (cuenta sin saldo).
> Resume qué proveedor usa cada cosa, qué quedó pendiente y las opciones para el futuro.

## Arquitectura IA actual (`src/lib/ai-client.ts`)

| Función | Proveedor | Para qué | Fallback |
|---|---|---|---|
| `callAI(system, user, maxTokens, timeoutMs, noFallback=true)` | **NVIDIA NIM** (llama-3.3-70b) | Generación, clasificación, extracción, resúmenes (sin internet) | Anthropic Haiku **solo si `noFallback=false` explícito** |
| `callAISearch(system, user, maxTokens, timeoutMs)` | **Gemini 2.0 Flash + Google Search grounding** | Cuando hace falta **buscar en internet** (leads, research, locales) | `callAI` (NIM puro) sin búsqueda |
| `callAIVision(...)` | **NIM Vision** | Imágenes (carta, albarán, etiquetas) | Anthropic Vision solo si `noFallback=false` |

**Regla:** `noFallback=true` es el **default** (Anthropic está sin saldo; caer a él solo da
"credit balance too low"). Para reactivar el fallback cuando haya crédito → pasar `false`
explícito. Quedan 2 usos deliberados con `false`: `src/lib/fuzzy-comanda.ts` (alias fonéticos,
auxiliar con try/catch) y `src/app/api/owner/carta/route.ts` (vision carta onboarding).

**`GEMINI_API_KEY`** debe estar en Vercel (de ella depende `callAISearch`). Ya operativa
(la usa `cron/lead-onboarding`). Añadida a `.env.example` como referencia.

## Qué se migró fuera de Anthropic (jun 2026)
- `cron/prospeccion-leads`, `cron/completar-locales`, `super/leads`,
  `super/leads/[id]/locales/buscar`: búsqueda de grupos/locales → `callAISearch` (Gemini).
- `cron/blog-seo`: generación de artículos → `callAI` (NIM).
- Lead Hunter modos **caption** y **email**: antes hacían `fetch` directo a `api.anthropic.com`
  **desde el navegador y sin API key** (rotos siempre) → ahora van por
  `POST /api/super/lead-hunter` (modos `caption` / `email`) con `callAI`.

## Lo que SIGUE dependiendo de Anthropic (no migrado)
Estos son **agénticos de verdad**: bucle multi-turno con tool-use que NIM/Gemini-grounding no
replican. Tienen **guarda de degradación** (muestran aviso limpio "no disponible", no revientan):

| Endpoint | Qué hace | Por qué necesita Anthropic |
|---|---|---|
| `super/agentes-seo` | Análisis SEO con datos reales | bucle ≤10; tools `web_search` + `get_gsc_data` + `get_ga4_data` |
| `super/agente-arquitecto` | Revisión de código + Drive | bucle ≤8; tools GitHub (leer) + Drive (leer/escribir) |
| `super/agentes-ai` | Asistente admin con búsqueda | 2 turnos con `web_search` (el más fácil de migrar a `callAISearch`) |

**Para revivirlos** (cuando interese): (1) recargar crédito Anthropic; (2) reconstruir el loop
de tool-use sobre un proveedor con *function calling* (NIM/OpenAI-compat o Gemini function
calling) + un buscador (ver abajo); (3) exponerlos como **MCP** y orquestar desde un cliente.

## Opciones de BÚSQUEDA WEB (si se quiere salir de Gemini grounding)
- **Gemini google_search grounding** — actual, ya integrado en `callAISearch`, sin infra. ✅ default.
- **SearXNG** — metabuscador **open source**, self-host (un contenedor), sin API key; agrega
  Google/Bing/DDG/Brave. Consultas su API JSON y das resultados al LLM. Control total, 0 € de API.
- **Tavily** — API pensada para agentes LLM, free ~1.000/mes. La más cómoda de integrar.
- **Brave Search API / Serper.dev** — resultados de buscador, baratas y fiables.
- **DuckDuckGo (`ddgs`)** — sin key pero frágil/rate-limited.
Patrón en todos: el LLM no busca; tu código busca y le pasa los snippets (RAG/tool).

## Opciones de SELF-HOSTING del LLM (dejar NVIDIA NIM)
Solo si hay motivo de coste/privacidad/control. Requiere GPU seria para un 70B
(~1×80GB cuantizado o 2×A100/H100). Para la fase actual **no compensa**: NIM ya funciona,
gratis y sin ops.
- **vLLM** — estándar maduro, gran comunidad, API OpenAI-compatible, PagedAttention. Opción segura.
- **SGLang** — más nuevo y más rápido (RadixAttention / prefix caching), **mejor en salida
  estructurada/JSON y agentes** y alta concurrencia. Encaja con una app con mucho JSON como
  ia.rest, a cambio de ecosistema algo menor.
- Ninguno aporta búsqueda web (es ortogonal): se combinaría con un buscador de la lista de arriba.

## Resumen de decisión
Hoy: **NIM** (texto/visión) + **Gemini grounding** (búsqueda) cubren el pipeline sin Anthropic
ni coste extra. Anthropic queda solo para 3 agentes admin (con aviso limpio si no hay saldo).
Self-hosting (vLLM/SGLang) y buscadores OSS (SearXNG) quedan como opciones de futuro, no urgentes.
