# Expense Categorization AI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered sub-categorization to all bank movements so Alberto can see breakdowns like "Supermercado €342, Restaurantes €89, Gasolina €65" per month, with configurable Telegram alerts and weekly summaries.

**Architecture:** Cascade approach — first check `banca_destino_reglas.subcategoria` for instant regex matches (0 tokens), then fall back to Claude Haiku for unknown merchants, persisting learned rules automatically. Runs on every ingestion (PSD2 + Norma43 + invoice reconciliation) plus a daily cron for retroactive catch-up. Results stored in existing `movimientos_bancarios.subcategoria` column.

**Tech Stack:** Next.js 14 App Router, Supabase (raw SQL via Prisma `$executeRaw`), `@anthropic-ai/sdk` (Haiku), `@central/core-telegram` (tgSend), Vercel Crons, recharts (already in project).

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `apps/plataforma/lib/categoria-ia.ts` | Core engine: normalize contraparte, rule lookup, Haiku call, rule persistence |
| Create | `apps/plataforma/lib/alertas-categoria.ts` | Check `categoria_alertas` limits after each categorization, fire Telegram |
| Create | `apps/plataforma/lib/resumen-semanal-gastos.ts` | Weekly Telegram summary (Monday 09:00) |
| Create | `apps/plataforma/app/api/cron/categorizar-movimientos/route.ts` | Daily cron + retroactive one-shot endpoint |
| Create | `apps/plataforma/app/api/cron/resumen-semanal/route.ts` | Monday 09:00 Telegram summary trigger |
| Create | `apps/plataforma/app/api/alertas-categoria/route.ts` | PATCH to save configurable alerts |
| Create | `apps/plataforma/app/(usuario)/finanzas/CategoriasTab.tsx` | New tab: donut chart + grouped table + alert config UI |
| Create | `apps/plataforma/prisma/sql/2026-07-01_categoria_alertas.sql` | `categoria_alertas` table + `banca_destino_reglas.subcategoria` column |
| Modify | `apps/plataforma/lib/psd2.ts` | Call `categorizarYAlertar()` after bulk INSERT |
| Modify | `apps/plataforma/lib/banca.ts` | Call `categorizarYAlertar()` after Norma43 import |
| Modify | `apps/plataforma/app/(usuario)/finanzas/FinanzasClient.tsx` | Add 'categorias' tab |
| Modify | `apps/plataforma/vercel.json` | Add 2 new cron entries |

---

## Task 1: DB Migration

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-07-01_categoria_alertas.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- apps/plataforma/prisma/sql/2026-07-01_categoria_alertas.sql

-- Extend learned rules table to store personal sub-category
ALTER TABLE banca_destino_reglas
  ADD COLUMN IF NOT EXISTS subcategoria TEXT;

-- Configurable spend alerts per category
CREATE TABLE IF NOT EXISTS categoria_alertas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria   TEXT NOT NULL,
  limite_mensual NUMERIC(10,2) NOT NULL,
  activa      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (categoria)
);

-- Track last alert sent per category to avoid Telegram spam
CREATE TABLE IF NOT EXISTS categoria_alertas_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria     TEXT NOT NULL,
  enviado_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alertas_log_categoria_fecha
  ON categoria_alertas_log (categoria, enviado_at DESC);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__Supabase__apply_migration` with the SQL above. Project ref: `wswbehlcuxqxyinousql`.

- [ ] **Step 3: Verify columns exist**

Run via Supabase MCP `execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'banca_destino_reglas' AND column_name = 'subcategoria';
SELECT table_name FROM information_schema.tables WHERE table_name = 'categoria_alertas';
```
Expected: both return 1 row.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/prisma/sql/2026-07-01_categoria_alertas.sql
git commit -m "feat: add categoria_alertas table and subcategoria column to reglas"
```

---

## Task 2: Core Categorization Engine (`lib/categoria-ia.ts`)

**Files:**
- Create: `apps/plataforma/lib/categoria-ia.ts`

