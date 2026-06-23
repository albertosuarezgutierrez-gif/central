# Agente de respuesta a huéspedes (SIVRA) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un agente IA que responde mensajes de huéspedes de Smoobu en tiempo real, nutrido de la guía del huésped + datos de la API + búsqueda web, con compuerta de confianza híbrida y aprobación por Telegram (aceptar/modificar), que aprende de las correcciones.

**Architecture:** Webhook `newMessage` de Smoobu → orquestador en `apps/plataforma` que reúne contexto (guía cacheada + reserva + apartamento + historial + aprendizajes), decide con IA + reglas deterministas + guardrail anti-invención, y o auto-envía en el hilo de Smoobu o propone por Telegram. Aprendizaje y métricas en tablas nuevas de la Supabase compartida. El canal Telegram se construye como paquete compartido `@central/core-telegram` (un solo bot).

**Tech Stack:** Next.js 15 (App Router, route handlers) · TypeScript · Prisma `$queryRaw`/`$executeRaw` (Supabase compartida `wswbehlcuxqxyinousql`) · `@central/core-ai` (`aiComplete` NIM/Groq/Gemini + `/api/ai/search`) · Telegram Bot API · `node --test` para libs puras.

**Spec:** `docs/superpowers/specs/2026-06-22-agente-respuesta-huespedes-sivra-design.md`

---

## Convenciones del repo (leer antes de empezar)

- **Trabajar en `apps/plataforma`** (la mensajería interna de sivra vive aquí; `apps/sivra` es solo web pública).
- **Auth de rutas de usuario:** `import { getSession } from '@/lib/session'`; `if (!session) return NextResponse.json({ error:'Unauthorized' }, { status:401 })`.
- **Auth de crons/webhooks internos:** `import { isCronAuthorized } from '@/lib/cron-auth'` (header `Authorization: Bearer ${CRON_SECRET}`).
- **BD:** `import { prisma } from '@/lib/db'` + `import { Prisma } from '@prisma/client'`. SQL crudo con `prisma.$queryRaw(Prisma.sql\`...\`)`. **La mayoría de tablas NO están en el schema Prisma** → no usar el client tipado para estas.
- **IA texto:** `import { aiComplete } from '@central/core-ai'` → `await aiComplete(messages, { system, maxTokens })`.
- **Clave Smoobu:** `import { getSmoobuKey } from '@/lib/smoobu'` → `await getSmoobuKey()`; usar en header `{ 'Api-Key': key }`.
- **Verificación:** `npx tsc --noEmit` **y** `npx next build` en `apps/plataforma` (no solo tsc). Libs puras con `node --test`.
- **DB compartida con ialimp:** cambios **solo aditivos** (tablas nuevas). NO tocar RLS/grants/buckets.
- **Commits:** frecuentes, uno por tarea. Mensajes en español, scope `plataforma`/`core-telegram`.

---

## Estructura de ficheros (mapa)

**Paquete nuevo (compartido):**
- `packages/core-telegram/package.json` — `@central/core-telegram`.
- `packages/core-telegram/src/index.ts` — API pública (send, buttons, answerCallback, editMessage, askForReply, verifyWebhook).

**`apps/plataforma` — libs del agente (`lib/sivra/agente-huesped/`):**
- `guia.ts` — descarga/cachea/extrae la guía del huésped.
- `recomendar.ts` — búsqueda web de recomendaciones.
- `contexto.ts` — ensambla todo el contexto de una reserva.
- `reglas.ts` — reglas deterministas (early/late check-in, parking). Extraídas de `reply/route.ts`.
- `guardrail.ts` — anti-invención (puro).
- `decidir.ts` — IA con grounding → decisión `{reply, confidence, needs_human, categoria, sentimiento}`.
- `enviar.ts` — envía al hilo de Smoobu.
- `aprender.ts` — log + aprendizaje + gaps de guía.
- `telegram-msg.ts` — formato de los mensajes/botones de propuesta (usa `@central/core-telegram`).
- `orquestador.ts` — `procesarMensajeHuesped(bookingId)`.

**`apps/plataforma` — rutas:**
- `app/api/sivra/mensajes/diagnostico-guia/route.ts` — sondeo de solo lectura (Tarea 1).
- `app/api/sivra/mensajes/webhook/route.ts` — receptor `newMessage` de Smoobu.
- `app/api/sivra/mensajes/telegram-webhook/route.ts` — callbacks/force_reply de Telegram.
- `app/api/sivra/mensajes/resumen-diario/route.ts` — cron de resumen.
- `app/api/sivra/mensajes/auto-reply/route.ts` — **modificar**: pasa a red de seguridad usando el orquestador.
- `app/api/sivra/mensajes/reply/route.ts` — **modificar**: usar `reglas.ts`/`decidir.ts` compartidos.
- `lib/telegram.ts` — **modificar**: re-exporta de `@central/core-telegram`.

**SQL:**
- `prisma/sql/2026-06-22_agente_huespedes.sql` — tablas nuevas.

**Config:**
- `apps/plataforma/package.json` — añadir dep `@central/core-telegram` + `transpilePackages`.

---

## FASE 0 — Cimientos

### Task 1: Sondeo de la guía (read-only, gating)

**Files:**
- Create: `apps/plataforma/app/api/sivra/mensajes/diagnostico-guia/route.ts`

> Objetivo: ejecutado en Vercel (donde hay key + red), vuelca el JSON real de una reserva + apartamento y reporta si `guest-app-url` devuelve HTML legible o cascarón JS. Define cómo se escribe `guia.ts` (Task 5).

- [ ] **Step 1: Crear la ruta de diagnóstico**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSmoobuKey } from '@/lib/smoobu'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// GET /api/sivra/mensajes/diagnostico-guia?reservationId=123
// Auth: Bearer CRON_SECRET. Solo lectura. No escribe nada.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = await getSmoobuKey()
  const reservationId = req.nextUrl.searchParams.get('reservationId')

  // 1) Si no pasan reserva, coge la primera reserva reciente para tener un guest-app-url real.
  let resId = reservationId
  if (!resId) {
    const list = await fetch('https://login.smoobu.com/api/reservations?pageSize=1', {
      headers: { 'Api-Key': key }, cache: 'no-store',
    }).then(r => r.json()).catch(() => null)
    resId = String(list?.bookings?.[0]?.id ?? list?.[0]?.id ?? '')
  }
  if (!resId) return NextResponse.json({ error: 'sin reservas para sondear' }, { status: 404 })

  // 2) Reserva (campos + guest-app-url) y apartamento (campos estructurados).
  const reserva = await fetch(`https://login.smoobu.com/api/reservations/${resId}`, {
    headers: { 'Api-Key': key }, cache: 'no-store',
  }).then(r => r.json()).catch(() => ({}))

  const apartmentId = reserva?.apartment?.id ?? reserva?.apartmentId
  const apartamento = apartmentId
    ? await fetch(`https://login.smoobu.com/api/apartments/${apartmentId}`, {
        headers: { 'Api-Key': key }, cache: 'no-store',
      }).then(r => r.json()).catch(() => ({}))
    : null

  // 3) Descarga la guest-app-url y mide si trae texto o es cascarón JS.
  const guestUrl: string | null = reserva?.['guest-app-url'] || null
  let guia: any = { url: guestUrl, fetched: false }
  if (guestUrl) {
    try {
      const r = await fetch(guestUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
      const html = await r.text()
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                       .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                       .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      guia = {
        url: guestUrl, fetched: true, status: r.status,
        contentType: r.headers.get('content-type'),
        htmlLength: html.length, textLength: text.length,
        // Heurística: si hay mucho texto plano → HTML servido legible; si casi nada → SPA JS.
        veredicto: text.length > 400 ? 'HTML_LEGIBLE' : 'PROBABLE_SPA_JS',
        textSample: text.slice(0, 800),
      }
    } catch (e: any) {
      guia = { url: guestUrl, fetched: false, error: e?.message }
    }
  }

  return NextResponse.json({
    reservationId: resId,
    reservaKeys: Object.keys(reserva || {}),
    guestAppUrl: guestUrl,
    apartamentoKeys: apartamento ? Object.keys(apartamento) : null,
    apartamento,
    guia,
  })
}
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/plataforma && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/api/sivra/mensajes/diagnostico-guia/route.ts
git commit -m "feat(plataforma): sondeo read-only de guest-app-url y campos Smoobu"
```

- [ ] **Step 4: Tras deploy en Vercel, ejecutar y anotar el resultado**

Run (sustituyendo dominio + secret reales):
`curl -H "Authorization: Bearer $CRON_SECRET" "https://<plataforma>/api/sivra/mensajes/diagnostico-guia"`
Expected: JSON con `guia.veredicto` = `HTML_LEGIBLE` o `PROBABLE_SPA_JS`, y `textSample` con el contenido real.
**Anota el veredicto en el spec** (§4) — decide la implementación de `guia.ts` (Task 5): si `HTML_LEGIBLE`, el stripping vale; si `PROBABLE_SPA_JS`, hay que localizar el endpoint interno (`guest.smoobu.com/api/...?t=…&b=…`) inspeccionando la red de la página y adaptar `fetchGuia()`.

---

### Task 2: Migraciones de BD (tablas nuevas)

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-06-22_agente_huespedes.sql`

