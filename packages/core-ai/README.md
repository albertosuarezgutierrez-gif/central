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
- Tipos: `ImageInput`, `NimConfig`, `GroqConfig`, `GeminiConfig` (+ tipos `Nim*` reutilizados por `groq*`).

La **política** (fallback de texto **NIM → Groq**, timeouts, selección de modelo) se
queda en cada app (ia.rest: `src/lib/ai-client.ts`), que envuelve esta superficie. La
visión sigue NIM-only (Groq no tiene vision model gratis equivalente).

## Consumo (Fase 0/1)
Se resuelve como fuente vía alias de `tsconfig` (`@central/core-ai`) + `transpilePackages`
en Next; pnpm workspaces (`workspace:*`) enlaza el paquete. Cuando se monte el monorepo turbo
completo, pasará a resolución de paquete real / build con turbo.