- [ ] **Step 1: Write the file**

```typescript
// apps/plataforma/lib/categoria-ia.ts
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma'

const anthropic = new Anthropic()

// Normalizes merchant name: uppercase, strip branch numbers and noise
// "Mercadona 0234 Sevilla" → "MERCADONA"
export function normalizarContraparte(raw: string | null): string {
  if (!raw) return ''
  return raw
    .toUpperCase()
    .replace(/\b\d{3,}\b/g, '')   // strip numeric branch codes
    .replace(/\bS\.?A\.?\b/g, '') // strip SA/S.A.
    .replace(/\bSL\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type MovParaCategoria = {
  id: string
  concepto: string | null
  contraparte: string | null
  importe: number
  destino: string | null
}

// Step 1: Rule lookup (0 tokens)
async function buscarRegla(cuentaId: string, clave: string): Promise<string | null> {
  if (!clave) return null
  const rows = await prisma.$queryRaw<{ subcategoria: string }[]>`
    SELECT subcategoria FROM banca_destino_reglas
    WHERE cuenta_id = ${cuentaId}::uuid
      AND subcategoria IS NOT NULL
      AND ${clave} ILIKE '%' || clave || '%'
    ORDER BY length(clave) DESC
    LIMIT 1
  `
  return rows[0]?.subcategoria ?? null
}

// Step 2: Claude Haiku call
async function categorizarConIA(mov: MovParaCategoria): Promise<{ subcategoria: string; confianza: number }> {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    temperature: 0.1,
    messages: [{
      role: 'user',
      content: `Clasifica este movimiento bancario con la subcategoría más precisa posible.
Concepto: ${mov.concepto ?? ''}
Comercio: ${mov.contraparte ?? ''}
Importe: ${mov.importe}€ (${mov.importe < 0 ? 'gasto' : 'ingreso'})
Destino general: ${mov.destino ?? 'desconocido'}

Responde SOLO con JSON válido, sin texto adicional:
{"subcategoria":"<categoría>","confianza":<0.0-1.0>}

Categorías de gasto: supermercado, restaurante_bar, gasolina, farmacia, ropa, colegio, deporte, suscripcion, hogar, suministros_piso, reforma, seguro, transporte, ocio, otros_gasto
Categorías de ingreso: alquiler_booking, alquiler_airbnb, alquiler_transferencia, comision_seguro, nomina, transferencia_familiar, otros_ingreso`,
    }],
  })
  const text = (msg.content[0] as { type: string; text: string }).text.trim()
  try {
    return JSON.parse(text) as { subcategoria: string; confianza: number }
  } catch {
    return { subcategoria: 'otros_gasto', confianza: 0.5 }
  }
}

// Step 3: Persist learned rule
async function persistirRegla(cuentaId: string, clave: string, subcategoria: string) {
  await prisma.$executeRaw`
    INSERT INTO banca_destino_reglas (cuenta_id, clave, destino, subcategoria)
    VALUES (${cuentaId}::uuid, ${clave}, 'personal', ${subcategoria})
    ON CONFLICT (cuenta_id, clave) DO UPDATE SET subcategoria = EXCLUDED.subcategoria
  `
}

// Main function: categorize a single movement
export async function categorizarMovimiento(
  cuentaId: string,
  mov: MovParaCategoria,
): Promise<string> {
  const clave = normalizarContraparte(mov.contraparte)

  // Fast path: rule match
  const reglaSub = await buscarRegla(cuentaId, clave)
  if (reglaSub) {
    await prisma.$executeRaw`
      UPDATE movimientos_bancarios SET subcategoria = ${reglaSub}
      WHERE id = ${mov.id}::uuid
    `
    return reglaSub
  }

  // Slow path: AI
  const { subcategoria, confianza } = await categorizarConIA(mov)
  const requiereRevision = confianza < 0.85

  await prisma.$executeRaw`
    UPDATE movimientos_bancarios
    SET subcategoria = ${subcategoria},
        requiere_revision = ${requiereRevision}
    WHERE id = ${mov.id}::uuid
  `

  // Learn rule if confident
  if (!requiereRevision && clave) {
    await persistirRegla(cuentaId, clave, subcategoria)
  }

  return subcategoria
}

// Batch function for cron/retroactive use — lotes of 20
export async function categorizarLoteSinSubcategoria(
  cuentaId?: string,
  limite = 200,
): Promise<{ procesados: number }> {
  const rows = await prisma.$queryRaw<{ id: string; concepto: string | null; contraparte: string | null; importe: number; destino: string | null; cuenta_bancaria_id: string }[]>`
    SELECT m.id, m.concepto, m.contraparte, m.importe, m.destino, m.cuenta_bancaria_id
    FROM movimientos_bancarios m
    JOIN cuentas_bancarias cb ON cb.id = m.cuenta_bancaria_id
    WHERE m.subcategoria IS NULL
      ${cuentaId ? prisma.$raw`AND m.cuenta_bancaria_id = ${cuentaId}::uuid` : prisma.$raw``}
    ORDER BY m.fecha_operacion DESC
    LIMIT ${limite}
  `

  let procesados = 0
  for (let i = 0; i < rows.length; i += 20) {
    const lote = rows.slice(i, i + 20)
    await Promise.all(
      lote.map(r => categorizarMovimiento(r.cuenta_bancaria_id, r))
    )
    procesados += lote.length
  }
  return { procesados }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/lib/categoria-ia.ts
git commit -m "feat: add AI categorization engine with rule-based fast path"
```