- [ ] **Step 1: Escribir el SQL (solo aditivo)**

```sql
-- Agente de respuesta a huéspedes (SIVRA). Solo tablas nuevas (no toca ialimp).

-- Caché del contenido de la guía del huésped, por propiedad.
CREATE TABLE IF NOT EXISTS mensajes_guia_cache (
  property_id TEXT PRIMARY KEY,
  contenido   TEXT NOT NULL,
  fuente_url  TEXT,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log de cada mensaje procesado por el agente (métricas + graduación de autonomía).
CREATE TABLE IF NOT EXISTS mensajes_log (
  id           BIGSERIAL PRIMARY KEY,
  booking_id   TEXT NOT NULL,
  property_id  TEXT,
  categoria    TEXT,
  pregunta     TEXT,
  respuesta    TEXT,
  fuente       TEXT,                 -- guia | api | web | regla | ia
  confidence   NUMERIC,
  sentimiento  TEXT,                 -- positivo | neutro | negativo
  needs_human  BOOLEAN DEFAULT false,
  auto_sent    BOOLEAN DEFAULT false,
  edited       BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mensajes_log_cat ON mensajes_log (categoria, created_at);

-- Correcciones de Alberto → ejemplos para el agente.
CREATE TABLE IF NOT EXISTS mensajes_aprendizaje (
  id             BIGSERIAL PRIMARY KEY,
  property_id    TEXT,
  categoria      TEXT,
  pregunta_norm  TEXT,
  respuesta_final TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aprendizaje_prop ON mensajes_aprendizaje (property_id, categoria);

-- Huecos de la guía (auto-mejora): preguntas que escalan por falta de info.
CREATE TABLE IF NOT EXISTS mensajes_guia_gaps (
  id           BIGSERIAL PRIMARY KEY,
  property_id  TEXT,
  pregunta     TEXT,
  veces        INTEGER NOT NULL DEFAULT 1,
  ultima_fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Config de autonomía por categoría (Fase 1 → Fase 2 sin redeploy).
CREATE TABLE IF NOT EXISTS mensajes_auto_config (
  categoria    TEXT PRIMARY KEY,
  auto_enabled BOOLEAN NOT NULL DEFAULT false,
  umbral       NUMERIC NOT NULL DEFAULT 0.85
);

-- Estado pendiente de propuestas Telegram (liga callback/force_reply a un booking).
CREATE TABLE IF NOT EXISTS mensajes_pendientes_tg (
  booking_id     TEXT PRIMARY KEY,
  property_id    TEXT,
  borrador       TEXT,
  categoria      TEXT,
  tg_message_id  BIGINT,
  esperando_edit BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Aplicar a Supabase real**

Aplicar con el MCP de Supabase (`apply_migration`, name `agente_huespedes`) **o** pegar el SQL en el SQL editor del proyecto `wswbehlcuxqxyinousql`. Verificar con `list_tables` que aparecen las 6 tablas.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/prisma/sql/2026-06-22_agente_huespedes.sql
git commit -m "feat(plataforma): tablas del agente de huéspedes (solo aditivo)"
```

---

### Task 3: Paquete compartido `@central/core-telegram`

**Files:**
- Create: `packages/core-telegram/package.json`
- Create: `packages/core-telegram/src/index.ts`
- Test: `packages/core-telegram/src/callback.test.ts`

> Centraliza el bot único. Porta `tgAlert`/`tgAlertButtons` (ya en `apps/plataforma/lib/telegram.ts`) + `tgAnswerCallback`/`tgEditMessage` (patrón de ia-rest) + `tgAskForReply` (force_reply) + parseo de callback. Lógica de red "best effort" (nunca lanza).

- [ ] **Step 1: package.json**

```json
{
  "name": "@central/core-telegram",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "test": "node --test" }
}
```

- [ ] **Step 2: Escribir el test de parseo de callback (puro)**

```typescript
// packages/core-telegram/src/callback.test.ts
import { test } from 'node:test'
import assert from 'node:assert'
import { parseCallback } from './index.ts'

test('parseCallback separa prefijo y args', () => {
  assert.deepEqual(parseCallback('hsp_send:123'), { prefix: 'hsp', action: 'send', args: ['123'] })
})

test('parseCallback con varios args', () => {
  assert.deepEqual(parseCallback('hsp_grant_late:123:2026-07-01'),
    { prefix: 'hsp', action: 'grant_late', args: ['123', '2026-07-01'] })
})

test('parseCallback vacío', () => {
  assert.deepEqual(parseCallback(''), { prefix: '', action: '', args: [] })
})
```

- [ ] **Step 3: Ejecutar test (debe fallar)**

Run: `cd packages/core-telegram && node --test`
Expected: FAIL (`parseCallback` no existe).

- [ ] **Step 4: Implementar el módulo**

```typescript
// packages/core-telegram/src/index.ts
// Bot único del monorepo. Envs: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET.
// "Best effort": las funciones de red nunca lanzan.

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`

export function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export type Boton = { texto: string; url?: string; callback?: string }

// callback_data: "<prefix>_<action>:<arg1>:<arg2>..."  (prefix = vertical/feature, p.ej. "hsp")
export function parseCallback(data: string): { prefix: string; action: string; args: string[] } {
  if (!data) return { prefix: '', action: '', args: [] }
  const [head, ...args] = data.split(':')
  const us = head.indexOf('_')
  if (us < 0) return { prefix: head, action: '', args }
  return { prefix: head.slice(0, us), action: head.slice(us + 1), args }
}

export async function tgSend(text: string, opts: { chatId?: string; html?: boolean } = {}): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = opts.chatId || process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return null
  try {
    const res = await fetch(API(token, 'sendMessage'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: opts.html === false ? undefined : 'HTML', disable_web_page_preview: true }),
    })
    const d = await res.json()
    return d?.result?.message_id ?? null
  } catch { return null }
}

export async function tgSendButtons(text: string, botones: Boton[][], opts: { chatId?: string } = {}): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = opts.chatId || process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return null
  const reply_markup = {
    inline_keyboard: botones.map(fila => fila.map(b => b.url ? { text: b.texto, url: b.url } : { text: b.texto, callback_data: b.callback || '' })),
  }
  try {
    const res = await fetch(API(token, 'sendMessage'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', reply_markup, disable_web_page_preview: true }),
    })
    const d = await res.json()
    return d?.result?.message_id ?? null
  } catch { return null }
}

