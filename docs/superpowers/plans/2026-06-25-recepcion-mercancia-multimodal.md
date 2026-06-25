# Recepción de mercancía multi-modal — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer la recepción de mercancía de `/produccion` (cocina central) para que lea bien packs de súper, albaranes y etiquetas de mayorista, con escáner EAN, motor Gemini Vision, captura de lote/caducidad/Tª, foto-evidencia APPCC y aviso FEFO en pantalla.

**Architecture:** 3 vías de entrada (escáner EAN cliente · foto con OCR Gemini · manual) vuelcan en la cola de revisión `recPendientes` existente. El motor de visión `callAIVision` gana un fallback real Gemini→NIM en el núcleo compartido `@central/core-ai`. Migraciones aditivas en `cocina_recepciones` y un bucket de Storage `recepciones` para la prueba documental.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (schema `iarest` + Storage), `@central/core-ai` (adaptadores puros), Gemini 2.0 Flash (visión), `BarcodeDetector` + `@zxing/browser`, `node --test`.

**Referencia base (spec):** `docs/superpowers/specs/2026-06-25-recepcion-mercancia-multimodal-design.md`

**Decisiones cerradas por Alberto:** (1) `callAIVision` reordenado **global** (gateway → Gemini → NIM → error). (2) Bucket de Storage **`recepciones` nuevo y privado**.

**Convención de verificación del proyecto:** pre-push `npx tsc --noEmit` (0 errores) **y** `next build` con deps (reproduce Vercel; `tsc` solo no basta). Tests puros con `node --test`.

---

## Estructura de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `packages/core-ai/src/gemini.ts` | Modificar | Añadir `geminiVision()` (OCR de imágenes con inlineData) |
| `packages/core-ai/src/index.ts` | Modificar | Exportar `geminiVision` |
| `packages/core-ai/test/gemini-vision.test.ts` | Crear | Unit test del adaptador (mock fetch) |
| `apps/ia-rest/src/lib/ai-client.ts` | Modificar | `callAIVision`: gateway → Gemini → NIM → error |
| `apps/ia-rest/src/lib/recepcion-ean.ts` | Crear | Helper `nombrePorEan` (extraído) + tipos |
| `apps/ia-rest/test/recepcion-ean.test.ts` | Crear | Unit test del helper (mock fetch) |
| `apps/ia-rest/src/lib/recepcion-caducidades.ts` | Crear | Lógica pura FEFO `clasificarCaducidades` |
| `apps/ia-rest/test/recepcion-caducidades.test.ts` | Crear | Unit test FEFO |
| `apps/ia-rest/src/app/api/cocina/recepciones/reconocer/route.ts` | Modificar | Usar helper extraído; subir maxTokens |
| `apps/ia-rest/src/app/api/cocina/recepciones/ean/route.ts` | Crear | Resolver EAN: catálogo propio → Open Food Facts |
| `apps/ia-rest/src/app/api/cocina/recepciones/temperatura/route.ts` | Crear | Leer Tª de foto de sonda (Gemini) |
| `apps/ia-rest/src/app/api/cocina/recepciones/caducidades/route.ts` | Crear | Listar productos caducados / por caducar |
| `apps/ia-rest/src/app/api/cocina/recepciones/evidencia/route.ts` | Crear | Subir foto-albarán original a Storage |
| `apps/ia-rest/src/app/api/cocina/recepciones/route.ts` | Modificar | Persistir `codigo_barras` + `evidencia_url` |
| `apps/ia-rest/src/app/produccion/page.tsx` | Modificar | Escáner EAN, escaneo continuo, foto Tª, banner FEFO, subida evidencia, campo EAN |
| `apps/ia-rest/package.json` | Modificar | Dep `@zxing/browser` |
| BD (schema `iarest`, vía Supabase MCP) | Migración | `cocina_recepciones.codigo_barras`, `.evidencia_url` + índice |
| Supabase Storage (vía MCP/SQL) | Crear | Bucket privado `recepciones` |

---

## FASE B — Motor Gemini Vision (núcleo compartido)

> Se hace primero porque las fases 2 y la mejora de la foto dependen de ella.

### Task 1: `geminiVision()` en el núcleo compartido

**Files:**
- Modify: `packages/core-ai/src/gemini.ts`
- Modify: `packages/core-ai/src/index.ts`
- Test: `packages/core-ai/test/gemini-vision.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// packages/core-ai/test/gemini-vision.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { geminiVision } from '../src/gemini.ts'

const IMG = { data: 'AAAA', mediaType: 'image/jpeg' }

test('geminiVision envía inlineData y devuelve el texto', async () => {
  const calls: any[] = []
  const fakeFetch = async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }) }
  }
  const out = await geminiVision({ apiKey: 'k' }, 'sys', [IMG], 'lee', { fetchImpl: fakeFetch as any })
  assert.equal(out, '{"ok":true}')
  const part = calls[0].body.contents[0].parts.find((p: any) => p.inline_data)
  assert.equal(part.inline_data.mime_type, 'image/jpeg')
  assert.equal(part.inline_data.data, 'AAAA')
})

test('geminiVision lanza si no hay apiKey', async () => {
  await assert.rejects(() => geminiVision({ apiKey: '' }, 's', [IMG], 'x'))
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `cd packages/core-ai && node --test --experimental-strip-types test/gemini-vision.test.ts`
Expected: FAIL — `geminiVision` no existe.

- [ ] **Step 3: Implementar `geminiVision` en `gemini.ts`**

Añadir al principio el import de tipos y, al final del fichero, la función. `fetchImpl` permite inyectar fetch en tests (default `globalThis.fetch`).

```ts
// añadir al import de tipos al inicio del fichero:
import type { ImageInput } from './types'