---

## Task 3: Alert Logic (`lib/alertas-categoria.ts`)

**Files:**
- Create: `apps/plataforma/lib/alertas-categoria.ts`

- [ ] **Step 1: Write the file**

```typescript
// apps/plataforma/lib/alertas-categoria.ts
import { prisma } from './prisma'
import { tgSend } from '@central/core-telegram'

const EMOJI: Record<string, string> = {
  supermercado: '🛒', restaurante_bar: '🍺', gasolina: '⛽',
  farmacia: '💊', ropa: '👕', colegio: '🎒', deporte: '🏊',
  suscripcion: '📱', hogar: '🏠', suministros_piso: '💡',
  reforma: '🔨', seguro: '🛡️', transporte: '🚗', ocio: '🎬',
}

export async function comprobarAlertas(subcategoria: string): Promise<void> {
  // Get active alert config for this category
  const alertas = await prisma.$queryRaw<{ id: string; limite_mensual: number }[]>`
    SELECT id, limite_mensual FROM categoria_alertas
    WHERE categoria = ${subcategoria} AND activa = true
  `
  if (!alertas.length) return

  // Check throttle: no alert if one was sent in last 24h for this category
  const reciente = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM categoria_alertas_log
    WHERE categoria = ${subcategoria}
      AND enviado_at > now() - interval '24 hours'
  `
  if (Number(reciente[0].count) > 0) return

  // Sum this month's spend for the category
  const ahora = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().slice(0, 10)

  const suma = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM(ABS(importe)), 0) as total
    FROM movimientos_bancarios
    WHERE subcategoria = ${subcategoria}
      AND importe < 0
      AND fecha_operacion >= ${inicioMes}::date
  `
  const totalMes = Number(suma[0]?.total ?? 0)

  for (const alerta of alertas) {
    if (totalMes >= alerta.limite_mensual) {
      const emoji = EMOJI[subcategoria] ?? '💸'
      const exceso = (totalMes - alerta.limite_mensual).toFixed(2)
      await tgSend(
        `${emoji} *Alerta gasto: ${subcategoria}*\nLlevas €${totalMes.toFixed(2)} de €${alerta.limite_mensual.toFixed(2)} este mes\nExceso: €${exceso}`
      )
      // Log to throttle
      await prisma.$executeRaw`
        INSERT INTO categoria_alertas_log (categoria) VALUES (${subcategoria})
      `
    }
  }
}

// Convenience: categorize then check alerts
export async function categorizarYAlertar(
  cuentaId: string,
  mov: import('./categoria-ia').MovParaCategoria,
): Promise<void> {
  const { categorizarMovimiento } = await import('./categoria-ia')
  const subcategoria = await categorizarMovimiento(cuentaId, mov)
  await comprobarAlertas(subcategoria)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/lib/alertas-categoria.ts
git commit -m "feat: add configurable Telegram spend alerts per category"
```