export async function tgAnswerCallback(callbackQueryId: string, text?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  try {
    await fetch(API(token, 'answerCallbackQuery'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text?.slice(0, 200) }),
    })
  } catch {}
}

export async function tgEditMessage(messageId: number, text: string, opts: { chatId?: string } = {}): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = opts.chatId || process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return
  try {
    await fetch(API(token, 'editMessageText'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    })
  } catch {}
}

// Pide texto libre ligado a la respuesta (force_reply). El webhook lee message.reply_to_message.
export async function tgAskForReply(text: string, opts: { chatId?: string } = {}): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = opts.chatId || process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return null
  try {
    const res = await fetch(API(token, 'sendMessage'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', reply_markup: { force_reply: true, selective: false } }),
    })
    const d = await res.json()
    return d?.result?.message_id ?? null
  } catch { return null }
}

// Verifica el header secreto que Telegram envía en cada webhook.
export function verifyTelegramWebhook(headerValue: string | null): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) return true // si no se configuró, no se exige (dev)
  return headerValue === secret
}
```

- [ ] **Step 5: Ejecutar test (debe pasar)**

Run: `cd packages/core-telegram && node --test`
Expected: PASS (3 tests).

- [ ] **Step 6: Conectar el paquete en plataforma + re-exportar el lib viejo**

Modificar `apps/plataforma/package.json`: añadir `"@central/core-telegram": "file:../../packages/core-telegram"` en `dependencies` y `"@central/core-telegram"` al array `transpilePackages` de `next.config` (seguir el patrón de `@central/core-ai`/`core-email`).

Reescribir `apps/plataforma/lib/telegram.ts` para re-exportar (compatibilidad con el código actual que importa `tgAlert`/`tgAlertButtons`):

```typescript
// lib/telegram.ts — re-export del módulo compartido (un solo bot).
export * from '@central/core-telegram'
import { tgSend, tgSendButtons, escapeHtml, type Boton } from '@central/core-telegram'

const EMOJI: Record<string, string> = { critico: '🔴', aviso: '🟡', info: '🔵', resuelto: '✅' }
function envoltura(mensaje: string, nivel: keyof typeof EMOJI) {
  const hora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  return `${EMOJI[nivel] || '🔵'} <b>SIVRA</b>\n${mensaje}\n<i>${hora}</i>`
}
// Firmas legacy conservadas para no romper llamadas existentes.
export async function tgAlert(mensaje: string, nivel: keyof typeof EMOJI = 'info'): Promise<void> {
  await tgSend(envoltura(mensaje, nivel)); 
}
export async function tgAlertButtons(mensaje: string, nivel: keyof typeof EMOJI, botones: Boton[][]): Promise<number | null> {
  return tgSendButtons(envoltura(mensaje, nivel), botones)
}
export { escapeHtml }
```

- [ ] **Step 7: Verificar build de plataforma**

Run: `cd apps/plataforma && npx tsc --noEmit && npx next build`
Expected: build OK (las llamadas existentes a `tgAlert`/`tgAlertButtons` siguen compilando).

- [ ] **Step 8: Commit**

```bash
git add packages/core-telegram apps/plataforma/package.json apps/plataforma/lib/telegram.ts apps/plataforma/next.config.*
git commit -m "feat(core-telegram): paquete compartido de Telegram (bot único) + plataforma lo consume"
```

---

## FASE 1 — Conocimiento y contexto

### Task 4: `reglas.ts` (extraer reglas deterministas, puro y testeable)

**Files:**
- Create: `apps/plataforma/lib/sivra/agente-huesped/reglas.ts`
- Test: `apps/plataforma/lib/sivra/agente-huesped/reglas.test.ts`
- Modify: `apps/plataforma/app/api/sivra/mensajes/reply/route.ts` (importar de aquí)

> Mueve `detectLang`, `detectCategory`, `extractEarlyTime` y la tabla `PARKING_SPOTS` de `reply/route.ts` a un módulo puro reutilizable por el orquestador y por la ruta existente. Sin cambiar la lógica.

- [ ] **Step 1: Escribir el test (puro)**

```typescript
import { test } from 'node:test'
import assert from 'node:assert'
import { detectLang, detectCategory, extractEarlyTime, PARKING_SPOTS } from './reglas.ts'

test('detectLang detecta español', () => assert.equal(detectLang('Hola, ¿a qué hora es el check-in?'), 'es'))
test('detectLang cae a inglés', () => assert.equal(detectLang('What is the wifi password?'), 'en'))
test('detectCategory wifi', () => assert.equal(detectCategory('what is the wifi password'), 'wifi'))
test('detectCategory parking', () => assert.equal(detectCategory('¿hay aparcamiento?'), 'parking'))
test('extractEarlyTime checkout temprano', () => {
  assert.deepEqual(extractEarlyTime('we leave at 9'), { type: 'early_checkout', time: '09:00' })
})
test('PARKING_SPOTS conocido', () => assert.equal(PARKING_SPOTS['prop_house_sevillana'], 1))
```

- [ ] **Step 2: Ejecutar test (debe fallar)**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/reglas.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Crear `reglas.ts` copiando las funciones desde `reply/route.ts`**

Copiar **literalmente** (sin cambios de lógica) desde `app/api/sivra/mensajes/reply/route.ts` las funciones `extractEarlyTime` (líneas 20-40), `detectCategory` (51-63), `detectLang` (65-71) y la constante `PARKING_SPOTS` (12-18), exportándolas:

```typescript
// lib/sivra/agente-huesped/reglas.ts — reglas deterministas puras (extraídas de reply/route.ts)
export const PARKING_SPOTS: Record<string, number> = {
  prop_house_sevillana: 1, prop_busto_reform: 0, prop_duplex_center: 0, prop_luxury_busto: 1, all: 0,
}
export function extractEarlyTime(text: string): { type: 'early_checkout' | 'early_checkin_request', time: string } | null {
  /* …cuerpo idéntico al de reply/route.ts… */
}
export function detectCategory(text: string): string | null { /* …idéntico… */ }
export function detectLang(text: string): 'es' | 'en' | 'fr' | 'de' | 'it' { /* …idéntico… */ }
```

- [ ] **Step 4: Ejecutar test (debe pasar)**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/reglas.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Refactor de `reply/route.ts` para importar de `reglas.ts`**

En `app/api/sivra/mensajes/reply/route.ts`: borrar las definiciones locales de `PARKING_SPOTS`, `extractEarlyTime`, `detectCategory`, `detectLang` y añadir arriba:
`import { PARKING_SPOTS, extractEarlyTime, detectCategory, detectLang } from '@/lib/sivra/agente-huesped/reglas'`

- [ ] **Step 6: Verificar build**

Run: `cd apps/plataforma && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/reglas.ts apps/plataforma/lib/sivra/agente-huesped/reglas.test.ts apps/plataforma/app/api/sivra/mensajes/reply/route.ts
git commit -m "refactor(plataforma): extraer reglas deterministas de mensajes a lib/sivra/agente-huesped/reglas"
```

---

### Task 5: `guia.ts` (descarga + caché + extracción de la guía)

**Files:**
- Create: `apps/plataforma/lib/sivra/agente-huesped/guia.ts`

> Implementación por defecto: **HTML legible** (el caso esperado). Si la Task 1 reportó `PROBABLE_SPA_JS`, ajustar `fetchGuiaRaw()` para llamar al endpoint interno detectado (mismo seam, no cambia el resto).

- [ ] **Step 1: Implementar**

```typescript
// lib/sivra/agente-huesped/guia.ts
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getSmoobuKey } from '@/lib/smoobu'

