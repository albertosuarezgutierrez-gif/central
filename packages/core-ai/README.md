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
  **Groq** (endpoint OpenAI-compat; default `llama-3.3-70b-versatile`). Drop-in del
  cerebro de texto: **mismo Llama 3.3 70B que NIM, gratis** → fallback ideal.
- `geminiSearch(config, system, user, { maxTokens?, timeoutMs? })` — búsqueda web
  (Gemini + Google Search grounding); lanza error si falla (la app decide el fallback).
- `aiComplete(promptOrMessages, opts)` / `aiTools(messages, tools, opts)` — wrappers de
  **alto nivel** que leen el entorno (`NVIDIA_API_KEY`, `GROQ_API_KEY`) y ya aplican la
  política de fallback de TEXTO **NIM → Groq** (gratis, mismo Llama 3.3 70B). Los usan las
  verticales que no inyectan config (sivra/ialimp/plataforma) y la **pasarela** de plataforma
  (`/api/ai/{chat,tools}`). Override de modelo Groq: `GROQ_BRAIN_MODEL`.
- Tipos: `ImageInput`, `NimConfig`, `GroqConfig`, `GeminiConfig` (+ tipos `Nim*` reutilizados por `groq*`).

Los **adaptadores** (`nim*`/`groq*`/`gemini*`) son puros; la **política** de fallback vive en
`aiComplete`/`aiTools` (camino env-aware, NIM → Groq) y en cada app (ia.rest: `src/lib/ai-client.ts`,
que además encadena con Gemini para búsqueda). La **visión sigue NIM-only** (Groq no tiene vision
model gratis equivalente).

## Consumo (Fase 0/1)
Se resuelve como fuente vía alias de `tsconfig` (`@central/core-ai`) + `transpilePackages`
en Next; pnpm workspaces (`workspace:*`) enlaza el paquete. Cuando se monte el monorepo turbo
completo, pasará a resolución de paquete real / build con turbo.