---

## Task 4: Weekly Telegram Summary (`lib/resumen-semanal-gastos.ts`)

**Files:**
- Create: `apps/plataforma/lib/resumen-semanal-gastos.ts`

- [ ] **Step 1: Write the file**

```typescript
// apps/plataforma/lib/resumen-semanal-gastos.ts
import { prisma } from './prisma'
import { tgSend } from '@central/core-telegram'

const EMOJI: Record<string, string> = {
  supermercado: '🛒', restaurante_bar: '🍺', gasolina: '⛽',
  farmacia: '💊', ropa: '👕', colegio: '🎒', deporte: '🏊',
  suscripcion: '📱', hogar: '🏠', suministros_piso: '💡',
  reforma: '🔨', seguro: '🛡️', transporte: '🚗', ocio: '🎬',
  otros_gasto: '•', alquiler_booking: '🏖️', alquiler_airbnb: '🏡',
  alquiler_transferencia: '🏠', comision_seguro: '🛡️', nomina: '👤',
}

export async function enviarResumenSemanal(): Promise<void> {
  const hoy = new Date()
  const inicioSemana = new Date(hoy)
  inicioSemana.setDate(hoy.getDate() - 7)
  const desde = inicioSemana.toISOString().slice(0, 10)
  const hasta = hoy.toISOString().slice(0, 10)
  const semana = getISOWeek(hoy)

  // Gastos agrupados por subcategoría
  const gastos = await prisma.$queryRaw<{ subcategoria: string; total: number }[]>`
    SELECT subcategoria, SUM(ABS(importe)) as total
    FROM movimientos_bancarios
    WHERE importe < 0
      AND subcategoria IS NOT NULL
      AND fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
    GROUP BY subcategoria
    ORDER BY total DESC
    LIMIT 15
  `

  // Ingresos totales
  const ingresos = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM(importe), 0) as total
    FROM movimientos_bancarios
    WHERE importe > 0
      AND fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
  `

  const totalGastos = gastos.reduce((s, r) => s + Number(r.total), 0)
  const totalIngresos = Number(ingresos[0]?.total ?? 0)

  const lineas = gastos.map(r => {
    const emoji = EMOJI[r.subcategoria] ?? '•'
    const cat = r.subcategoria.replace(/_/g, ' ')
    return `${emoji} ${cat.charAt(0).toUpperCase() + cat.slice(1).padEnd(18)} €${Number(r.total).toFixed(2)}`
  })

  const msg = [
    `📊 *Semana ${semana} | Resumen gastos*`,
    '',
    ...lineas,
    '',
    `💶 Total gastos:    €${totalGastos.toFixed(2)}`,
    `💰 Total ingresos:  €${totalIngresos.toFixed(2)}`,
  ].join('\n')

  await tgSend(msg)
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/lib/resumen-semanal-gastos.ts
git commit -m "feat: add weekly Telegram spend summary"
```

---

## Task 5: Cron Endpoints

**Files:**
- Create: `apps/plataforma/app/api/cron/categorizar-movimientos/route.ts`
- Create: `apps/plataforma/app/api/cron/resumen-semanal/route.ts`

- [ ] **Step 1: Write daily categorization cron**

```typescript
// apps/plataforma/app/api/cron/categorizar-movimientos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { categorizarLoteSinSubcategoria } from '@/lib/categoria-ia'