const TTL_DIAS = 7

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim()
}

// Descarga el contenido de la guía. Caso HTML servido (esperado). Devuelve texto o null.
async function fetchGuiaRaw(guestUrl: string): Promise<string | null> {
  try {
    const r = await fetch(guestUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
    if (!r.ok) return null
    const text = stripHtml(await r.text())
    return text.length > 400 ? text : null  // poco texto ⇒ probable SPA ⇒ tratar como "sin guía"
  } catch { return null }
}

async function getGuestUrl(reservationId: string): Promise<string | null> {
  try {
    const key = await getSmoobuKey()
    const d = await fetch(`https://login.smoobu.com/api/reservations/${reservationId}`, {
      headers: { 'Api-Key': key }, cache: 'no-store',
    }).then(r => r.json())
    return d?.['guest-app-url'] || null
  } catch { return null }
}

// Devuelve el texto de la guía del piso, con caché por property_id (TTL 7 días).
export async function getGuiaPiso(propertyId: string, reservationId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT contenido, fetched_at FROM mensajes_guia_cache WHERE property_id = ${propertyId}
  `)
  const cached = rows[0]
  if (cached && (Date.now() - new Date(cached.fetched_at).getTime()) < TTL_DIAS * 86400_000) {
    return cached.contenido
  }
  const url = await getGuestUrl(reservationId)
  if (!url) return cached?.contenido ?? null
  const contenido = await fetchGuiaRaw(url)
  if (!contenido) return cached?.contenido ?? null
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_guia_cache (property_id, contenido, fuente_url, fetched_at)
    VALUES (${propertyId}, ${contenido}, ${url}, now())
    ON CONFLICT (property_id) DO UPDATE SET contenido = ${contenido}, fuente_url = ${url}, fetched_at = now()
  `)
  return contenido
}
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/plataforma && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/guia.ts
git commit -m "feat(plataforma): extracción + caché de la guía del huésped por piso"
```

---

### Task 6: `recomendar.ts` (búsqueda web para recomendaciones)

**Files:**
- Create: `apps/plataforma/lib/sivra/agente-huesped/recomendar.ts`

> Usa la pasarela de búsqueda existente. En plataforma `aiComplete` está disponible directo; para búsqueda web se llama al endpoint interno `/api/ai/search` (Gemini) que ya existe. Para evitar dependencia de URL absoluta, se reusa el adaptador Gemini de `@central/core-ai` si exporta `gatewaySearch`; si no, `aiComplete` con instrucción de "responde con conocimiento general de la zona".

- [ ] **Step 1: Implementar (con fallback robusto)**

```typescript
// lib/sivra/agente-huesped/recomendar.ts
import { aiComplete } from '@central/core-ai'