// añadir al final de gemini.ts:
/**
 * Visión/OCR con Gemini Flash. Acepta imágenes grandes (muy por encima del tope
 * inline de NIM). Adaptador PURO: la política de fallback la decide la app.
 */
export async function geminiVision(
  config: GeminiConfig,
  system: string,
  images: ImageInput[],
  userText: string,
  opts: { maxTokens?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  if (!config.apiKey) throw new Error('Gemini: apiKey requerida')
  const maxTokens = opts.maxTokens ?? 2000
  const timeoutMs = opts.timeoutMs ?? 45_000
  const model = config.model ?? DEFAULT_GEMINI_MODEL
  const doFetch = opts.fetchImpl ?? fetch

  const parts = [
    ...images.map(img => ({ inline_data: { mime_type: img.mediaType, data: img.data } })),
    { text: userText },
  ]

  const res = await Promise.race([
    doFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 },
        }),
      },
    ),
    new Promise<never>((_, r) => setTimeout(() => r(new Error('Gemini-Vision timeout')), timeoutMs)),
  ])

  if (!res.ok) throw new Error(`Gemini-Vision HTTP ${res.status}: ${(await res.text()).substring(0, 150)}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
  if (!text) throw new Error('Gemini-Vision: respuesta vacía')
  return text
}
```

- [ ] **Step 4: Exportar en `index.ts`**

Cambiar la línea de export de gemini:

```ts
export { geminiSearch, geminiVision } from './gemini'
```

- [ ] **Step 5: Correr el test y ver que pasa**

Run: `cd packages/core-ai && node --test --experimental-strip-types test/gemini-vision.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core-ai/src/gemini.ts packages/core-ai/src/index.ts packages/core-ai/test/gemini-vision.test.ts
git commit -m "feat(core-ai): adaptador geminiVision (OCR con imágenes grandes)"
```

### Task 2: `callAIVision` con fallback real Gemini → NIM

**Files:**
- Modify: `apps/ia-rest/src/lib/ai-client.ts:287-321` (función `callAIVision`) y zona de imports/helpers

- [ ] **Step 1: Añadir import y helper Gemini en `ai-client.ts`**

En el import de `@central/core-ai` (línea 1), añadir `geminiVision`:

```ts
import { cleanJSON, nimText, nimVision, geminiSearch, geminiVision, nimChatTools, groqText, groqChatTools, gatewayChat, gatewaySearch, gatewayVision, gatewayTools } from '@central/core-ai'
```

Añadir un helper junto a `nvidiaVision` (tras la línea 118):

```ts
// ── Gemini: visión/OCR (fallback de calidad, delega en @central/core-ai) ──────
async function geminiVisionCall(system: string, images: ImageInput[], userText: string, maxTokens = 2000): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada')
  return geminiVision({ apiKey }, system, images, userText, { maxTokens })
}
```

- [ ] **Step 2: Reescribir `callAIVision` (gateway → Gemini → NIM → error)**

Reemplazar la función completa (líneas 287-321) por:

```ts
export async function callAIVision(
  system: string,
  images: ImageInput[],
  userText: string,
  maxTokens = 2000,
  timeoutMs = 30_000,
  // Legacy: antaño evitaba el fallback de pago a Anthropic (retirado). Ya NO bloquea Gemini.
  noFallback = true
): Promise<string> {
  // 1) Pasarela central (NIM vision por debajo) si está configurada.
  const cfg = gatewayCfg()
  if (cfg) {
    try {
      return await gatewayVision(cfg, system, images, userText, { maxTokens })
    } catch (e) {
      console.warn('[AI-CLIENT] pasarela vision falló, fallback directo:', (e as Error).message)
    }
  }

  // 2) Gemini Flash: mejor OCR y acepta imágenes grandes. Es el camino preferido directo.
  if (process.env.GEMINI_API_KEY) {
    try {
      return await Promise.race([
        geminiVisionCall(system, images, userText, maxTokens),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('Gemini-Vision timeout')), timeoutMs)),
      ])
    } catch (e) {
      console.warn('[AI-CLIENT] Gemini-Vision falló, fallback NIM:', (e as Error).message)
    }
  }

  // 3) NIM como último recurso (límite ~180 KB inline).
  if (process.env.NVIDIA_API_KEY) {
    try {
      return await Promise.race([
        nvidiaVision(system, images, userText, maxTokens),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('NVIDIA-Vision timeout')), timeoutMs)),
      ])
    } catch (e) {
      console.warn('[AI-CLIENT] NVIDIA-Vision falló:', (e as Error).message)
    }
  }

  throw new Error('[AI-CLIENT] Sin proveedor de visión disponible (Gemini/NIM)')
}
```

> ⚠️ Cambio de radio amplio: afecta a TODOS los consumidores de visión. Va marcado para code-review en el PR.

- [ ] **Step 3: Verificar tipos**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add apps/ia-rest/src/lib/ai-client.ts
git commit -m "feat(ia-rest): callAIVision con fallback real Gemini->NIM"
```

---

## FASE C(parcial) — Migración BD + bucket Storage

### Task 3: Migración `cocina_recepciones` + bucket `recepciones`

**Files:**
- Migración aplicada vía Supabase MCP (`mcp__Supabase__apply_migration`) al proyecto `wswbehlcuxqxyinousql`, schema `iarest`.

- [ ] **Step 1: Aplicar migración de columnas**

`apply_migration` name `recepciones_ean_evidencia`:

```sql
ALTER TABLE iarest.cocina_recepciones
  ADD COLUMN IF NOT EXISTS codigo_barras text,
  ADD COLUMN IF NOT EXISTS evidencia_url text;

CREATE INDEX IF NOT EXISTS idx_cocina_recepciones_ean
  ON iarest.cocina_recepciones (local_id, codigo_barras)
  WHERE codigo_barras IS NOT NULL;
```

- [ ] **Step 2: Crear bucket privado `recepciones`**

`execute_sql`:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('recepciones', 'recepciones', false)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 3: Verificar**

`execute_sql`: `SELECT column_name FROM information_schema.columns WHERE table_schema='iarest' AND table_name='cocina_recepciones' AND column_name IN ('codigo_barras','evidencia_url');`
Expected: 2 filas. Y `SELECT id FROM storage.buckets WHERE id='recepciones';` → 1 fila.

> Sin commit (cambio en BD remota). Anotar en el PR que la migración ya está aplicada.

---

## FASE A — Escáner EAN + catálogo propio

### Task 4: Helper `nombrePorEan` extraído + test

**Files:**
- Create: `apps/ia-rest/src/lib/recepcion-ean.ts`
- Modify: `apps/ia-rest/src/app/api/cocina/recepciones/reconocer/route.ts` (usar el helper)
- Test: `apps/ia-rest/test/recepcion-ean.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// apps/ia-rest/test/recepcion-ean.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nombrePorEan } from '../src/lib/recepcion-ean.ts'

test('nombrePorEan combina nombre y marca de Open Food Facts', async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ status: 1, product: { product_name_es: 'Atún claro', brands: 'Hacendado' } }) })
  const r = await nombrePorEan('8480000180186', fakeFetch as any)
  assert.equal(r, 'Atún claro (Hacendado)')
})