export async function POST(req: NextRequest) {
  // Vercel Cron auth check
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const retroactivo = req.nextUrl.searchParams.get('retroactivo') === 'true'
  const limite = retroactivo ? 2000 : 200

  const { procesados } = await categorizarLoteSinSubcategoria(undefined, limite)
  return NextResponse.json({ procesados })
}
```

- [ ] **Step 2: Write weekly summary cron**

```typescript
// apps/plataforma/app/api/cron/resumen-semanal/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { enviarResumenSemanal } from '@/lib/resumen-semanal-gastos'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await enviarResumenSemanal()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/api/cron/categorizar-movimientos/route.ts
git add apps/plataforma/app/api/cron/resumen-semanal/route.ts
git commit -m "feat: add cron endpoints for categorization and weekly summary"
```

---

## Task 6: Alert Config API

**Files:**
- Create: `apps/plataforma/app/api/alertas-categoria/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// apps/plataforma/app/api/alertas-categoria/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET: list all alerts
export async function GET() {
  const alertas = await prisma.$queryRaw<{ id: string; categoria: string; limite_mensual: number; activa: boolean }[]>`
    SELECT id, categoria, limite_mensual, activa FROM categoria_alertas ORDER BY categoria
  `
  return NextResponse.json(alertas)
}

// PATCH: upsert alert for a category
export async function PATCH(req: NextRequest) {
  const body = await req.json() as { categoria: string; limite_mensual: number; activa: boolean }
  const { categoria, limite_mensual, activa } = body

  if (!categoria || typeof limite_mensual !== 'number') {
    return NextResponse.json({ error: 'categoria y limite_mensual requeridos' }, { status: 400 })
  }

  await prisma.$executeRaw`
    INSERT INTO categoria_alertas (categoria, limite_mensual, activa)
    VALUES (${categoria}, ${limite_mensual}, ${activa ?? true})
    ON CONFLICT (categoria) DO UPDATE
      SET limite_mensual = EXCLUDED.limite_mensual,
          activa = EXCLUDED.activa
  `
  return NextResponse.json({ ok: true })
}

