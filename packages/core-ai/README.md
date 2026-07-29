# @central/core-ai

Núcleo IA compartido de la **casa de marcas** (ia.rest · SIVRA · IALIMP). Paquete
**piloto** de la Fase 1 de la unificación — ver `docs/HANDOFF-unificacion-casa-marcas.md`.

## Principio: identity-agnostic
El paquete **no lee `process.env` ni secretos**. La app consumidora construye la
config (con su propia `apiKey`) y la pasa. Así el mismo núcleo sirve a las 3 apps
sin acoplar credenciales ni auth.

## Superficie
Adaptadores de proveedor **puros**; la **política** (fallback, timeouts, modelo)
vive en cada app:
- `cleanJSON(raw)` — quita el ```` ```json ```` que envuelven algunos modelos.
- `nimText` / `nimChat` / `nimChatTools` / `nimVision` (config, …) — texto, chat
  multi-turno, function-calling y visión vía **NVIDIA NIM**.
- `groqText` / `groqChat` / `groqChatTools` (config, …) — espejo de los `nim*` sobre
  **Groq** (endpoint OpenAI-compat; default `openai/gpt-oss-120b`). Drop-in del
  cerebro de texto: **mismo Llama 3.3 70B que NIM, gratis** → fallback ideal.
- `geminiSearch(config, system, user, { maxTokens?, timeoutMs? })` — búsqueda web
  (Gemini + Google Search grounding); lanza error si falla (la app decide el fallback).
- `openrouterChat` / `openrouterChatEx` / `openrouterChatTools` (config, …) — **OpenRouter**
  (agregador OpenAI-compat, una key → cientos de modelos). Extras: fallback NATIVO entre
  modelos (`models: [...]`, conmuta solo en la misma petición), prompt caching del system
  (`cacheSystem`), proveedores no-training (`privacidad`), `response_format` (salida
  estructurada) y headers de atribución. `openrouterChatEx` devuelve además el modelo REAL
  usado y el `usage` (para auditar coste). `fetchImpl` inyectable (testeado).
- `geminiEmbed(config, texto)` — embeddings (text-embedding-004, 768 dims, free tier) para la
  caché semántica de la pasarela. Primer proveedor de embeddings del monorepo.
- `aiComplete(promptOrMessages, opts)` / `aiTools(messages, tools, opts)` — wrappers de
  **alto nivel** que leen el entorno y ya aplican la política de fallback de TEXTO:
  **OpenRouter (si hay `OPENROUTER_API_KEY`) → NIM → Groq → Gemini → Kimi**. Sin la key de
  OpenRouter la cadena es exactamente la clásica. Con `model` pinneado (id de NIM) el primario
  sigue siendo NIM y OpenRouter pasa a fallback. `opts.skipOpenRouter` lo desactiva por
  llamada (lo usa la pasarela, que gestiona OpenRouter con Director + presupuesto). Envs:
  `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`/`OPENROUTER_FALLBACK_MODELS` (csv), `GROQ_BRAIN_MODEL`, etc.
- Tipos: `ImageInput`, `NimConfig`, `GroqConfig`, `GeminiConfig`, `OpenRouterConfig`,
  `GeminiEmbedConfig` (+ tipos `Nim*` reutilizados por `groq*`/`openrouter*`).

Los **adaptadores** (`nim*`/`groq*`/`gemini*`/`openrouter*`) son puros; la **política** de fallback
vive en `aiComplete`/`aiTools` (camino env-aware) y en cada app (ia.rest: `src/lib/ai-client.ts`,
que además encadena con Gemini para búsqueda). La **visión sigue NIM-only** (Groq no tiene vision
model gratis equivalente).

## Consumo (Fase 0/1)
Se resuelve como fuente vía alias de `tsconfig` (`@central/core-ai`) + `transpilePackages`
en Next; pnpm workspaces (`workspace:*`) enlaza el paquete. Cuando se monte el monorepo turbo
completo, pasará a resolución de paquete real / build con turbo.