test('nombrePorEan devuelve null si no existe', async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ status: 0 }) })
  assert.equal(await nombrePorEan('0000', fakeFetch as any), null)
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/ia-rest && node --test --experimental-strip-types test/recepcion-ean.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Crear `recepcion-ean.ts`**

```ts
// apps/ia-rest/src/lib/recepcion-ean.ts
// Resolución de un EAN a nombre de producto vía Open Food Facts. Helper PURO
// (fetch inyectable) reutilizado por la foto-recepción y por la ruta /ean.

/** Resuelve el nombre de un producto a partir de su código de barras (Open Food Facts). */
export async function nombrePorEan(ean: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const r = await fetchImpl(
      `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=product_name,product_name_es,brands`,
      { headers: { 'User-Agent': 'ia.rest/1.0 (recepcion mercancia)' }, signal: AbortSignal.timeout(6000) },
    )
    if (!r.ok) return null
    const j = await r.json()
    const p = j?.product
    if (j?.status !== 1 || !p) return null
    const nombre = String(p.product_name_es || p.product_name || '').trim()
    if (!nombre) return null
    const marca = String(p.brands || '').split(',')[0]?.trim()
    return marca && !nombre.toLowerCase().includes(marca.toLowerCase()) ? `${nombre} (${marca})` : nombre
  } catch { return null }
}
```

- [ ] **Step 4: Usar el helper en `reconocer/route.ts`**

Borrar la función local `nombrePorEan` (líneas 38-54) y añadir el import tras los existentes:

```ts
import { nombrePorEan } from '@/lib/recepcion-ean'
```

Y subir el `maxTokens` de la llamada de visión (línea 71) de `1200` a `2000`.

- [ ] **Step 5: Correr el test y ver que pasa + tipos**

