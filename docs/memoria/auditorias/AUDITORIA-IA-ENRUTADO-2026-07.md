# Auditoría — Enrutado de IA a OpenRouter + Agente Director (2026-07-11)

> Objetivo (Alberto): **redirigir toda la IA del monorepo a OpenRouter y, cuando toque,
> pasar por el Agente Director.** Este informe mapea CADA sitio de llamada a IA, lo
> clasifica por cómo enruta hoy y da la acción para llevarlo al camino bueno.

## TL;DR
- **La arquitectura ya es correcta.** Las 4 verticales (ia-rest, sivra, ialimp, rrhh)
  usan wrappers **gateway-first**: si están las envs `AI_GATEWAY_URL`+`AI_GATEWAY_SECRET`
  van por la **pasarela de plataforma (OpenRouter + Director)**; si faltan, caen a la
  cadena directa.
- **Botón nº1 (operacional, sin código):** confirmar `AI_GATEWAY_URL`+`AI_GATEWAY_SECRET`
  en Vercel de las 4 verticales. Es lo que "enchufa" el Director. → checklist abajo.
- **Botón nº2 (1 función):** `apps/plataforma/lib/ai-client.ts::aiComplete` es **NIM
  directo con modelo pinneado** (bypasea OpenRouter Y Director). Arrastra a ~10 rutas de
  producto de plataforma. Redirigirlo al Director rescata la mayoría de golpe.
- **Cola:** un puñado de `fetch` crudos a proveedores, las **edge functions de Supabase**
  (Deno, sin core-ai) y **STT de voz** (fuera del alcance actual de la pasarela).

## Cómo enruta la IA (3 categorías)
- **(A) GATEWAY** — pasarela `/api/ai/*` (`gatewayChat/Search/Tools/Vision/Video`). OpenRouter + Director. **Camino bueno.**
- **(B) `aiComplete`/`aiTools` de `@central/core-ai`** — OpenRouter primero (si `OPENROUTER_API_KEY`) → cadena NIM→Groq→Gemini→Kimi. **OpenRouter sí, Director no.**
- **(C) DIRECTO** — adaptador (`nim*/groq*/gemini*/moonshot*`) o `fetch` crudo al host del proveedor. **Bypasea la pasarela** (y a veces OpenRouter entero).

## Resumen por app

| App | Estado | Nota |
|---|---|---|
| **ia-rest** | 🟢 gateway-first | 106 callers heredan (A) vía `callAI*`. Bypasses reales: `brain.ts` + 5 edge functions + STT. |
| **sivra** | 🟢 gateway-first | Wrapper OK; sin fetch directos fuera del wrapper. |
| **ialimp** | 🟢 gateway-first | Wrapper OK; sin fetch directos fuera del wrapper. |
| **rrhh** | 🟢 gateway-first | Wrapper OK con helper `viaIA()`. |
| **plataforma** (host) | 🟡 mixto | Es el host de la pasarela. Su `lib/ai-client.ts` local es **NIM directo** → arrastra ~10 rutas a (C). Otras ~13 usan `aiComplete` core-ai (B, sin Director). |
| **transporte / alquiler** | ⚪ sin IA | Ninguna llamada. |

---

## Hallazgos por severidad

### 🔴 Alta — bypasean SIEMPRE (no son fallback)

| # | ruta:línea | Qué | Acción |
|---|---|---|---|
| 1 | `apps/plataforma/lib/ai-client.ts:22-33` (`aiComplete`) | NIM directo, modelo pinneado `llama-3.3-70b`. Lo consumen ~10 rutas: `finanzas/gastos/sugerir(-lote)`, `finanzas/categorias/insights`, `agente-movimientos`, `concursos`, `gastos-recurrentes`, `correo/clasificador` (respaldo), `pre-renta`, `sivra/seo-refresh`. | **Redirigir a `chatConDirector`** (`lib/pasarela.ts`) → OpenRouter + Director. Un cambio, rescata ~10 rutas. |
| 2 | `apps/plataforma/app/api/sivra/expenses/parse-invoice/route.ts:46` | `fetch` crudo a `integrate.api.nvidia.com` (OCR factura). | Usar `aiExtractInvoice`/pasarela visión. |
| 3 | `apps/plataforma/app/api/sivra/eventos/websearch/route.ts:75` | `fetch` crudo a Gemini con `google_search`. | Enrutar por `/api/ai/search` (o dejar directo si se quiere el grounding nativo — ver nota). |
| 4 | `apps/ia-rest/src/lib/brain.ts:363` | `fetch` crudo a NVIDIA en el "cerebro" de comandas. | Migrar a `callAI` (gateway-first). |
| 5 | `apps/plataforma/app/api/sivra/seo-refresh/route.ts:66,82,90` | mezcla `aiComplete` local (NIM) + `geminiSearch` directo. | Migrar a `chatConDirector` + `/api/ai/search`. |