// Recomendaciones de zona. Intenta búsqueda web (Gemini) vía /api/ai/search; si no, conocimiento del modelo.
export async function recomendar(pregunta: string, zona: string, lang: string): Promise<string> {
  const base = process.env.AI_GATEWAY_URL || process.env.NEXT_PUBLIC_BASE_URL
  const secret = process.env.AI_GATEWAY_SECRET
  if (base && secret) {
    try {
      const r = await fetch(`${base}/api/ai/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          system: `Eres un anfitrión local en ${zona}. Recomienda en ${lang}, concreto y breve (3-4 frases), con nombres reales y por qué.`,
          user: pregunta,
        }),
      })
      if (r.ok) { const d = await r.json(); if (d?.text) return d.text }
    } catch {}
  }
  // Fallback: conocimiento del modelo.
  return aiComplete(
    [{ role: 'user', content: pregunta }],
    { system: `Eres un anfitrión local en ${zona}. Recomienda en ${lang}, breve (3-4 frases), con nombres reales. Si no estás seguro de un dato concreto, no lo inventes.`, maxTokens: 300 },
  )
}
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/plataforma && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/recomendar.ts
git commit -m "feat(plataforma): recomendaciones de zona por búsqueda web"
```

---

### Task 7: `contexto.ts` (ensamblar el contexto de la reserva)

**Files:**
- Create: `apps/plataforma/lib/sivra/agente-huesped/contexto.ts`

- [ ] **Step 1: Implementar**

```typescript
// lib/sivra/agente-huesped/contexto.ts
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getSmoobuKey } from '@/lib/smoobu'
import { getGuiaPiso } from './guia'

export type MensajeHist = { from: 'guest' | 'host'; text: string; ts: string }
export type Contexto = {
  bookingId: string
  reservationId: string
  propertyId: string
  property: string
  guestName: string
  lang: string
  portal: string
  checkIn: string
  checkOut: string
  lat: number | null
  lng: number | null
  zona: string
  guia: string | null
  historial: MensajeHist[]
  aprendizajes: { categoria: string; pregunta_norm: string; respuesta_final: string }[]
}

function strip(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
}

// Mapea apartmentId de Smoobu → property_id interno (prop_*). Ajustar a la convención real del repo.
function toPropertyId(apartmentId: any, apartmentName: string): string {
  const n = (apartmentName || '').toLowerCase()
  if (n.includes('house') || n.includes('sevillana')) return 'prop_house_sevillana'
  if (n.includes('busto reform')) return 'prop_busto_reform'
  if (n.includes('luxury')) return 'prop_luxury_busto'
  if (n.includes('duplex') || n.includes('center')) return 'prop_duplex_center'
  return 'all'
}

export async function construirContexto(bookingId: string, lang: string): Promise<Contexto | null> {
  const key = await getSmoobuKey()
  const reserva = await fetch(`https://login.smoobu.com/api/reservations/${bookingId}`, {
    headers: { 'Api-Key': key }, cache: 'no-store',
  }).then(r => r.json()).catch(() => null)
  if (!reserva) return null

  const apartmentId = reserva?.apartment?.id ?? reserva?.apartmentId
  const apartmentName = reserva?.apartment?.name ?? ''
  const apt = apartmentId ? await fetch(`https://login.smoobu.com/api/apartments/${apartmentId}`, {
    headers: { 'Api-Key': key }, cache: 'no-store',
  }).then(r => r.json()).catch(() => ({})) : {}

  const propertyId = toPropertyId(apartmentId, apartmentName)

  const msgRaw: any[] = await fetch(`https://login.smoobu.com/api/reservations/${bookingId}/messages`, {
    headers: { 'Api-Key': key }, cache: 'no-store',
  }).then(r => r.json()).then(d => d.messages || d || []).catch(() => [])
  const historial: MensajeHist[] = msgRaw.map(m => ({
    from: m.sent_by_owner ? 'host' : 'guest', text: strip(m.message || m.text || ''), ts: m.created_at || '',
  })).filter(m => m.text)

  const guia = await getGuiaPiso(propertyId, bookingId)

  const aprendizajes = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT categoria, pregunta_norm, respuesta_final FROM mensajes_aprendizaje
    WHERE property_id = ${propertyId} ORDER BY created_at DESC LIMIT 8
  `)

  return {
    bookingId, reservationId: String(bookingId), propertyId,
    property: apartmentName || reserva?.apartment?.name || 'el apartamento',
    guestName: reserva?.guest_name || reserva?.guestName || '',
    lang, portal: reserva?.channel?.name || reserva?.type || 'directo',
    checkIn: reserva?.arrival || '', checkOut: reserva?.departure || '',
    lat: apt?.location?.latitude ?? null, lng: apt?.location?.longitude ?? null,
    zona: [apt?.location?.city, apt?.location?.country].filter(Boolean).join(', ') || 'Sevilla, España',
    guia, historial, aprendizajes,
  }
}
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/plataforma && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/contexto.ts
git commit -m "feat(plataforma): ensamblado de contexto de reserva (Smoobu + guía + historial + aprendizajes)"
```

---

## FASE 2 — Decisión

### Task 8: `guardrail.ts` (anti-invención, puro y testeable)

**Files:**
- Create: `apps/plataforma/lib/sivra/agente-huesped/guardrail.ts`
- Test: `apps/plataforma/lib/sivra/agente-huesped/guardrail.test.ts`

> Bloquea auto-envío si la respuesta contiene datos concretos (números largos, códigos, teléfonos, contraseñas, URLs) que **no aparecen** en las fuentes (guía + historial + datos de reserva).

- [ ] **Step 1: Escribir el test**

```typescript
import { test } from 'node:test'
import assert from 'node:assert'
import { contieneDatoInventado } from './guardrail.ts'

const fuentes = 'WiFi: HouseSevillana clave Sevilla2026. Check-in 15:00. Tel +34 600111222.'

test('detecta un código que no está en fuentes', () => {
  assert.equal(contieneDatoInventado('La clave del portal es 4471', fuentes), true)
})
test('no marca si el dato está en fuentes', () => {
  assert.equal(contieneDatoInventado('La clave wifi es Sevilla2026', fuentes), false)
})
test('no marca texto sin datos concretos', () => {
  assert.equal(contieneDatoInventado('Encantado de ayudarte con tu estancia', fuentes), false)
})
test('detecta teléfono inventado', () => {
  assert.equal(contieneDatoInventado('Llama al +34 699888777', fuentes), true)
})
test('permite la hora 15:00 que sí está', () => {
  assert.equal(contieneDatoInventado('El check-in es a las 15:00', fuentes), false)
})
```

- [ ] **Step 2: Ejecutar test (debe fallar)**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guardrail.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
// lib/sivra/agente-huesped/guardrail.ts
// Extrae "datos duros" (códigos, teléfonos, claves, URLs) y comprueba que estén en las fuentes.
function normaliza(s: string): string { return (s || '').toLowerCase().replace(/[\s\-().]/g, '') }

const PATRONES: RegExp[] = [
  /\+?\d[\d\s().-]{6,}\d/g,          // teléfonos
  /\b[A-Za-z0-9]{4,}\d{2,}[A-Za-z0-9]*\b/g, // claves alfanuméricas tipo Sevilla2026 / 4471X
  /\b\d{4,}\b/g,                      // códigos numéricos de 4+ dígitos
  /https?:\/\/\S+/g,                  // URLs
]

export function contieneDatoInventado(respuesta: string, fuentes: string): boolean {
  const src = normaliza(fuentes)
  for (const re of PATRONES) {
    const m = respuesta.match(re)
    if (!m) continue
    for (const token of m) {
      // Horas tipo 15:00 / 11:00 son seguras (no son "datos duros" inventables).
      if (/^\d{1,2}:\d{2}$/.test(token.trim())) continue
      if (!src.includes(normaliza(token))) return true
    }
  }
  return false
}
```

- [ ] **Step 4: Ejecutar test (debe pasar)**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guardrail.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/guardrail.ts apps/plataforma/lib/sivra/agente-huesped/guardrail.test.ts
git commit -m "feat(plataforma): guardrail anti-invención de datos"
```

---

### Task 9: `decidir.ts` (motor de decisión IA con grounding)

**Files:**
- Create: `apps/plataforma/lib/sivra/agente-huesped/decidir.ts`
- Test: `apps/plataforma/lib/sivra/agente-huesped/decidir.test.ts`

> Combina: clasificación sensible (puro, testeable) + llamada IA que devuelve JSON. El guardrail y la decisión de escalado se aplican aquí.

- [ ] **Step 1: Test de la parte pura (categorías sensibles)**

```typescript
import { test } from 'node:test'
import assert from 'node:assert'
import { esSensible } from './decidir.ts'

test('queja es sensible', () => assert.equal(esSensible('el aire acondicionado no funciona, es un desastre'), true))
test('reembolso es sensible', () => assert.equal(esSensible('quiero un reembolso'), true))
test('cambio de fechas es sensible', () => assert.equal(esSensible('necesito cambiar las fechas de mi reserva'), true))
test('pregunta de wifi NO es sensible', () => assert.equal(esSensible('cuál es la contraseña del wifi'), false))
```

- [ ] **Step 2: Ejecutar test (debe fallar)**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/decidir.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
// lib/sivra/agente-huesped/decidir.ts
import { aiComplete } from '@central/core-ai'
import type { Contexto } from './contexto'
import { contieneDatoInventado } from './guardrail'

export type Decision = {
  reply: string
  confidence: number
  needs_human: boolean
  categoria: string
  sentimiento: 'positivo' | 'neutro' | 'negativo'
  motivo: string
  fuente: 'ia' | 'web' | 'regla'
}

const RE_SENSIBLE = /queja|reclamac|reembols|devoluc|no funciona|averi|roto|sucio|desastre|cambiar (las )?fechas?|cancelar|emergencia|urgenc|estafa|denuncia|abogad/i

export function esSensible(text: string): boolean { return RE_SENSIBLE.test(text || '') }

const LANG_NAME: Record<string, string> = { es: 'español', en: 'English', fr: 'français', de: 'Deutsch', it: 'italiano' }

export async function decidir(ctx: Contexto, pregunta: string, categoria: string): Promise<Decision> {
  const fuentes = [ctx.guia || '', ctx.historial.map(h => h.text).join(' ')].join('\n')
  const aprend = ctx.aprendizajes.map(a => `P: ${a.pregunta_norm}\nR: ${a.respuesta_final}`).join('\n\n')

  const system = `Eres el asistente de atención al huésped de ${ctx.property} (alquiler turístico en ${ctx.zona}).
Huésped: ${ctx.guestName} · check-in ${ctx.checkIn} · check-out ${ctx.checkOut} · canal ${ctx.portal}.
Responde SIEMPRE en ${LANG_NAME[ctx.lang] || 'English'}, cálido y breve (3-4 frases), usando el nombre del huésped.

INFORMACIÓN DISPONIBLE (única fuente de verdad; NO inventes nada que no esté aquí):
${ctx.guia || '(sin guía cargada)'}

${aprend ? `EJEMPLOS DE RESPUESTAS APROBADAS POR EL ANFITRIÓN (imítalos en tono y criterio):\n${aprend}` : ''}

Devuelve SOLO un JSON:
{"reply": "...", "confidence": 0.0-1.0, "needs_human": true|false, "sentimiento": "positivo|neutro|negativo", "motivo": "por qué escalas o no"}
- needs_human=true si: el huésped se queja/enfada, pide dinero/cambios/cancelación/emergencia, o la INFORMACIÓN no cubre la pregunta.
- confidence alto solo si la respuesta sale claramente de la INFORMACIÓN disponible.`

  let parsed: any = {}
  try {
    const raw = await aiComplete(
      [{ role: 'user', content: pregunta }],
      { system, maxTokens: 500 },
    )
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return { reply: '', confidence: 0, needs_human: true, categoria, sentimiento: 'neutro', motivo: 'fallo IA/parseo', fuente: 'ia' }
  }

  const sentimiento = ['positivo', 'neutro', 'negativo'].includes(parsed.sentimiento) ? parsed.sentimiento : 'neutro'
  let needs_human = !!parsed.needs_human || esSensible(pregunta) || sentimiento === 'negativo'
  let motivo = parsed.motivo || ''

  // Guardrail anti-invención: si la respuesta usa datos que no están en fuentes → escala.
  if (parsed.reply && contieneDatoInventado(parsed.reply, fuentes)) {
    needs_human = true
    motivo = 'guardrail: dato no presente en las fuentes'
  }

  return {
    reply: parsed.reply || '',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    needs_human, categoria, sentimiento, motivo, fuente: 'ia',
  }
}
```

- [ ] **Step 4: Ejecutar test (debe pasar)**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/decidir.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/decidir.ts apps/plataforma/lib/sivra/agente-huesped/decidir.test.ts
git commit -m "feat(plataforma): motor de decisión IA con grounding + escalado + guardrail"
```

---

## FASE 3 — Acción, canal y aprendizaje

### Task 10: `enviar.ts` (responder en el hilo de Smoobu)

**Files:**
- Create: `apps/plataforma/lib/sivra/agente-huesped/enviar.ts`

- [ ] **Step 1: Implementar**

```typescript
// lib/sivra/agente-huesped/enviar.ts
import { getSmoobuKey } from '@/lib/smoobu'

// Responde en el hilo del huésped (llega a Airbnb/Booking/email). Devuelve true si 2xx.
export async function enviarAlHuesped(reservationId: string, messageBody: string, subject = 'Re: tu estancia'): Promise<boolean> {
  try {
    const key = await getSmoobuKey()
    const r = await fetch(`https://login.smoobu.com/api/reservations/${reservationId}/messages/send-message-to-guest`, {
      method: 'POST',
      headers: { 'Api-Key': key, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ subject, messageBody }),
    })
    return r.ok
  } catch { return false }
}
```

- [ ] **Step 2: Verificar build + Commit**

Run: `cd apps/plataforma && npx tsc --noEmit`

```bash
git add apps/plataforma/lib/sivra/agente-huesped/enviar.ts
git commit -m "feat(plataforma): envío de respuesta al hilo de Smoobu"
```

---

### Task 11: `aprender.ts` (log + aprendizaje + gaps)

**Files:**
- Create: `apps/plataforma/lib/sivra/agente-huesped/aprender.ts`

- [ ] **Step 1: Implementar**

```typescript
// lib/sivra/agente-huesped/aprender.ts
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function logMensaje(p: {
  bookingId: string; propertyId: string; categoria: string; pregunta: string; respuesta: string
  fuente: string; confidence: number; sentimiento: string; needs_human: boolean; auto_sent: boolean; edited: boolean
}): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_log (booking_id, property_id, categoria, pregunta, respuesta, fuente, confidence, sentimiento, needs_human, auto_sent, edited)
    VALUES (${p.bookingId}, ${p.propertyId}, ${p.categoria}, ${p.pregunta}, ${p.respuesta}, ${p.fuente}, ${p.confidence}, ${p.sentimiento}, ${p.needs_human}, ${p.auto_sent}, ${p.edited})
  `).catch(() => {})
}

// Guarda una corrección de Alberto como ejemplo para el piso/categoría.
export async function aprenderCorreccion(p: { propertyId: string; categoria: string; pregunta: string; respuestaFinal: string }): Promise<void> {
  const norm = (p.pregunta || '').toLowerCase().slice(0, 300)
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_aprendizaje (property_id, categoria, pregunta_norm, respuesta_final)
    VALUES (${p.propertyId}, ${p.categoria}, ${norm}, ${p.respuestaFinal})
  `).catch(() => {})
}