Run: `cd apps/ia-rest && node --test --experimental-strip-types test/recepcion-ean.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests) y 0 errores TS.

- [ ] **Step 6: Commit**

```bash
git add apps/ia-rest/src/lib/recepcion-ean.ts apps/ia-rest/test/recepcion-ean.test.ts apps/ia-rest/src/app/api/cocina/recepciones/reconocer/route.ts
git commit -m "refactor(ia-rest): extraer nombrePorEan a helper + subir maxTokens OCR"
```

### Task 5: Endpoint `GET /api/cocina/recepciones/ean`

**Files:**
- Create: `apps/ia-rest/src/app/api/cocina/recepciones/ean/route.ts`

- [ ] **Step 1: Crear la ruta**

```ts
// apps/ia-rest/src/app/api/cocina/recepciones/ean/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { nombrePorEan } from '@/lib/recepcion-ean'

/** GET /api/cocina/recepciones/ean?code=8480000180186 — resuelve EAN a producto. */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const code = (req.nextUrl.searchParams.get('code') || '').replace(/\D/g, '')
  if (!/^\d{8,14}$/.test(code)) return NextResponse.json({ error: 'EAN inválido' }, { status: 400 })

  const supabase = createServerClient()
  // 1) Catálogo propio: ¿hemos recibido antes este EAN en este local?
  const { data: previo } = await supabase
    .from('cocina_recepciones')
    .select('producto, proveedor')
    .eq('local_id', rid).eq('codigo_barras', code)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (previo?.producto) {
    return NextResponse.json({ ok: true, codigo_barras: code, producto: previo.producto, proveedor: previo.proveedor ?? null, fuente: 'catalogo' })
  }
  // 2) Open Food Facts
  const nombre = await nombrePorEan(code)
  if (nombre) return NextResponse.json({ ok: true, codigo_barras: code, producto: nombre, proveedor: null, fuente: 'openfoodfacts' })
  // 3) Desconocido
  return NextResponse.json({ ok: true, codigo_barras: code, producto: '', proveedor: null, fuente: 'desconocido' })
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/app/api/cocina/recepciones/ean/route.ts
git commit -m "feat(ia-rest): ruta /ean (catálogo propio -> Open Food Facts)"
```

### Task 6: Persistir `codigo_barras` + `evidencia_url` al registrar

**Files:**
- Modify: `apps/ia-rest/src/app/api/cocina/recepciones/route.ts` (POST, insert)

- [ ] **Step 1: Añadir campos al insert**

En el objeto `.insert({...})` del POST, tras `conforme`, añadir:

```ts
      codigo_barras: typeof body.codigo_barras === 'string' && body.codigo_barras.trim() ? body.codigo_barras.replace(/\D/g, '') || null : null,
      evidencia_url: typeof body.evidencia_url === 'string' && body.evidencia_url.trim() ? body.evidencia_url.trim() : null,
```

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/app/api/cocina/recepciones/route.ts
git commit -m "feat(ia-rest): persistir codigo_barras y evidencia_url en recepción"
```

---

## FASE 2 — Temperatura por foto de la sonda

### Task 7: Endpoint `POST /api/cocina/recepciones/temperatura`

**Files:**
- Create: `apps/ia-rest/src/app/api/cocina/recepciones/temperatura/route.ts`

- [ ] **Step 1: Crear la ruta**

```ts
// apps/ia-rest/src/app/api/cocina/recepciones/temperatura/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAIVision, cleanJSON } from '@/lib/ai-client'

export const maxDuration = 60

const PROMPT = `Eres un asistente de cocina. En la imagen hay el DISPLAY de un termómetro/sonda de temperatura.
Devuelve ÚNICAMENTE JSON válido sin markdown: {"temperatura": número en °C o null}.
Interpreta el signo (frío puede ser negativo). Si no ves un número claro, devuelve null.`

export async function POST(req: NextRequest) {
  const session = getSession(req)
  const rid = getRestauranteId(req)
  if (!session || !rid) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const { imagen, mediaType = 'image/jpeg' } = await req.json()
  if (!imagen || typeof imagen !== 'string') return NextResponse.json({ error: 'imagen requerida' }, { status: 400 })
  if (imagen.length > 5_000_000) return NextResponse.json({ error: 'Imagen demasiado grande' }, { status: 400 })

  const mt = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType) ? mediaType : 'image/jpeg'
  try {
    const raw = await callAIVision(PROMPT, [{ data: imagen, mediaType: mt }], 'Lee la temperatura del display.', 200)
    const parsed = JSON.parse(cleanJSON(raw))
    const t = parsed.temperatura
    return NextResponse.json({ ok: true, temperatura: t != null && t !== '' && !isNaN(Number(t)) ? Number(t) : null })
  } catch (e) {
    console.error('[cocina/recepciones/temperatura]', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'No se pudo leer la temperatura.' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/app/api/cocina/recepciones/temperatura/route.ts
git commit -m "feat(ia-rest): leer temperatura de foto de sonda (Gemini)"
```

---

## FASE 3 — Foto-evidencia archivada

### Task 8: Endpoint `POST /api/cocina/recepciones/evidencia`

**Files:**
- Create: `apps/ia-rest/src/app/api/cocina/recepciones/evidencia/route.ts`

- [ ] **Step 1: Crear la ruta (sube original a bucket privado + URL firmada larga)**