### 🟡 Media — edge functions de Supabase (Deno, sin core-ai)

Llaman a proveedor por `fetch` directo; **no pueden usar los helpers del gateway tal cual**
(son Deno). Redirigir = añadir un mini-cliente HTTP a la pasarela desde la edge function,
o dejarlas como están (asumido bypass). Cara-al-cliente primero:

| # | ruta:línea | Proveedor |
|---|---|---|
| 6 | `apps/ia-rest/supabase/functions/qr-assistant/index.ts:90` | NVIDIA (asistente huésped por QR) |
| 7 | `apps/ia-rest/supabase/functions/eventos-entorno/index.ts:171` | Gemini (id ya corregido a 2.5-flash) |
| 8 | `apps/ia-rest/supabase/functions/daily-briefing/index.ts:22` | NVIDIA |
| 9 | `apps/ia-rest/supabase/functions/nim-sentiment/index.ts:14` | NVIDIA |
| 10 | `apps/ia-rest/supabase/functions/nim-diagnostico/index.ts:14` | NVIDIA |
| 11 | `apps/ia-rest/supabase/functions/ig-video-gen/index.ts:157` | fal.ai (existe `/api/ai/video`) |

### 🟢 Baja / fuera de alcance

- **Fallbacks dentro de los wrappers** (ia-rest `ai-client` 112/117/126/134/250/281/287, sivra 72, ialimp 47, rrhh 68): solo se ejecutan si la pasarela no está configurada o falla. Se apagan poniendo `AI_GATEWAY_*`.
- **STT de voz** (`ia-rest/src/lib/ear.ts:136` OpenAI Whisper; `plataforma/lib/ai-client.ts:40` Groq Whisper): la pasarela cubre chat/vision/search/video, **no audio**. Redirigir requiere un endpoint STT nuevo en la pasarela.
- **Categoría B en plataforma** (~13: agente-huésped SIVRA, `categorizar`, `mercado/*`, `inversion/analyze`, `agente/chat`, etc.): ya van por OpenRouter si hay key, pero **sin Director**. Para "todo por el Director" enrutarlos a `chatConDirector` como hace `lib/contable/cerebro.ts`.

---

## ⚠️ Nota transversal: los otros endpoints del gateway NO usan el Director
El `/api/ai/chat` (vía `pasarela.ts::chatConDirector`) **sí** aplica el Director. Pero
`/api/ai/tools` (`route.ts:52,73`), `/api/ai/vision` (`route.ts:33`) y `/api/ai/search`
(`route.ts:29`) van OpenRouter/NIM/Gemini **directos, sin selección de modelo del Director**.
→ Redirigir las verticales a la pasarela las lleva a OpenRouter, pero **tools/vision/search
seguirán sin Director** hasta integrarlo en esos 3 endpoints. (Search con `google_search` de
Gemini es un caso legítimo de "directo": OpenRouter no proxya el grounding nativo de forma
equivalente.)

---

## ✅ Checklist operacional de Alberto (Vercel — el botón nº1)
No puedo leer los valores de env por MCP. Verifica en Vercel → cada proyecto → *Settings ›
Environment Variables* que existan (idealmente como **Shared Environment Variables** del
equipo, ver `plataforma/lib/secrets-registry.ts`):