// DELETE: remove alert
export async function DELETE(req: NextRequest) {
  const { categoria } = await req.json() as { categoria: string }
  await prisma.$executeRaw`DELETE FROM categoria_alertas WHERE categoria = ${categoria}`
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/app/api/alertas-categoria/route.ts
git commit -m "feat: add alerts config API (GET/PATCH/DELETE)"
```

---

## Task 7: Hook into PSD2 and Norma43 ingestion

**Files:**
- Modify: `apps/plataforma/lib/psd2.ts`
- Modify: `apps/plataforma/lib/banca.ts`

- [ ] **Step 1: Read current psd2.ts insert block**

Find the `INSERT INTO movimientos_bancarios` block in `lib/psd2.ts` (around line 79–89). After the `$executeRaw` insert, add:

```typescript
// After the INSERT block in sincronizarSesion():
// Get newly inserted IDs to categorize
const nuevos = await prisma.$queryRaw<{ id: string; concepto: string | null; contraparte: string | null; importe: number; destino: string | null }[]>`
  SELECT id, concepto, contraparte, importe, destino
  FROM movimientos_bancarios
  WHERE cuenta_bancaria_id = ${cbId}::uuid
    AND subcategoria IS NULL
    AND fecha_operacion >= now() - interval '2 days'
`
const { categorizarYAlertar } = await import('./alertas-categoria')
await Promise.allSettled(nuevos.map(m => categorizarYAlertar(cbId, m)))
```

- [ ] **Step 2: Read current banca.ts import block**

Find `importarExtracto()` in `lib/banca.ts`. After the movements are inserted (after deduplication logic), add the same categorization hook:

```typescript
// After movements are persisted in importarExtracto():
const nuevos = await prisma.$queryRaw<{ id: string; concepto: string | null; contraparte: string | null; importe: number; destino: string | null }[]>`
  SELECT id, concepto, contraparte, importe, destino
  FROM movimientos_bancarios
  WHERE cuenta_bancaria_id = ${cuentaBancariaId}::uuid
    AND subcategoria IS NULL
    AND fecha_operacion >= now() - interval '2 days'
`
const { categorizarYAlertar } = await import('./alertas-categoria')
await Promise.allSettled(nuevos.map(m => categorizarYAlertar(cuentaBancariaId, m)))
```

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/psd2.ts apps/plataforma/lib/banca.ts
git commit -m "feat: trigger AI categorization on PSD2 and Norma43 ingestion"
```

---

## Task 8: Vercel Cron Config

**Files:**
- Modify: `apps/plataforma/vercel.json`

- [ ] **Step 1: Add cron entries**

Add these two entries to the `"crons"` array in `apps/plataforma/vercel.json`:

```json
{
  "path": "/api/cron/categorizar-movimientos",
  "schedule": "0 7 * * *"
},
{
  "path": "/api/cron/resumen-semanal",
  "schedule": "0 9 * * 1"
}
```

(`0 7 * * *` = daily 07:00 UTC, `0 9 * * 1` = Monday 09:00 UTC)

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/vercel.json
git commit -m "chore: add crons for categorization (daily) and weekly summary (Monday 09:00)"
```

---

## Task 9: UI — CategoriasTab

**Files:**
- Create: `apps/plataforma/app/(usuario)/finanzas/CategoriasTab.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/plataforma/app/(usuario)/finanzas/CategoriasTab.tsx
'use client'
import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type Categoria = { subcategoria: string; total: number; count: number }
type Alerta = { id: string; categoria: string; limite_mensual: number; activa: boolean }

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16']
const EMOJI: Record<string, string> = {
  supermercado:'🛒', restaurante_bar:'🍺', gasolina:'⛽', farmacia:'💊',
  ropa:'👕', colegio:'🎒', deporte:'🏊', suscripcion:'📱', hogar:'🏠',
  suministros_piso:'💡', reforma:'🔨', seguro:'🛡️', transporte:'🚗', ocio:'🎬',
  alquiler_booking:'🏖️', alquiler_airbnb:'🏡', alquiler_transferencia:'🏠',
  comision_seguro:'🛡️', nomina:'👤', transferencia_familiar:'👨‍👩‍👧',
}

export default function CategoriasTab({ year, month }: { year: number; month: number }) {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [nuevaAlerta, setNuevaAlerta] = useState({ categoria: '', limite_mensual: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/finanzas/categorias?year=${year}&month=${month}`).then(r => r.json()),
      fetch('/api/alertas-categoria').then(r => r.json()),
    ]).then(([cats, al]) => {
      setCategorias(cats)
      setAlertas(al)
      setLoading(false)
    })
  }, [year, month])

  async function guardarAlerta() {
    if (!nuevaAlerta.categoria || !nuevaAlerta.limite_mensual) return
    await fetch('/api/alertas-categoria', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...nuevaAlerta, activa: true }),
    })
    setAlertas(prev => {
      const idx = prev.findIndex(a => a.categoria === nuevaAlerta.categoria)
      const nueva = { id: '', ...nuevaAlerta, activa: true }
      return idx >= 0 ? prev.map((a, i) => i === idx ? nueva : a) : [...prev, nueva]
    })
    setNuevaAlerta({ categoria: '', limite_mensual: 0 })
  }

  async function toggleAlerta(categoria: string, activa: boolean) {
    const al = alertas.find(a => a.categoria === categoria)
    if (!al) return
    await fetch('/api/alertas-categoria', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria, limite_mensual: al.limite_mensual, activa }),
    })
    setAlertas(prev => prev.map(a => a.categoria === categoria ? { ...a, activa } : a))
  }

  async function eliminarAlerta(categoria: string) {
    await fetch('/api/alertas-categoria', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria }),
    })
    setAlertas(prev => prev.filter(a => a.categoria !== categoria))
  }

  if (loading) return <p className="text-gray-400 text-sm p-4">Cargando categorías...</p>

  const gastosData = categorias.filter(c => !['alquiler_booking','alquiler_airbnb','alquiler_transferencia','comision_seguro','nomina','transferencia_familiar'].includes(c.subcategoria))
  const totalGastos = gastosData.reduce((s, c) => s + c.total, 0)

  return (
    <div className="space-y-8">
      {/* Donut chart */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Distribución de gastos</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={gastosData.map(c => ({ name: c.subcategoria, value: c.total }))}
                cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                dataKey="value" nameKey="name">
                {gastosData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => `€${v.toFixed(2)}`} />
              <Legend formatter={(v: string) => `${EMOJI[v] ?? '•'} ${v.replace(/_/g,' ')}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grouped table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Detalle por categoría</h3>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-gray-400">
              <tr>
                <th className="text-left p-3">Categoría</th>
                <th className="text-right p-3">Total</th>
                <th className="text-right p-3">Movimientos</th>
                <th className="text-right p-3">% del total</th>
              </tr>
            </thead>
            <tbody>
              {gastosData.map((c, i) => (
                <tr key={c.subcategoria} className={i % 2 === 0 ? 'bg-white/[0.02]' : ''}>
                  <td className="p-3 font-medium">
                    {EMOJI[c.subcategoria] ?? '•'} {c.subcategoria.replace(/_/g,' ')}
                  </td>
                  <td className="p-3 text-right tabular-nums">€{c.total.toFixed(2)}</td>
                  <td className="p-3 text-right text-gray-400">{c.count}</td>
                  <td className="p-3 text-right text-gray-400">
                    {totalGastos > 0 ? ((c.total / totalGastos) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alerts config */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-3">⚠️ Alertas de gasto mensual</h3>
        <div className="overflow-x-auto rounded-lg border border-white/10 mb-4">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-gray-400">
              <tr>
                <th className="text-left p-3">Categoría</th>
                <th className="text-right p-3">Límite €/mes</th>
                <th className="text-center p-3">Activa</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {alertas.map((a, i) => (
                <tr key={a.categoria} className={i % 2 === 0 ? 'bg-white/[0.02]' : ''}>
                  <td className="p-3">{EMOJI[a.categoria] ?? '•'} {a.categoria.replace(/_/g,' ')}</td>
                  <td className="p-3 text-right tabular-nums">€{a.limite_mensual.toFixed(2)}</td>
                  <td className="p-3 text-center">
                    <input type="checkbox" checked={a.activa}
                      onChange={e => toggleAlerta(a.categoria, e.target.checked)}
                      className="w-4 h-4 accent-indigo-500" />
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => eliminarAlerta(a.categoria)}
                      className="text-red-400 hover:text-red-300 text-xs">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add new alert */}
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={nuevaAlerta.categoria}
            onChange={e => setNuevaAlerta(p => ({ ...p, categoria: e.target.value }))}
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white">
            <option value="">Selecciona categoría...</option>
            {['supermercado','restaurante_bar','gasolina','farmacia','ropa','colegio','deporte','suscripcion','hogar','reforma','transporte','ocio'].map(c => (
              <option key={c} value={c}>{EMOJI[c] ?? ''} {c.replace(/_/g,' ')}</option>
            ))}
          </select>
          <input type="number" placeholder="Límite €/mes"
            value={nuevaAlerta.limite_mensual || ''}
            onChange={e => setNuevaAlerta(p => ({ ...p, limite_mensual: Number(e.target.value) }))}
            className="w-40 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white" />
          <button onClick={guardarAlerta}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded font-medium">
            Añadir alerta
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/app/(usuario)/finanzas/CategoriasTab.tsx
git commit -m "feat: add CategoriasTab with donut chart, spend table, and alert config UI"
```

---

## Task 10: Data API for Categories UI

**Files:**
- Create: `apps/plataforma/app/api/finanzas/categorias/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// apps/plataforma/app/api/finanzas/categorias/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const year = Number(req.nextUrl.searchParams.get('year') ?? new Date().getFullYear())
  const month = Number(req.nextUrl.searchParams.get('month') ?? new Date().getMonth() + 1)

  const desde = `${year}-${String(month).padStart(2,'0')}-01`
  const hasta = new Date(year, month, 0).toISOString().slice(0, 10) // last day of month

  const rows = await prisma.$queryRaw<{ subcategoria: string; total: number; count: bigint }[]>`
    SELECT
      subcategoria,
      SUM(ABS(importe)) as total,
      COUNT(*) as count
    FROM movimientos_bancarios
    WHERE subcategoria IS NOT NULL
      AND fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
    GROUP BY subcategoria
    ORDER BY total DESC
  `

  return NextResponse.json(rows.map(r => ({ ...r, count: Number(r.count) })))
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/app/api/finanzas/categorias/route.ts
git commit -m "feat: add /api/finanzas/categorias endpoint for UI data"
```

---

## Task 11: Wire CategoriasTab into FinanzasClient

**Files:**
- Modify: `apps/plataforma/app/(usuario)/finanzas/FinanzasClient.tsx`

- [ ] **Step 1: Add tab to type and array**

Read `FinanzasClient.tsx`. Find the `type Tab` and `TABS` array (lines 7–12) and update:

```typescript
// Before:
type Tab = 'ingresos' | 'gastos' | 'fiscal'
const TABS: { v: Tab; label: string }[] = [
  { v: 'ingresos', label: '💰 Ingresos' },
  { v: 'gastos', label: '🧾 Gastos' },
  { v: 'fiscal', label: '🏛️ Fiscal / Resumen' },
]

// After:
type Tab = 'ingresos' | 'gastos' | 'fiscal' | 'categorias'
const TABS: { v: Tab; label: string }[] = [
  { v: 'ingresos', label: '💰 Ingresos' },
  { v: 'gastos', label: '🧾 Gastos' },
  { v: 'fiscal', label: '🏛️ Fiscal / Resumen' },
  { v: 'categorias', label: '📊 Categorías' },
]
```

- [ ] **Step 2: Add import and render**

Add import at top of file:
```typescript
import CategoriasTab from './CategoriasTab'
```

Find where the other tabs render (the `tab === 'gastos'` block) and add after:
```tsx
{tab === 'categorias' && (
  <CategoriasTab year={year} month={quarter} />
)}
```
(Note: `quarter` here is actually the `month` prop — confirm with the actual props; use whichever numeric month prop exists on `Props`.)

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/(usuario)/finanzas/FinanzasClient.tsx
git commit -m "feat: add Categorías tab to Finanzas panel"
```

---

## Task 12: Retroactive Categorization (One-shot)

- [ ] **Step 1: Deploy to Vercel** (or trigger locally if dev server running)

After the previous tasks are deployed, trigger the retroactive run:

```bash
curl -X POST "https://<plataforma-url>/api/cron/categorizar-movimientos?retroactivo=true" \
  -H "Authorization: Bearer $CRON_SECRET"
```

- [ ] **Step 2: Verify in Supabase**

```sql
SELECT subcategoria, COUNT(*) 
FROM movimientos_bancarios 
WHERE subcategoria IS NOT NULL 
GROUP BY subcategoria 
ORDER BY count DESC;
```

Expected: rows for supermercado, restaurante_bar, gasolina, etc.

- [ ] **Step 3: Check the UI**

Navigate to `/finanzas` > pestaña Categorías. Verify donut chart shows data for current month.

---

## Verification Checklist

1. **Norma43 import** → upload an Excel → check `movimientos_bancarios.subcategoria` populated
2. **PSD2 sync** → trigger sync → new movements get subcategoria
3. **Rule learning** → same merchant second time → no AI call, instant from `banca_destino_reglas`
4. **Alert trigger** → set €10 limit for `restaurante_bar` → add a movement > €10 → receive Telegram message
5. **Weekly summary** → call `POST /api/cron/resumen-semanal` manually → receive Telegram with breakdown
6. **UI table** → `/finanzas` > Categorías → see grouped table and donut chart with real data
7. **Alert config UI** → add/toggle/delete alert → page reflects change, Supabase `categoria_alertas` updated
8. **Retroactive** → `?retroactivo=true` call → all historical movements get subcategoria