```ts
// apps/ia-rest/src/app/api/cocina/recepciones/evidencia/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export const maxDuration = 60

function hoy(): string { return new Date().toISOString().slice(0, 10) }

/** POST /api/cocina/recepciones/evidencia — sube la foto original del albarán/etiqueta. */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (file.size > 8_000_000) return NextResponse.json({ error: 'Archivo demasiado grande' }, { status: 400 })

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const rand = Math.random().toString(36).slice(2, 10)
  const path = `${rid}/${hoy()}/${rand}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const supabase = createServerClient()
  const { error } = await supabase.storage.from('recepciones').upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // URL firmada de larga duración (1 año) para la prueba documental.
  const { data: signed } = await supabase.storage.from('recepciones').createSignedUrl(path, 60 * 60 * 24 * 365)
  return NextResponse.json({ ok: true, path, url: signed?.signedUrl ?? null })
}
```

> Nota: `Math.random()` aquí corre en runtime de Vercel (no en un workflow), es válido.

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/app/api/cocina/recepciones/evidencia/route.ts
git commit -m "feat(ia-rest): subir foto-evidencia de recepción a Storage (APPCC)"
```

---

## FASE 4 — FEFO on-screen

### Task 9: Lógica pura `clasificarCaducidades` + test

**Files:**
- Create: `apps/ia-rest/src/lib/recepcion-caducidades.ts`
- Test: `apps/ia-rest/test/recepcion-caducidades.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// apps/ia-rest/test/recepcion-caducidades.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarCaducidades } from '../src/lib/recepcion-caducidades.ts'

const HOY = '2026-06-25'
const filas = [
  { producto: 'A', caducidad: '2026-06-20' }, // caducado
  { producto: 'B', caducidad: '2026-06-26' }, // por caducar (≤3d)
  { producto: 'C', caducidad: '2026-07-30' }, // ok
  { producto: 'D', caducidad: null },          // sin fecha
]

test('separa caducados y por caducar, ordenados', () => {
  const r = clasificarCaducidades(filas, HOY, 3)
  assert.deepEqual(r.caducados.map(x => x.producto), ['A'])
  assert.deepEqual(r.porCaducar.map(x => x.producto), ['B'])
  assert.equal(r.total, 2)
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/ia-rest && node --test --experimental-strip-types test/recepcion-caducidades.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

```ts
// apps/ia-rest/src/lib/recepcion-caducidades.ts
// Lógica PURA FEFO (First-Expired-First-Out): separa lo caducado de lo que caduca pronto.

export interface FilaCad { producto: string; caducidad: string | null; [k: string]: unknown }
export interface ResultadoFEFO<T> { caducados: T[]; porCaducar: T[]; total: number }