// Registra un hueco de la guía (incrementa el contador si ya existía esa pregunta para el piso).
export async function registrarGap(propertyId: string, pregunta: string): Promise<void> {
  const norm = (pregunta || '').toLowerCase().slice(0, 200)
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id FROM mensajes_guia_gaps WHERE property_id = ${propertyId} AND pregunta = ${norm} LIMIT 1
  `)
  if (rows[0]) {
    await prisma.$executeRaw(Prisma.sql`UPDATE mensajes_guia_gaps SET veces = veces + 1, ultima_fecha = now() WHERE id = ${rows[0].id}`).catch(() => {})
  } else {
    await prisma.$executeRaw(Prisma.sql`INSERT INTO mensajes_guia_gaps (property_id, pregunta) VALUES (${propertyId}, ${norm})`).catch(() => {})
  }
}

// ¿Está habilitado el auto-envío para esta categoría y supera el umbral?
export async function autoPermitido(categoria: string, confidence: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT auto_enabled, umbral FROM mensajes_auto_config WHERE categoria = ${categoria} LIMIT 1
  `)
  const cfg = rows[0]
  if (!cfg || !cfg.auto_enabled) return false   // Fase 1 por defecto: nada automático
  return confidence >= Number(cfg.umbral)
}
```

- [ ] **Step 2: Verificar build + Commit**

Run: `cd apps/plataforma && npx tsc --noEmit`

```bash
git add apps/plataforma/lib/sivra/agente-huesped/aprender.ts
git commit -m "feat(plataforma): log, aprendizaje, gaps de guía y config de autonomía"
```

---

### Task 12: `telegram-msg.ts` (propuesta por Telegram) + orquestador

**Files:**
- Create: `apps/plataforma/lib/sivra/agente-huesped/telegram-msg.ts`
- Create: `apps/plataforma/lib/sivra/agente-huesped/orquestador.ts`

- [ ] **Step 1: `telegram-msg.ts`**

```typescript
// lib/sivra/agente-huesped/telegram-msg.ts
import { tgSendButtons, tgEditMessage, escapeHtml } from '@central/core-telegram'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { Decision } from './decidir'
import type { Contexto } from './contexto'

const EMOJI = (urgente: boolean) => (urgente ? '🔴' : '💬')