- [ ] `AI_GATEWAY_URL` = URL de plataforma (`https://plataforma-ten-flame.vercel.app`) — en `ia-rest`, `sivra`, `ialimp`, `rrhh`.
- [ ] `AI_GATEWAY_SECRET` = mismo valor que en `plataforma` — en las 4 verticales.
- [ ] `OPENROUTER_API_KEY` en `plataforma` (ya confirmado activo) — es lo que hace que la pasarela use OpenRouter+Director.
- [ ] `DIRECTOR_MODO=activo` en `plataforma` (ya en `activo` desde 10/07).

Con esas envs puestas, **las 4 verticales pasan automáticamente por OpenRouter + Director**
sin tocar código. Sin ellas, caen a la cadena directa (OpenRouter-primero desde el PR #822,
pero sin Director).

## Plan de código propuesto (por PR, ninguno auto-aplicado)
1. **✅ PR-A (HECHO, alto valor, bajo riesgo):** `plataforma/lib/ai-client.ts::aiComplete` ya
   enruta por `chatConDirector` (antes NIM directo con modelo pinneado). Rescata de golpe las 9
   rutas que lo consumen (`finanzas/gastos/sugerir(-lote)`, `finanzas/categorias/insights`,
   `agente-movimientos`, `concursos`, `gastos-recurrentes`, `correo/clasificador`, `pre-renta`,
   `sivra/seo-refresh`): con `OPENROUTER_API_KEY` el Director elige modelo por petición; sin ella
   cae a la cadena clásica GRATIS de siempre. Firma intacta `(messages,{timeoutMs})`, `maxTokens`
   2048 preservado, typecheck 0 errores. (`aiExtractInvoice`/`aiTranscribe` NO se tocan — OCR/STT.)
2. **✅ PR-B (HECHO parcial):** retirados los `fetch` crudos de **plataforma**:
   `sivra/expenses/parse-invoice` → `aiExtractInvoice`; `sivra/eventos/websearch` → helper
   `geminiSearch` (mantiene grounding `google_search`). **`ia-rest/src/lib/brain.ts` NO migrado
   a propósito:** es el "cerebro" del POS por VOZ (timeout 5 s, cara al cliente) y el propio código
   lo mantiene directo a NIM (`el brain del POS va directo a NIM`) — meterlo por la pasarela añade
   un salto ia-rest→plataforma que arriesga el presupuesto de 5 s. Se deja documentado.
3. **✅ PR-C (HECHO, subconjunto seguro):** migradas a `chatConDirector` las rutas **internas**
   de categoría B: `agente/chat`, `admin/estructura/chat`, `sivra/inversion/analyze`,
   `sivra/mercado/{cron,sweep,search}`. (`chatConDirector` gana `temperature` para preservar el
   0.1 determinista.) **NO migradas a propósito:** `reclamacion` (pin 8B, ya en OpenRouter), el
   **agente de huéspedes** + `sivra/mensajes/reply` (cara al cliente, pin de modelo fuerte por
   calidad de respuesta a huéspedes reales) y `categorizar`/`subcategoria-barrido` (pin 8B por
   latencia). Recordatorio: categoría B **ya iba por OpenRouter** (core-ai `aiComplete` lo usa si
   hay key) — PR-C solo añade el **Director** (elección de modelo), no es un "sacar del bypass".
4. **PR-D — DESACONSEJADO (no es mecánico):** los 3 endpoints excluyen el Director **a propósito**:
   `/api/ai/tools` lo dice en el código (`sin Director: las llamadas con tools son estructuradas y no
   ganan nada con el router`; forzarlo puede elegir un modelo sin function-calling), `/api/ai/vision`
   usa modelos de VISIÓN (el catálogo del Director es de texto) y `/api/ai/search` necesita el
   grounding nativo de Gemini (OpenRouter no lo proxya). Meter el Director aquí introduce regresiones;
   NO se hace sin un rediseño (p. ej. sub-catálogo de modelos con tools). Ya van por OpenRouter donde
   procede (tools = `openrouterChatTools`).
5. **Edge functions / STT:** decisión aparte (requieren infra nueva).

> Nada de esto es auto-aplicable: son cambios de comportamiento de IA en producción. PR-A/B/C
> ejecutados por PR draft (#827); brain.ts y PR-D quedan documentados como exclusiones deliberadas.