/** Clasifica filas por caducidad respecto a `hoy` (YYYY-MM-DD) y un umbral en días. */
export function clasificarCaducidades<T extends FilaCad>(filas: T[], hoy: string, dias = 3): ResultadoFEFO<T> {
  const hoyMs = Date.parse(hoy + 'T00:00:00Z')
  const umbralMs = hoyMs + dias * 86_400_000
  const conFecha = filas.filter(f => f.caducidad && !isNaN(Date.parse(f.caducidad + 'T00:00:00Z')))
  const ms = (f: T) => Date.parse(f.caducidad + 'T00:00:00Z')
  const caducados = conFecha.filter(f => ms(f) < hoyMs).sort((a, b) => ms(a) - ms(b))
  const porCaducar = conFecha.filter(f => ms(f) >= hoyMs && ms(f) <= umbralMs).sort((a, b) => ms(a) - ms(b))
  return { caducados, porCaducar, total: caducados.length + porCaducar.length }
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `cd apps/ia-rest && node --test --experimental-strip-types test/recepcion-caducidades.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ia-rest/src/lib/recepcion-caducidades.ts apps/ia-rest/test/recepcion-caducidades.test.ts
git commit -m "feat(ia-rest): lógica FEFO pura (clasificarCaducidades)"
```

### Task 10: Endpoint `GET /api/cocina/recepciones/caducidades`

**Files:**
- Create: `apps/ia-rest/src/app/api/cocina/recepciones/caducidades/route.ts`

- [ ] **Step 1: Crear la ruta**

```ts
// apps/ia-rest/src/app/api/cocina/recepciones/caducidades/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { clasificarCaducidades } from '@/lib/recepcion-caducidades'

/** GET /api/cocina/recepciones/caducidades?dias=3 — productos caducados / por caducar. */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const dias = Math.max(0, Math.min(60, Number(req.nextUrl.searchParams.get('dias')) || 3))

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('cocina_recepciones')
    .select('id, producto, lote, caducidad, proveedor')
    .eq('local_id', rid).not('caducidad', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const hoy = new Date().toISOString().slice(0, 10)
  const r = clasificarCaducidades((data ?? []) as Array<{ producto: string; caducidad: string | null }>, hoy, dias)
  return NextResponse.json({ ok: true, ...r })
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/app/api/cocina/recepciones/caducidades/route.ts
git commit -m "feat(ia-rest): ruta caducidades FEFO"
```

---

## FASE A+5+2+3+4 (UI) — `produccion/page.tsx`

> Una sola tarea grande de UI que integra escáner, escaneo continuo, foto Tª, banner FEFO y subida de evidencia sobre la cola existente. Se hace al final porque consume todos los endpoints anteriores.

### Task 11: Dep `@zxing/browser`

**Files:**
- Modify: `apps/ia-rest/package.json`

- [ ] **Step 1: Instalar la dependencia**

Run: `cd apps/ia-rest && npm install @zxing/browser@0.1.5 --legacy-peer-deps`
Expected: añade `@zxing/browser` a `dependencies`.

- [ ] **Step 2: Commit**

```bash
git add apps/ia-rest/package.json apps/ia-rest/package-lock.json
git commit -m "chore(ia-rest): dep @zxing/browser (fallback escáner EAN)"
```

### Task 12: Tipos de cola + estado nuevo

**Files:**
- Modify: `apps/ia-rest/src/app/produccion/page.tsx`

- [ ] **Step 1: Ampliar el tipo `RecPendiente` (línea 39)**

```ts
type RecPendiente = { producto: string; proveedor: string; lote: string; temperatura: string; caducidad: string; conforme: boolean; codigo_barras?: string; evidencia_url?: string }
```

Y en TODOS los sitios que crean filas (`+ Manual`, plantilla, IA) los nuevos campos son opcionales → no requieren cambios obligatorios.

- [ ] **Step 2: Añadir estado del escáner y FEFO tras `recLeyendo` (línea 380)**

```ts
  const [scanAbierto, setScanAbierto] = useState(false)
  const [fefo, setFefo] = useState<{ caducados: Array<{ producto: string; caducidad: string }>; porCaducar: Array<{ producto: string; caducidad: string }>; total: number } | null>(null)
```

- [ ] **Step 3: Verificar tipos**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

### Task 13: Handlers de escáner, EAN, Tª y evidencia

**Files:**
- Modify: `apps/ia-rest/src/app/produccion/page.tsx` (tras `añadirFotoACola`)

- [ ] **Step 1: Añadir helpers de resolución EAN y carga FEFO**

```ts
  // Resuelve un EAN escaneado y acumula una fila en la cola.
  const añadirEanACola = async (code: string) => {
    const limpio = code.replace(/\D/g, '')
    if (!/^\d{8,14}$/.test(limpio)) return
    // dedupe en la cola por EAN
    if (recPendientes.some(p => p.codigo_barras === limpio)) return
    try {
      const r = await fetch(`/api/cocina/recepciones/ean?code=${limpio}`, { headers: sh() })
      const d = await r.json().catch(() => ({}))
      const producto = d.ok && d.producto ? d.producto : `Código ${limpio}`
      setRecPendientes(prev => [...prev, { producto, proveedor: d.proveedor ?? '', lote: '', temperatura: '', caducidad: '', conforme: true, codigo_barras: limpio }])
    } catch {
      setRecPendientes(prev => [...prev, { producto: `Código ${limpio}`, proveedor: '', lote: '', temperatura: '', caducidad: '', conforme: true, codigo_barras: limpio }])
    }
  }

  // Carga el estado FEFO (caducados / por caducar) para el banner.
  const cargarFefo = async () => {
    try {
      const r = await fetch('/api/cocina/recepciones/caducidades?dias=3', { headers: sh() })
      const d = await r.json().catch(() => ({}))
      if (d.ok && d.total > 0) setFefo({ caducados: d.caducados ?? [], porCaducar: d.porCaducar ?? [], total: d.total })
      else setFefo(null)
    } catch { /* silencioso */ }
  }
```

- [ ] **Step 2: Cargar FEFO al montar — añadir a un `useEffect` existente de carga inicial o crear uno**

Localiza el `useEffect` de carga de datos de recepción (busca `cargarRecepciones` o similar) y añade `cargarFefo()`. Si no hay uno claro, añade:

```ts
  useEffect(() => { cargarFefo() }, [])
```

- [ ] **Step 3: Handler de foto de temperatura por fila**

```ts
  const leerTemperaturaFila = async (i: number, file: File) => {
    try {
      const { base64, mediaType } = await fotoAJpegPequeno(file)
      if (!base64) return
      const r = await fetch('/api/cocina/recepciones/temperatura', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ imagen: base64, mediaType }) })
      const d = await r.json().catch(() => ({}))
      if (d.ok && d.temperatura != null) setRecPendientes(prev => prev.map((r2, j) => j === i ? { ...r2, temperatura: String(d.temperatura) } : r2))
      else window.alert('No se pudo leer la temperatura. Tecléala.')
    } catch { window.alert('No se pudo leer la temperatura.') }
  }
```

- [ ] **Step 4: Subir evidencia al añadir foto — modificar `añadirFotoACola`**

En `añadirFotoACola`, tras leer `file` y antes de procesarla, subir el original en paralelo y guardar la URL en la última fila acumulada. Añadir al final de la función (tras el `setRecPendientes` que acumula la lectura IA):

```ts
      // Foto-evidencia: subir el original (best-effort) y colgar la URL de la primera fila nueva.
      try {
        const fd = new FormData(); fd.append('file', file)
        const er = await fetch('/api/cocina/recepciones/evidencia', { method: 'POST', headers: sh(), body: fd })
        const ed = await er.json().catch(() => ({}))
        if (ed.ok && ed.url) setRecPendientes(prev => { const c = [...prev]; const idx = c.findIndex(p => !p.evidencia_url); if (idx >= 0) c[idx] = { ...c[idx], evidencia_url: ed.url }; return c })
      } catch { /* la evidencia es best-effort */ }
```

- [ ] **Step 5: Verificar tipos**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add apps/ia-rest/src/app/produccion/page.tsx
git commit -m "feat(ia-rest): handlers EAN/FEFO/temperatura/evidencia en produccion"
```

### Task 14: UI — botón escáner, visor, banner FEFO, foto Tª por fila

**Files:**
- Modify: `apps/ia-rest/src/app/produccion/page.tsx`

- [ ] **Step 1: Añadir el botón "🔢 Escanear" junto a "📷 Añadir foto" (tras el `<label>` de la línea 880)**

```tsx
                <button onClick={() => setScanAbierto(true)} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: '#fff', background: C.verde, border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>🔢 Escanear</button>
```

- [ ] **Step 2: Añadir el banner FEFO justo antes del banner de plantilla (`{recPlantilla && ...}`)**

```tsx
            {fefo && (
              <div style={{ background: 'rgba(217,68,43,.08)', border: `1px solid ${C.rojo}`, borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: C.rojo, marginBottom: 4 }}>⚠️ Revisa caducidades ({fefo.total})</div>
                {fefo.caducados.map((c, i) => (<div key={'cad' + i} style={{ fontFamily: SN, fontSize: 12.5, color: C.rojo }}>🔴 <b>{c.producto}</b> caducó el {c.caducidad}</div>))}
                {fefo.porCaducar.map((c, i) => (<div key={'pc' + i} style={{ fontFamily: SN, fontSize: 12.5, color: C.ambar }}>🟠 <b>{c.producto}</b> caduca el {c.caducidad}</div>))}
              </div>
            )}
```

- [ ] **Step 3: Añadir foto-Tª por fila dentro de la celda de Tª (junto al input `type="number"` de temperatura, línea ~913)**

Envolver el input de temperatura en un contenedor con un mini-label de cámara:

```tsx
                          <td style={{ padding: '4px 4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input style={{ ...inp, minWidth: 55, fontSize: 13, padding: '6px 8px' }} type="number" step="0.1" value={p.temperatura} onChange={e => setRecPendientes(prev => prev.map((r, j) => j === i ? { ...r, temperatura: e.target.value } : r))} />
                              <label title="Foto de la sonda" style={{ cursor: 'pointer', fontSize: 16 }}>🌡️
                                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) leerTemperaturaFila(i, f); e.currentTarget.value = '' }} />
                              </label>
                            </div>
                          </td>