// Propone el borrador por Telegram con botones y guarda el estado pendiente.
export async function proponerPorTelegram(ctx: Contexto, pregunta: string, dec: Decision): Promise<void> {
  const urgente = dec.sentimiento === 'negativo'
  const cabecera = `${EMOJI(urgente)} <b>${escapeHtml(ctx.property)}</b> · ${escapeHtml(ctx.guestName)}`
  const cuerpo = `<b>Huésped:</b> ${escapeHtml(pregunta)}\n\n<b>Borrador:</b>\n${escapeHtml(dec.reply || '(sin borrador — escribe tú)')}` +
    (dec.motivo ? `\n\n<i>${escapeHtml(dec.motivo)}</i>` : '')

  const botones = [[
    { texto: '✅ Enviar', callback: `hsp_send:${ctx.bookingId}` },
    { texto: '✏️ Modificar', callback: `hsp_edit:${ctx.bookingId}` },
  ]]
  // Acción contextual: conceder late/early si la categoría lo pide.
  if (dec.categoria === 'late_checkout' || dec.categoria === 'early_checkin') {
    botones.push([{ texto: '🕒 Conceder', callback: `hsp_grant:${ctx.bookingId}` }])
  }

  const mid = await tgSendButtons(`${cabecera}\n\n${cuerpo}`, botones)
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_pendientes_tg (booking_id, property_id, borrador, categoria, tg_message_id, esperando_edit)
    VALUES (${ctx.bookingId}, ${ctx.propertyId}, ${dec.reply || ''}, ${dec.categoria}, ${mid}, false)
    ON CONFLICT (booking_id) DO UPDATE SET borrador = ${dec.reply || ''}, categoria = ${dec.categoria}, tg_message_id = ${mid}, esperando_edit = false, created_at = now()
  `).catch(() => {})
}

export async function confirmarEnviado(messageId: number | null, texto: string): Promise<void> {
  if (messageId) await tgEditMessage(messageId, `✅ Enviado al huésped:\n\n${escapeHtml(texto)}`)
}
```

- [ ] **Step 2: `orquestador.ts`**

```typescript
// lib/sivra/agente-huesped/orquestador.ts
import { construirContexto } from './contexto'
import { detectLang, detectCategory } from './reglas'
import { decidir } from './decidir'
import { recomendar } from './recomendar'
import { enviarAlHuesped } from './enviar'
import { proponerPorTelegram } from './telegram-msg'
import { logMensaje, registrarGap, autoPermitido } from './aprender'
import type { Decision } from './decidir'

// Procesa el último mensaje del huésped de una reserva. Idempotencia la gestiona el llamador (webhook).
export async function procesarMensajeHuesped(bookingId: string): Promise<{ accion: string }> {
  // 1) Construimos el contexto; el idioma se recalcula con el último mensaje del huésped.
  const ctx0 = await construirContexto(bookingId, 'en')
  if (!ctx0) return { accion: 'sin_contexto' }
  const ultimoGuest = [...ctx0.historial].reverse().find(h => h.from === 'guest')
  if (!ultimoGuest) return { accion: 'sin_mensaje_huesped' }

  const pregunta = ultimoGuest.text
  const lang = detectLang(pregunta)
  const categoria = detectCategory(pregunta) || 'general'
  const ctx = { ...ctx0, lang }

  // 2) Recomendaciones → camino de búsqueda web; resto → decisión IA con grounding.
  let dec: Decision
  if (categoria === 'faq' || /recomien|recommend|qué hacer|what to do|restaurante|restaurant|visit|ver en/i.test(pregunta)) {
    const reply = await recomendar(pregunta, ctx.zona, lang)
    dec = { reply, confidence: 0.6, needs_human: false, categoria: 'recomendacion', sentimiento: 'neutro' as const, motivo: '', fuente: 'web' as const }
  } else {
    dec = await decidir(ctx, pregunta, categoria)
  }

  if (dec.needs_human && !ctx.guia && categoria !== 'recomendacion') {
    await registrarGap(ctx.propertyId, pregunta)
  }

  // 3) ¿Auto-envío (Fase 2) o propuesta por Telegram (Fase 1 / sensible)?
  const puedeAuto = !dec.needs_human && dec.reply && await autoPermitido(dec.categoria, dec.confidence)
  if (puedeAuto) {
    const ok = await enviarAlHuesped(ctx.reservationId, dec.reply)
    await logMensaje({ bookingId, propertyId: ctx.propertyId, categoria: dec.categoria, pregunta, respuesta: dec.reply, fuente: dec.fuente, confidence: dec.confidence, sentimiento: dec.sentimiento, needs_human: false, auto_sent: ok, edited: false })
    return { accion: ok ? 'auto_enviado' : 'fallo_envio' }
  }

  await proponerPorTelegram(ctx, pregunta, dec)
  await logMensaje({ bookingId, propertyId: ctx.propertyId, categoria: dec.categoria, pregunta, respuesta: dec.reply, fuente: dec.fuente, confidence: dec.confidence, sentimiento: dec.sentimiento, needs_human: dec.needs_human, auto_sent: false, edited: false })
  return { accion: 'propuesto_telegram' }
}
```

- [ ] **Step 3: Verificar build + Commit**

Run: `cd apps/plataforma && npx tsc --noEmit`

```bash
git add apps/plataforma/lib/sivra/agente-huesped/telegram-msg.ts apps/plataforma/lib/sivra/agente-huesped/orquestador.ts
git commit -m "feat(plataforma): propuesta por Telegram + orquestador del agente"
```

---

### Task 13: Webhook receptor de Smoobu (`newMessage`)

**Files:**
- Create: `apps/plataforma/app/api/sivra/mensajes/webhook/route.ts`

- [ ] **Step 1: Implementar**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { procesarMensajeHuesped } from '@/lib/sivra/agente-huesped/orquestador'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST público (Smoobu lo llama). Verifica un token simple por querystring (?k=SMOOBU_WEBHOOK_SECRET).
// Smoobu envía { action, data:{ ... booking id ... }, ... } con action "newMessage" y sender "guest".
export async function POST(req: NextRequest) {
  const secret = process.env.SMOOBU_WEBHOOK_SECRET
  if (secret && req.nextUrl.searchParams.get('k') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const body = await req.json().catch(() => ({} as any))
  const action = body?.action || body?.event
  if (action !== 'newMessage') return NextResponse.json({ ok: true, skipped: 'action' })

  const data = body?.data || body
  const sender = data?.sender || data?.message?.sender
  if (sender && sender !== 'guest') return NextResponse.json({ ok: true, skipped: 'sender' })

  const bookingId = String(data?.bookingId || data?.reservationId || data?.booking?.id || data?.id || '')
  if (!bookingId) return NextResponse.json({ ok: false, error: 'sin bookingId' }, { status: 400 })

  // Responder rápido a Smoobu; procesar dentro del mismo request (maxDuration 60s).
  try {
    const r = await procesarMensajeHuesped(bookingId)
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verificar build + Commit**

Run: `cd apps/plataforma && npx tsc --noEmit && npx next build`

```bash
git add apps/plataforma/app/api/sivra/mensajes/webhook/route.ts
git commit -m "feat(plataforma): webhook newMessage de Smoobu → agente en tiempo real"
```

- [ ] **Step 3: Tras deploy, registrar la URL en Smoobu**

En Smoobu → Settings → API → webhook URL: `https://<plataforma>/api/sivra/mensajes/webhook?k=<SMOOBU_WEBHOOK_SECRET>`. Probar enviándote un mensaje de prueba desde una reserva y verificar en logs de Vercel que llega `action=newMessage`.

---

### Task 14: Webhook de Telegram (aceptar / modificar / conceder)

**Files:**
- Create: `apps/plataforma/app/api/sivra/mensajes/telegram-webhook/route.ts`

- [ ] **Step 1: Implementar**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { parseCallback, tgAnswerCallback, tgAskForReply, verifyTelegramWebhook } from '@central/core-telegram'
import { enviarAlHuesped } from '@/lib/sivra/agente-huesped/enviar'
import { confirmarEnviado } from '@/lib/sivra/agente-huesped/telegram-msg'
import { aprenderCorreccion, logMensaje } from '@/lib/sivra/agente-huesped/aprender'

export const dynamic = 'force-dynamic'

async function getPendiente(bookingId: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT * FROM mensajes_pendientes_tg WHERE booking_id = ${bookingId} LIMIT 1`)
  return rows[0] || null
}

export async function POST(req: NextRequest) {
  if (!verifyTelegramWebhook(req.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const body = await req.json().catch(() => ({} as any))

  // A) Pulsación de botón.
  const cb = body.callback_query
  if (cb) {
    const { prefix, action, args } = parseCallback(cb.data || '')
    if (prefix !== 'hsp') return NextResponse.json({ ok: true }) // no es de este agente (bot compartido)
    const bookingId = args[0]
    const pend = bookingId ? await getPendiente(bookingId) : null
    if (!pend) { await tgAnswerCallback(cb.id, 'Ya no está disponible'); return NextResponse.json({ ok: true }) }

    if (action === 'send' || action === 'grant') {
      const ok = await enviarAlHuesped(bookingId, pend.borrador)
      await tgAnswerCallback(cb.id, ok ? 'Enviado ✅' : 'Error al enviar')
      await confirmarEnviado(pend.tg_message_id, pend.borrador)
      await prisma.$executeRaw(Prisma.sql`UPDATE mensajes_log SET auto_sent = ${ok} WHERE booking_id = ${bookingId} AND created_at = (SELECT max(created_at) FROM mensajes_log WHERE booking_id = ${bookingId})`).catch(() => {})
      await prisma.$executeRaw(Prisma.sql`DELETE FROM mensajes_pendientes_tg WHERE booking_id = ${bookingId}`).catch(() => {})
      return NextResponse.json({ ok: true })
    }
    if (action === 'edit') {
      await tgAnswerCallback(cb.id, 'Escribe tu respuesta')
      await tgAskForReply(`✏️ Responde a este mensaje con el texto para el huésped (reserva ${bookingId})`)
      await prisma.$executeRaw(Prisma.sql`UPDATE mensajes_pendientes_tg SET esperando_edit = true WHERE booking_id = ${bookingId}`).catch(() => {})
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: true })
  }

  // B) Respuesta de texto (force_reply) → es una modificación. Liga por el booking del texto citado.
  const msg = body.message
  if (msg?.reply_to_message?.text) {
    const m = msg.reply_to_message.text.match(/reserva (\w+)/)
    const bookingId = m?.[1]
    const pend = bookingId ? await getPendiente(bookingId) : null
    if (pend && pend.esperando_edit) {
      const texto = msg.text || ''
      const ok = await enviarAlHuesped(bookingId, texto)
      await aprenderCorreccion({ propertyId: pend.property_id, categoria: pend.categoria, pregunta: '', respuestaFinal: texto })
      await logMensaje({ bookingId, propertyId: pend.property_id, categoria: pend.categoria, pregunta: '', respuesta: texto, fuente: 'ia', confidence: 0, sentimiento: 'neutro', needs_human: true, auto_sent: ok, edited: true })
      await prisma.$executeRaw(Prisma.sql`DELETE FROM mensajes_pendientes_tg WHERE booking_id = ${bookingId}`).catch(() => {})
      return NextResponse.json({ ok: true, edited: true })
    }
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verificar build + Commit**

Run: `cd apps/plataforma && npx tsc --noEmit && npx next build`

```bash
git add apps/plataforma/app/api/sivra/mensajes/telegram-webhook/route.ts
git commit -m "feat(plataforma): webhook Telegram (aceptar/modificar/conceder) del agente"
```

- [ ] **Step 3: Tras deploy, registrar el webhook del bot (un solo webhook por bot)**

> **Importante:** un bot solo admite un webhook. Si el bot ya tiene webhook en ia-rest, decidir el receptor único (ver spec §8). Para apuntarlo a plataforma:
`curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<plataforma>/api/sivra/mensajes/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"`
El receptor ignora callbacks cuyo prefijo no sea `hsp` (no rompe otros usos del bot si conviven en el mismo receptor).

---

## FASE 4 — Disparo de respaldo y resumen

### Task 15: Cron de red de seguridad + resumen diario

**Files:**
- Modify: `apps/plataforma/app/api/sivra/mensajes/auto-reply/route.ts`
- Create: `apps/plataforma/app/api/sivra/mensajes/resumen-diario/route.ts`
- Modify: `apps/plataforma/vercel.json`

- [ ] **Step 1: Red de seguridad — reusar el orquestador en `auto-reply`**

Modificar `auto-reply/route.ts`: tras la auth de cron existente, listar los hilos con mensaje de huésped sin responder (la lógica de listado de `mensajes/route.ts`) y para cada `bookingId` que **no** tenga ya una fila reciente en `mensajes_log` ni pendiente en `mensajes_pendientes_tg`, llamar `await procesarMensajeHuesped(bookingId)`. Mantener el envío de alerta por email solo como fallback si Telegram no está configurado.

```typescript
// (al principio del archivo)
import { procesarMensajeHuesped } from '@/lib/sivra/agente-huesped/orquestador'
// (dentro del handler, sustituyendo el procesado por-email por:)
// for (const t of threadsSinResponder) { await procesarMensajeHuesped(String(t.bookingId)) }
```

- [ ] **Step 2: Crear `resumen-diario/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { tgSend } from '@central/core-telegram'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stats = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE auto_sent)::int AS auto,
           count(*) FILTER (WHERE needs_human AND NOT auto_sent)::int AS pendientes
    FROM mensajes_log WHERE created_at >= now() - interval '24 hours'
  `)
  const gaps = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT pregunta, veces FROM mensajes_guia_gaps ORDER BY veces DESC, ultima_fecha DESC LIMIT 3
  `)
  const s = stats[0] || { total: 0, auto: 0, pendientes: 0 }
  const lineaGaps = gaps.length ? `\n📈 Guía floja en: ${gaps.map(g => `${g.pregunta} (x${g.veces})`).join(' · ')}` : ''
  await tgSend(`📊 <b>Huéspedes (24h)</b>\n${s.total} mensajes · ${s.auto} auto · ${s.pendientes} te esperan${lineaGaps}`)
  return NextResponse.json({ ok: true, ...s })
}
```

- [ ] **Step 3: Añadir el cron en `vercel.json`**

Añadir al array `crons`:
```json
{ "path": "/api/sivra/mensajes/resumen-diario", "schedule": "0 19 * * *" }
```
(El cron `auto-reply` ya existe a las `0 6 * * *` — se mantiene como red de seguridad.)

- [ ] **Step 4: Verificar build + Commit**

Run: `cd apps/plataforma && npx tsc --noEmit && npx next build`

```bash
git add apps/plataforma/app/api/sivra/mensajes/auto-reply/route.ts apps/plataforma/app/api/sivra/mensajes/resumen-diario/route.ts apps/plataforma/vercel.json
git commit -m "feat(plataforma): red de seguridad por cron + resumen diario por Telegram"
```

---

## FASE 5 — Upsell (extra restante)

### Task 16: Upsell de early/late check-in como extra de pago

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/decidir.ts`

> El escudo de reseñas (sentimiento), la auto-mejora de la guía (gaps) y el resumen diario ya quedaron implementados en Tasks 9, 11, 12 y 15. Falta el upsell.

- [ ] **Step 1: Inyectar la pista de upsell en el system prompt**

En `decidir.ts`, añadir al `system` (antes del bloque "Devuelve SOLO un JSON"):

```typescript
  + `\n\nUPSELL: si el huésped pide early check-in o late check-out y no podemos darlo gratis, ofrece amablemente la opción como servicio de pago (sin importe concreto; di que se gestiona por la app de Smoobu del huésped). Nunca presiones.`
```

- [ ] **Step 2: Verificar build + Commit**

Run: `cd apps/plataforma && npx tsc --noEmit`

```bash
git add apps/plataforma/lib/sivra/agente-huesped/decidir.ts
git commit -m "feat(plataforma): upsell de early/late check-in en el agente"
```

---

## Verificación final (antes de cerrar)

- [ ] `cd apps/plataforma && npx tsc --noEmit && npx next build` → build OK.
- [ ] `cd apps/plataforma && node --test lib/sivra/agente-huesped/*.test.ts` → todos los tests pasan.
- [ ] `cd packages/core-telegram && node --test` → pasa.
- [ ] Las 6 tablas existen en Supabase (`list_tables`).
- [ ] Sondeo (Task 1) ejecutado en Vercel y veredicto anotado en el spec; `guia.ts` ajustado si era SPA.
- [ ] Webhook de Smoobu registrado y probado con un mensaje real.
- [ ] Webhook de Telegram registrado; probado aceptar y modificar con una reserva real.
- [ ] Envs en Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `SMOOBU_WEBHOOK_SECRET` (+ `SMOOBU_API_KEY`, `CRON_SECRET`, IA ya existentes).
- [ ] Arranque conservador: `mensajes_auto_config` vacía ⇒ todo se propone por Telegram (Fase 1). Activar auto por categoría solo tras ver alto acierto en `mensajes_log`.

## Notas de seguridad / landmines

- DB compartida con ialimp: solo tablas nuevas; no se tocó RLS/grants.
- El webhook de Smoobu es público: protegido por `?k=SMOOBU_WEBHOOK_SECRET` + filtro `action`/`sender` + idempotencia (no reprocesar si ya hay log/pendiente del booking).
- El bot de Telegram es compartido: el receptor enruta por prefijo `hsp_` y **ignora** lo que no sea suyo.
- Secretos solo como nombres de variable; valores en Vercel.
