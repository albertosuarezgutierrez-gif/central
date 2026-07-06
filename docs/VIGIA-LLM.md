# 🧠 Vigía de LLMs — estado entre ejecuciones

> Estado vivo del agente `llm-vigia` (skill `.claude/skills/llm-vigia`). Cada pasada semanal
> actualiza este doc: modelos cableados (vivos/deprecados), catálogos comprobados, candidatos
> gratis en seguimiento y bitácora de hallazgos. **Fuente de verdad de qué está cableado:**
> `packages/core-ai/src/client.ts` — este doc lo refleja, no lo sustituye.

## Modelos cableados en la cadena `aiComplete` (NIM → Groq → Gemini → Kimi)

| Eslabón | id por defecto | Env (key / override) | Coste | Última vez visto VIVO |
|---|---|---|---|---|
| NVIDIA NIM (primario) | `meta/llama-3.3-70b-instruct` | `NVIDIA_API_KEY` | gratis | — (pendiente 1ª pasada) |
| Groq (fallback 1) | `llama-3.3-70b-versatile` | `GROQ_API_KEY` / `GROQ_BRAIN_MODEL` | gratis | — |
| Gemini (fallback 2) | `gemini-2.0-flash` | `GEMINI_API_KEY` / `GEMINI_BRAIN_MODEL` | gratis | — |
| Kimi/Moonshot (fallback 3) | `kimi-k2-0711-preview` | `MOONSHOT_API_KEY` / `MOONSHOT_MODEL` | de pago | — |

**Consumidores con modelo propio:**
- `AGENTE_HUESPED_MODEL` — **vacío por defecto** (usa el 70B de la cadena). *(Antes `meta/llama-3.1-405b-instruct`, RETIRADO de NIM → causó "IA no disponible"; ver abajo.)*
- `CONTABLE_MODEL` — default `deepseek-ai/deepseek-v3` (NIM).

## Catálogos a comprobar cada pasada
- NVIDIA NIM — https://build.nvidia.com/models
- Groq — https://console.groq.com/docs/models (mirar *deprecated/decommissioned*)
- Google Gemini — https://ai.google.dev/gemini-api/docs/models (retiradas + free tier)
- Moonshot/Kimi — https://platform.moonshot.ai/docs

## Candidatos gratis en seguimiento
*(vacío — se rellena en las pasadas del Paso 2, con mini-eval del Paso 3)*

## Bitácora de hallazgos (lo más reciente arriba)

- **2026-07-06 · semilla.** Se crea el agente a raíz del incidente de "IA no disponible" en el
  agente de huéspedes: `meta/llama-3.1-405b-instruct` fue **retirado del catálogo de NVIDIA NIM**
  (HTTP 404 en cada mensaje) y ese día los 3 proveedores gratis fallaron a la vez, sin backstop de
  pago (Kimi) activo. Arreglo puntual: `AGENTE_HUESPED_MODEL` a vacío (PR #769, ya en main). Este
  agente nace para cazar la próxima retirada ANTES de que toque a un cliente. Aún sin 1ª pasada
  real: las columnas "última vez visto vivo" están pendientes.