```

(Sustituye la celda de Tª original.)

- [ ] **Step 4: Añadir el visor del escáner al final del bloque `gestionRecep` (antes de su `</div>` de cierre)**

```tsx
            {scanAbierto && (
              <ScannerEan onCode={(c) => añadirEanACola(c)} onClose={() => setScanAbierto(false)} />
            )}
```

- [ ] **Step 5: Verificar tipos (fallará: falta `ScannerEan`)**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: FAIL — `ScannerEan` no definido (se crea en Task 15).

### Task 15: Componente `ScannerEan` (BarcodeDetector + ZXing fallback, escaneo continuo)

**Files:**
- Modify: `apps/ia-rest/src/app/produccion/page.tsx` (añadir el componente al final del fichero, fuera del componente página)

- [ ] **Step 1: Añadir el import de ZXing al inicio del fichero**

```ts
import { BrowserMultiFormatReader } from '@zxing/browser'
```

- [ ] **Step 2: Añadir el componente al final del fichero**

```tsx
// Visor de escáner EAN: usa BarcodeDetector nativo si existe; si no, ZXing. Escaneo
// continuo con dedupe — cada código nuevo se acumula sin cerrar el visor.
function ScannerEan({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [leidos, setLeidos] = useState<string[]>([])
  const leidosRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let zxControls: { stop: () => void } | null = null
    let cancelado = false

    const emitir = (code: string) => {
      const limpio = code.replace(/\D/g, '')
      if (!/^\d{8,14}$/.test(limpio) || leidosRef.current.has(limpio)) return
      leidosRef.current.add(limpio)
      setLeidos(prev => [...prev, limpio])
      onCode(limpio)
      if (navigator.vibrate) navigator.vibrate(60)
    }

    const start = async () => {
      try {
        // @ts-expect-error BarcodeDetector no está en los tipos DOM por defecto
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          // @ts-expect-error idem
          const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          if (cancelado) return
          if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
          const tick = async () => {
            if (cancelado || !videoRef.current) return
            try {
              const barcodes = await detector.detect(videoRef.current)
              for (const b of barcodes) emitir(String(b.rawValue))
            } catch { /* frame sin código */ }
            raf = requestAnimationFrame(tick)
          }
          raf = requestAnimationFrame(tick)
        } else {
          const reader = new BrowserMultiFormatReader()
          zxControls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
            if (result) emitir(result.getText())
          })
        }
      } catch (e) {
        window.alert('No se pudo abrir la cámara. Usa 📷 Foto o + Manual.')
        onClose()
      }
    }
    start()
    return () => {
      cancelado = true
      if (raf) cancelAnimationFrame(raf)
      if (zxControls) zxControls.stop()
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [onCode, onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <video ref={videoRef} playsInline muted style={{ width: '100%', maxWidth: 460, borderRadius: 12, background: '#000' }} />
      <div style={{ fontFamily: SN, fontSize: 13, color: '#fff', marginTop: 12 }}>{leidos.length} código(s) leído(s) — apunta al siguiente</div>
      <button onClick={onClose} style={{ marginTop: 16, fontFamily: SN, fontSize: 15, fontWeight: 700, color: '#000', background: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', cursor: 'pointer' }}>Hecho</button>
    </div>
  )
}
```

- [ ] **Step 3: Asegurar imports de hooks**

Verifica que `useRef`, `useEffect`, `useState` están importados de `react` al inicio del fichero (la página ya usa `useState`/`useEffect`; añade `useRef` si falta).

- [ ] **Step 4: Verificar tipos**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add apps/ia-rest/src/app/produccion/page.tsx
git commit -m "feat(ia-rest): visor escáner EAN (BarcodeDetector+ZXing, escaneo continuo) + UI Tª/FEFO"
```

### Task 16: Enviar `codigo_barras` + `evidencia_url` al registrar

**Files:**
- Modify: `apps/ia-rest/src/app/produccion/page.tsx` (función "Registrar todo")

- [ ] **Step 1: Incluir los campos nuevos en el body del POST de registro**

Localiza la función que hace `fetch('/api/cocina/recepciones', { method: 'POST', ... })` por cada fila (busca `Registrar todo` / `registrarTodo`). En el `JSON.stringify({...})` de cada fila, añade:

```ts
          codigo_barras: p.codigo_barras ?? null,
          evidencia_url: p.evidencia_url ?? null,
```

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/app/produccion/page.tsx
git commit -m "feat(ia-rest): registrar codigo_barras y evidencia_url desde la cola"
```

---

## VERIFICACIÓN FINAL Y MERGE

### Task 17: Build completo + tests + merge

- [ ] **Step 1: Tests puros**

Run: `cd apps/ia-rest && node --test --experimental-strip-types test/recepcion-ean.test.ts test/recepcion-caducidades.test.ts` y `cd packages/core-ai && node --test --experimental-strip-types test/gemini-vision.test.ts`
Expected: todos PASS.

- [ ] **Step 2: TypeScript del repo**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: `next build` (reproduce Vercel)**

Run: `cd apps/ia-rest && npm install --legacy-peer-deps && npm run build`
Expected: build OK (sin errores de compilación ni de tipos).

- [ ] **Step 4: Push + marcar PR ready + merge**

```bash
git push origin claude/information-extraction-orls7m
```
Luego: marcar el PR #511 como ready-for-review (`update_pull_request` draft=false) y mergear a `main` (`merge_pull_request`, squash). Confirmar que los previews de Vercel quedan en Ready antes de cerrar.

- [ ] **Step 5: Actualizar memoria**

Añadir entrada en `docs/CONTEXTO-SESIONES.md` (implementación completa, no solo spec) y commit/push.

---

## Self-review (cobertura del spec)

- §4 Escáner EAN → Task 4,5,11,12,13,14,15 ✅
- §5 Gemini Vision → Task 1,2 ✅
- §6 lote/caducidad + persistir EAN → Task 3,6,16 (captura lote/caducidad: la fila editable existente + foto-evidencia; captura "enfocada" de lote/caducidad se cubre con la foto normal vía Gemini, sin endpoint extra — se documenta que va por el flujo de `reconocer`) ✅
- §7 Tª por foto → Task 7,13(Step3),14(Step3) ✅
- §8 Foto-evidencia → Task 3,8,13(Step4),16 ✅
- §9 FEFO on-screen → Task 9,10,13(Step1-2),14(Step2) ✅
- §10 Escaneo continuo → Task 15 (dedupe + visor que no cierra) ✅
- §12 Esperado vs recibido → fuera (futuro), correcto ✅

**Nota de alcance:** la "captura enfocada de lote/caducidad" del §6 se resuelve reutilizando el flujo de foto existente (`reconocer` con Gemini lee bien la letra pequeña al no comprimir). No se crea un endpoint dedicado para no inflar; si tras pruebas se ve necesario, se añade como iteración.
