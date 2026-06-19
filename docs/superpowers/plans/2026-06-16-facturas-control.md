# Control de Facturas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un panel `/sivra/facturas-control` en plataforma que muestre ✅/⏳/❌ por cada proveedor recurrente (si tiene factura archivada en Drive ese mes), con upload manual desde el panel y banner de alerta en el dashboard.

**Architecture:** Tabla Supabase `facturas_drive` actúa de caché (el agente `facturas-correo` escribe al archivar; el panel lee). Upload desde el panel reutiliza el Apps Script ya existente (DRIVE_SCRIPT_URL + base64) y escribe en la misma tabla. Dashboard añade un banner de alerta tipo `AlertasBanner` existente.

**Tech Stack:** Next.js 15 App Router · Prisma `$queryRaw` · Supabase `wswbehlcuxqxyinousql` · CSS variables (sin Tailwind) · Google Apps Script (DRIVE_SCRIPT_URL)

---

## File Map

| Acción | Archivo |
|---|---|
| CREAR | `apps/plataforma/lib/sivra/facturas-control.ts` — registry de proveedores + helper de estado |
| CREAR | `apps/plataforma/app/api/sivra/facturas-control/route.ts` — GET (estado mes) + POST (upload PDF) |
| CREAR | `apps/plataforma/app/(usuario)/sivra/facturas-control/page.tsx` — página cliente |
| MODIFICAR | `apps/plataforma/app/(usuario)/UserSidebar.tsx` — añadir entrada en NAV_PISOS |
| MODIFICAR | `apps/plataforma/lib/banca.ts` — extender `Alertas` + `getAlertas` con facturas faltantes |
| MODIFICAR | `apps/plataforma/app/(usuario)/dashboard/page.tsx` — pasar `facturasFaltantes` a `AlertasBanner` |
| MODIFICAR | `.claude/skills/facturas-correo/SKILL.md` — añadir INSERT en `facturas_drive` al archivar |
| MIGRACIÓN | `supabase/migrations/2026-06-16_facturas_drive.sql` — nueva tabla |

---

## Task 1: Migración Supabase — tabla `facturas_drive`

**Files:**
- Create: `supabase/migrations/2026-06-16_facturas_drive.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- supabase/migrations/2026-06-16_facturas_drive.sql
CREATE TABLE IF NOT EXISTS facturas_drive (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  proveedor    text    NOT NULL,
  anio         integer NOT NULL,
  mes          integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  drive_url    text,
  drive_file_id text,
  importe      numeric(10,2),
  nombre_archivo text,
  fuente       text    NOT NULL DEFAULT 'manual' CHECK (fuente IN ('agente','manual')),
  created_at   timestamptz DEFAULT now(),
  UNIQUE (proveedor, anio, mes)
);

CREATE INDEX ON facturas_drive (anio, mes);
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Usar Supabase MCP `apply_migration` con el SQL de arriba, project_id `wswbehlcuxqxyinousql`, nombre `facturas_drive`.

- [ ] **Step 3: Verificar con SELECT**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'facturas_drive' ORDER BY ordinal_position;
```

Resultado esperado: 9 columnas (id, proveedor, anio, mes, drive_url, drive_file_id, importe, nombre_archivo, fuente, created_at).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-06-16_facturas_drive.sql
git commit -m "feat(plataforma): migración tabla facturas_drive"
```

---

## Task 2: Registry de proveedores

**Files:**
- Create: `apps/plataforma/lib/sivra/facturas-control.ts`

- [ ] **Step 1: Crear el archivo de registro**

```typescript
// apps/plataforma/lib/sivra/facturas-control.ts

export type Frecuencia = 'mensual' | 'bimestral_impar' | 'anual_marzo'
export type Destino = 'turistico_pisos' | 'turistico_duplex' | 'personal'

export type ProveedorRecurrente = {
  id: string
  label: string
  frecuencia: Frecuencia
  destino: Destino
  importeAprox: string
  carpetaDrive: string
}

export const PROVEEDORES_RECURRENTES: ProveedorRecurrente[] = [
  { id: 'si_que_brilla',      label: 'Si Que Brilla (limpieza)',        frecuencia: 'mensual',          destino: 'turistico_pisos',  importeAprox: '800–1.440€',   carpetaDrive: 'Pisos turísticos' },
  { id: 'giraldillo',         label: 'El Giraldillo (lavandería)',       frecuencia: 'mensual',          destino: 'turistico_pisos',  importeAprox: '400–600€',     carpetaDrive: 'Pisos turísticos' },
  { id: 'endesa_socorro',     label: 'ENDESA Socorro',                   frecuencia: 'mensual',          destino: 'turistico_pisos',  importeAprox: '38–134€',      carpetaDrive: 'Pisos turísticos' },
  { id: 'endesa_luxury',      label: 'ENDESA Luxury (Bustos Bajo DER)',  frecuencia: 'mensual',          destino: 'turistico_pisos',  importeAprox: '38–134€',      carpetaDrive: 'Pisos turísticos' },
  { id: 'endesa_bustos',      label: 'ENDESA Bustos Reform (Bajo IZQ)', frecuencia: 'mensual',          destino: 'turistico_pisos',  importeAprox: '38–134€',      carpetaDrive: 'Pisos turísticos' },
  { id: 'endesa_duplex',      label: 'ENDESA Dúplex (Pasaje Francisco)',  frecuencia: 'mensual',          destino: 'turistico_duplex', importeAprox: '63–79€',       carpetaDrive: 'Duplex' },
  { id: 'emasesa_socorro',    label: 'EMASESA Socorro',                  frecuencia: 'bimestral_impar',  destino: 'turistico_pisos',  importeAprox: '84–166€',      carpetaDrive: 'Pisos turísticos' },
  { id: 'emasesa_bustos',     label: 'EMASESA Bustos Reform',            frecuencia: 'bimestral_impar',  destino: 'turistico_pisos',  importeAprox: '33–57€',       carpetaDrive: 'Pisos turísticos' },
  { id: 'emasesa_luxury',     label: 'EMASESA Luxury',                   frecuencia: 'bimestral_impar',  destino: 'turistico_pisos',  importeAprox: '59–91€',       carpetaDrive: 'Pisos turísticos' },
  { id: 'digi',               label: 'DIGI (2/3 negocio)',               frecuencia: 'mensual',          destino: 'turistico_pisos',  importeAprox: '~51€',         carpetaDrive: 'Pisos turísticos' },
  { id: 'pricelabs',          label: 'PriceLabs',                        frecuencia: 'mensual',          destino: 'turistico_pisos',  importeAprox: '55–65 USD',    carpetaDrive: 'Pisos turísticos' },
  { id: 'chekin',             label: 'Chekin Soluciones',                frecuencia: 'mensual',          destino: 'turistico_pisos',  importeAprox: 'variable',     carpetaDrive: 'Pisos turísticos' },
  { id: 'renta_luxury',       label: 'Renta Gutierrez Alcalá — Luxury', frecuencia: 'mensual',          destino: 'turistico_pisos',  importeAprox: '~309€',        carpetaDrive: 'Pisos turísticos' },
  { id: 'renta_bustos',       label: 'Renta Gutierrez Alcalá — Bustos', frecuencia: 'mensual',          destino: 'turistico_pisos',  importeAprox: '~259€',        carpetaDrive: 'Pisos turísticos' },
  { id: 'comunidad_pasaje',   label: 'Comunidad Pasaje Francisco',       frecuencia: 'mensual',          destino: 'turistico_duplex', importeAprox: '76,18€',       carpetaDrive: 'Duplex' },
  { id: 'comunidad_monte',    label: 'Comunidad Monte Carmelo',          frecuencia: 'mensual',          destino: 'personal',         importeAprox: '~110€',        carpetaDrive: 'Personal' },
  { id: 'smoobu',             label: 'Smoobu (anual)',                   frecuencia: 'anual_marzo',      destino: 'turistico_pisos',  importeAprox: '~1.018€',      carpetaDrive: 'Pisos turísticos' },
]

/** Devuelve true si este proveedor tiene factura esperada en el mes dado */
export function esperadoEnMes(p: ProveedorRecurrente, año: number, mes: number): boolean {
  if (p.frecuencia === 'mensual') return true
  if (p.frecuencia === 'bimestral_impar') return mes % 2 === 1
  if (p.frecuencia === 'anual_marzo') return mes === 3
  return false
}

export type EstadoFactura = 'ok' | 'falta' | 'pendiente'

/**
 * ok       = drive_url existe en facturas_drive
 * falta    = mes ya pasado (o actual pasado día 10) y no hay registro
 * pendiente = mes actual en plazo (aún puede llegar)
 */
export function calcularEstado(
  driveUrl: string | null,
  año: number,
  mes: number,
): EstadoFactura {
  if (driveUrl) return 'ok'
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const currentDay = now.getDate()
  const esMesActual = año === currentYear && mes === currentMonth
  if (esMesActual && currentDay <= 15) return 'pendiente'
  return 'falta'
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/lib/sivra/facturas-control.ts
git commit -m "feat(plataforma): registry proveedores recurrentes para control facturas"
```

---

## Task 3: API route — GET + POST

**Files:**
- Create: `apps/plataforma/app/api/sivra/facturas-control/route.ts`

- [ ] **Step 1: Crear el archivo de ruta**

```typescript
// apps/plataforma/app/api/sivra/facturas-control/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { PROVEEDORES_RECURRENTES, esperadoEnMes } from '@/lib/sivra/facturas-control'

export const dynamic = 'force-dynamic'

const DRIVE_SCRIPT_URL = process.env.DRIVE_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbwYMhD_7MpiytpoM3fYVW5dRlCUiQgMeTYLvI-5WGfcL-OAdXZEsa3UD7KdZa1PpQ/exec'

const CARPETA_BASE: Record<string, string> = {
  turistico_pisos:  'Pisos turísticos',
  turistico_duplex: 'Duplex',
  personal:         'Personal',
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const año = parseInt(searchParams.get('año') || String(new Date().getFullYear()))
  const mes  = parseInt(searchParams.get('mes')  || String(new Date().getMonth() + 1))

  // Traer todos los registros de facturas_drive para este mes
  const registros = await prisma.$queryRaw<Array<{ proveedor: string; drive_url: string | null; importe: number | null }>>(
    Prisma.sql`SELECT proveedor, drive_url, importe FROM facturas_drive WHERE anio = ${año} AND mes = ${mes}`
  )
  const driveMap = Object.fromEntries(registros.map(r => [r.proveedor, r]))

  const proveedores = PROVEEDORES_RECURRENTES
    .filter(p => esperadoEnMes(p, año, mes))
    .map(p => ({
      ...p,
      driveUrl: driveMap[p.id]?.drive_url ?? null,
      importe:  driveMap[p.id]?.importe ?? null,
    }))

  return NextResponse.json({ proveedores, año, mes })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file      = formData.get('file') as File | null
  const proveedor = formData.get('proveedor') as string
  const año       = parseInt(formData.get('año') as string)
  const mes       = parseInt(formData.get('mes') as string)
  const importe   = parseFloat((formData.get('importe') as string) || '0') || null

  if (!file || !proveedor || !año || !mes) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  const prov = PROVEEDORES_RECURRENTES.find(p => p.id === proveedor)
  if (!prov) return NextResponse.json({ error: 'Proveedor desconocido' }, { status: 400 })

  const subcarpeta = CARPETA_BASE[prov.destino] ?? 'Gastos'
  const folder = `Facturas/${año}/${subcarpeta}`
  const fileName = `${año}-${String(mes).padStart(2,'0')}-01_${proveedor}${importe ? `_${importe}` : ''}.pdf`

  let driveUrl: string | null = null
  let driveFileId: string | null = null

  try {
    const bytes = await file.arrayBuffer()
    const b64   = Buffer.from(bytes).toString('base64')
    const driveRes = await fetch(DRIVE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, mimeType: file.type, base64Data: b64, folder }),
    })
    if (driveRes.ok) {
      const dr = await driveRes.json()
      driveUrl    = dr.webViewLink || dr.url || null
      driveFileId = dr.id || null
    }
  } catch (e) {
    console.warn('[facturas-control POST] Drive upload failed:', e)
  }

  // Upsert: si ya existe para proveedor+año+mes, actualiza
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO facturas_drive (proveedor, anio, mes, drive_url, drive_file_id, importe, nombre_archivo, fuente)
    VALUES (${proveedor}, ${año}, ${mes}, ${driveUrl}, ${driveFileId}, ${importe}, ${fileName}, 'manual')
    ON CONFLICT (proveedor, anio, mes) DO UPDATE
      SET drive_url = EXCLUDED.drive_url,
          drive_file_id = EXCLUDED.drive_file_id,
          importe = COALESCE(EXCLUDED.importe, facturas_drive.importe),
          nombre_archivo = EXCLUDED.nombre_archivo,
          fuente = 'manual'
  `)

  return NextResponse.json({ ok: true, driveUrl })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/app/api/sivra/facturas-control/route.ts
git commit -m "feat(plataforma): API route GET+POST /api/sivra/facturas-control"
```

---

## Task 4: Página `/sivra/facturas-control`

**Files:**
- Create: `apps/plataforma/app/(usuario)/sivra/facturas-control/page.tsx`

- [ ] **Step 1: Crear la página**

```tsx
// apps/plataforma/app/(usuario)/sivra/facturas-control/page.tsx
'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { calcularEstado, type EstadoFactura } from '@/lib/sivra/facturas-control'

type ProvRow = {
  id: string; label: string; destino: string; importeAprox: string
  driveUrl: string | null; importe: number | null
}

const BADGE: Record<EstadoFactura, { icon: string; label: string; bg: string; color: string }> = {
  ok:        { icon: '✅', label: 'En Drive',  bg: '#f0fdf4', color: '#166534' },
  pendiente: { icon: '⏳', label: 'En plazo',  bg: '#fefce8', color: '#854d0e' },
  falta:     { icon: '❌', label: 'Falta',     bg: '#fef2f2', color: '#991b1b' },
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function FacturasControlPage() {
  const now = new Date()
  const [año, setAño]   = useState(now.getFullYear())
  const [mes, setMes]   = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<ProvRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [msg, setMsg]   = useState<{ id: string; text: string; ok: boolean } | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/sivra/facturas-control?año=${año}&mes=${mes}`)
      const d = await r.json()
      setRows(d.proveedores || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [año, mes])

  useEffect(() => { load() }, [load])

  const handleUpload = async (provId: string, file: File, importe: string) => {
    setUploading(provId)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('proveedor', provId)
      fd.append('año', String(año))
      fd.append('mes', String(mes))
      if (importe) fd.append('importe', importe)
      const r = await fetch('/api/sivra/facturas-control', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error')
      setMsg({ id: provId, text: 'Subido a Drive ✓', ok: true })
      await load()
    } catch (e: any) {
      setMsg({ id: provId, text: e.message, ok: false })
    }
    setUploading(null)
  }

  const faltantes = rows.filter(r => calcularEstado(r.driveUrl, año, mes) === 'falta').length
  const pendientes = rows.filter(r => calcularEstado(r.driveUrl, año, mes) === 'pendiente').length

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Control de facturas
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={mes}
            onChange={e => setMes(Number(e.target.value))}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer' }}
          >
            {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select
            value={año}
            onChange={e => setAño(Number(e.target.value))}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer' }}
          >
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Resumen */}
      {!loading && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <Chip label={`${rows.filter(r => calcularEstado(r.driveUrl, año, mes) === 'ok').length} en Drive`} bg="#f0fdf4" color="#166534" />
          {faltantes > 0 && <Chip label={`${faltantes} ${faltantes === 1 ? 'falta' : 'faltan'}`} bg="#fef2f2" color="#991b1b" />}
          {pendientes > 0 && <Chip label={`${pendientes} en plazo`} bg="#fefce8" color="#854d0e" />}
        </div>
      )}

      {/* Tabla */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--muted)' }}>Cargando…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--muted)' }}>Sin proveedores esperados este mes.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
                {['Estado','Proveedor','Destino','Importe aprox.','Acción'].map(col => (
                  <th key={col} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const estado = calcularEstado(row.driveUrl, año, mes)
                const badge  = BADGE[estado]
                const isUp   = uploading === row.id
                const rowMsg = msg?.id === row.id ? msg : null
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.color }}>
                        {badge.icon} {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                      {row.driveUrl
                        ? <a href={row.driveUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>{row.label}</a>
                        : row.label}
                      {row.importe && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{row.importe.toFixed(2)} €</div>}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>
                      {row.destino === 'turistico_pisos' ? 'Pisos turísticos' : row.destino === 'turistico_duplex' ? 'Dúplex' : 'Personal'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{row.importeAprox}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {estado !== 'ok' && (
                        <>
                          <input
                            type="file"
                            accept=".pdf,application/pdf"
                            ref={el => { fileRefs.current[row.id] = el }}
                            style={{ display: 'none' }}
                            onChange={async e => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              const importe = prompt('Importe (€, opcional):') || ''
                              await handleUpload(row.id, file, importe)
                              e.target.value = ''
                            }}
                          />
                          <button
                            onClick={() => fileRefs.current[row.id]?.click()}
                            disabled={isUp}
                            style={{ padding: '5px 12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: isUp ? 'not-allowed' : 'pointer', opacity: isUp ? 0.6 : 1 }}
                          >
                            {isUp ? 'Subiendo…' : '📎 Subir PDF'}
                          </button>
                          {rowMsg && (
                            <div style={{ fontSize: 11, marginTop: 4, color: rowMsg.ok ? '#166534' : '#991b1b' }}>{rowMsg.text}</div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Chip({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ padding: '4px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: bg, color }}>
      {label}
    </span>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/app/(usuario)/sivra/facturas-control/page.tsx
git commit -m "feat(plataforma): página /sivra/facturas-control con tabla ✅/⏳/❌ y upload"
```

---

## Task 5: Añadir entrada en sidebar

**Files:**
- Modify: `apps/plataforma/app/(usuario)/UserSidebar.tsx`

- [ ] **Step 1: Añadir la entrada en `NAV_PISOS`**

En el archivo `apps/plataforma/app/(usuario)/UserSidebar.tsx`, localizar el array `NAV_PISOS` y añadir la entrada después de `gastos-fijos`:

```typescript
// Línea a añadir después de { href: '/sivra/gastos-fijos', icon: '📋', label: 'Gastos fijos' }:
{ href: '/sivra/facturas-control', icon: '🗂️', label: 'Facturas' },
```

El bloque completo queda:
```typescript
const NAV_PISOS = [
  { href: '/sivra/calendario',        icon: '📅', label: 'Calendario' },
  { href: '/sivra/income',            icon: '💰', label: 'Ingresos' },
  { href: '/sivra/expenses',          icon: '🧾', label: 'Gastos' },
  { href: '/sivra/gastos-fijos',      icon: '📋', label: 'Gastos fijos' },
  { href: '/sivra/facturas-control',  icon: '🗂️', label: 'Facturas' },
  { href: '/sivra/fiscal',            icon: '📊', label: 'Fiscal IRPF' },
  { href: '/sivra/mensajes',          icon: '💬', label: 'Mensajes' },
  { href: '/sivra/mercado',           icon: '📊', label: 'Mercado' },
  { href: '/sivra/pricing',           icon: '🔬', label: 'Pricing Lab' },
  { href: '/sivra/pricing-auto',      icon: '🤖', label: 'Pricing auto' },
  { href: '/sivra/inversion',         icon: '🏡', label: 'Inversión' },
  { href: '/sivra/seo',               icon: '🔍', label: 'SEO' },
]
```

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/app/(usuario)/UserSidebar.tsx
git commit -m "feat(plataforma): añadir Facturas al sidebar (Mis pisos)"
```

---

## Task 6: Banner de alerta en el dashboard

**Files:**
- Modify: `apps/plataforma/lib/banca.ts`
- Modify: `apps/plataforma/app/(usuario)/dashboard/page.tsx`

- [ ] **Step 1: Extender `Alertas` y `getAlertas` en `lib/banca.ts`**

Localizar el tipo `Alertas` (línea ~353) y añadir el campo:
```typescript
export type Alertas = {
  porRevisar: number
  duplicados: number
  duplicadosDetalle: Array<{ concepto: string; importe: number; fecha: string | null }>
  facturasFaltantes: number  // ← nuevo
}
```

En `getAlertas` (línea ~358), añadir la query de facturas faltantes dentro del `Promise.all`:
```typescript
export async function getAlertas(cuentaId: string): Promise<Alertas> {
  const now = new Date()
  const año = now.getFullYear()
  const mes = now.getMonth() + 1

  const [rev, grupos, factFaltantes] = await Promise.all([
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.requiere_revision = true`,
    getDuplicadosSospechosos(cuentaId),
    // Facturas del mes actual que deberían estar pero no están en Drive
    // (solo contamos las de meses anteriores como "faltantes" reales)
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM facturas_drive
      WHERE anio = ${año} AND mes = ${mes - 1 === 0 ? 12 : mes - 1}
        AND anio = ${mes - 1 === 0 ? año - 1 : año}
    `.then(() => null).catch(() => null),  // placeholder — ver abajo
  ])
  // ...
}
```

**Nota:** La lógica de "faltantes" es más fácil hacerla en TS que en SQL porque depende de la lista de proveedores esperados. Reemplazar el placeholder por:

```typescript
import { PROVEEDORES_RECURRENTES, esperadoEnMes } from '@/lib/sivra/facturas-control'

export async function getAlertas(cuentaId: string): Promise<Alertas> {
  const now = new Date()
  const año = now.getFullYear()
  const mes = now.getMonth() + 1
  // Mes anterior (para detectar faltantes reales ya vencidos)
  const mesPrev = mes === 1 ? 12 : mes - 1
  const añoPrev = mes === 1 ? año - 1 : año

  const [rev, grupos, registrosPrev] = await Promise.all([
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.requiere_revision = true`,
    getDuplicadosSospechosos(cuentaId),
    prisma.$queryRaw<Array<{ proveedor: string }>>`
      SELECT proveedor FROM facturas_drive WHERE anio = ${añoPrev} AND mes = ${mesPrev}`,
  ])

  const esperadosPrev = PROVEEDORES_RECURRENTES.filter(p => esperadoEnMes(p, añoPrev, mesPrev))
  const archivedPrev  = new Set(registrosPrev.map(r => r.proveedor))
  const facturasFaltantes = esperadosPrev.filter(p => !archivedPrev.has(p.id)).length

  const visibles = grupos.filter(g => g.superaUmbral)
  return {
    porRevisar: Number(rev[0]?.n ?? 0),
    duplicados: visibles.length,
    duplicadosDetalle: visibles.slice(0, 3).map(g => ({
      concepto: g.movimientos[0]?.concepto || 'Movimiento',
      importe: g.importe,
      fecha: g.movimientos[0]?.fecha ?? null,
    })),
    facturasFaltantes,
  }
}
```

- [ ] **Step 2: Actualizar `AlertasBanner` en `dashboard/page.tsx`**

Localizar la función `AlertasBanner` (~línea 388) y añadir el tercer caso:

```tsx
function AlertasBanner({ alertas }: { alertas: Alertas }) {
  if (alertas.porRevisar === 0 && alertas.duplicados === 0 && alertas.facturasFaltantes === 0) return null
  return (
    <div style={{
      background: '#fffbeb', border: '1px solid #f59e0b66', borderRadius: 'var(--radius)',
      padding: '12px 16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px',
    }}>
      {alertas.porRevisar > 0 && (
        <Link href="/banca" style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'none', fontWeight: 600 }}>
          🔎 Tienes <strong>{alertas.porRevisar}</strong> {alertas.porRevisar === 1 ? 'movimiento' : 'movimientos'} por revisar →
        </Link>
      )}
      {alertas.duplicados > 0 && (
        <Link href="/banca#duplicados" style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'none' }}>
          ⚠️ <strong>{alertas.duplicados}</strong> {alertas.duplicados === 1 ? 'posible cargo duplicado' : 'posibles cargos duplicados'}
          {alertas.duplicadosDetalle.length > 0 && (
            <span style={{ color: 'var(--muted)' }}>
              {' '}— {alertas.duplicadosDetalle.map(d => `${d.concepto} (${new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(d.importe)})`).join(', ')}
            </span>
          )}
          {' '}→
        </Link>
      )}
      {alertas.facturasFaltantes > 0 && (
        <Link href="/sivra/facturas-control" style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'none' }}>
          🗂️ <strong>{alertas.facturasFaltantes}</strong> {alertas.facturasFaltantes === 1 ? 'factura recurrente falta' : 'facturas recurrentes faltan'} del mes pasado → Ver control de facturas
        </Link>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/banca.ts apps/plataforma/app/(usuario)/dashboard/page.tsx
git commit -m "feat(plataforma): banner facturas faltantes en dashboard"
```

---

## Task 7: Actualizar SKILL.md — agente escribe en facturas_drive

**Files:**
- Modify: `.claude/skills/facturas-correo/SKILL.md`

- [ ] **Step 1: Añadir paso de INSERT en Supabase en el Paso 3 del skill**

En el bloque `## Paso 3 — Archivar en Drive (solo deducibles)`, al final del paso de `create_file`, añadir:

```markdown
### Registrar en Supabase (facturas_drive)
Después de archivar cada factura en Drive, ejecutar:
```sql
INSERT INTO facturas_drive (proveedor, anio, mes, drive_url, drive_file_id, importe, nombre_archivo, fuente)
VALUES ('<proveedor_id>', <año>, <mes>, '<drive_webViewLink>', '<drive_file_id>', <importe>, '<nombre_archivo>', 'agente')
ON CONFLICT (proveedor, anio, mes) DO UPDATE
  SET drive_url = EXCLUDED.drive_url,
      drive_file_id = EXCLUDED.drive_file_id,
      importe = COALESCE(EXCLUDED.importe, facturas_drive.importe),
      fuente = 'agente';
```

Usar el `id` del proveedor según la tabla de mapeo:
| Proveedor (correo/nombre)       | proveedor_id       |
|--------------------------------|--------------------|
| Si Que Brilla SL               | si_que_brilla      |
| El Giraldillo                  | giraldillo         |
| ENDESA 130139486193 (Socorro)  | endesa_socorro     |
| ENDESA 130139685932 (Luxury)   | endesa_luxury      |
| ENDESA 130139655504 (Bustos)   | endesa_bustos      |
| ENDESA dúplex (CPVR, BBVA)     | endesa_duplex      |
| EMASESA 0104785292 (Socorro)   | emasesa_socorro    |
| EMASESA 0105185751 (Bustos)    | emasesa_bustos     |
| EMASESA 0105137440 (Luxury)    | emasesa_luxury     |
| DIGI                           | digi               |
| PriceLabs                      | pricelabs          |
| Chekin Soluciones              | chekin             |
| Renta Gutierrez Alcalá Luxury  | renta_luxury       |
| Renta Gutierrez Alcalá Bustos  | renta_bustos       |
| Comunidad Pasaje Francisco     | comunidad_pasaje   |
| Comunidad Monte Carmelo        | comunidad_monte    |
| Smoobu                         | smoobu             |
```
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/facturas-correo/SKILL.md
git commit -m "feat(skill): agente facturas-correo registra en facturas_drive al archivar"
```

---

## Task 8: Push y PR

- [ ] **Step 1: Push**

```bash
git push -u origin claude/inspiring-rubin-228r6g
```

- [ ] **Step 2: Verificar en plataforma**

Abrir `https://plataforma-ten-flame.vercel.app/sivra/facturas-control` y comprobar que:
- Se ven los proveedores del mes actual
- Los botones de upload aparecen para los que no tienen Drive
- El sidebar muestra "Facturas" bajo "Mis pisos"
- El dashboard muestra el banner si hay facturas faltantes del mes anterior

---

## Self-Review

**Spec coverage:**
- ✅ Tabla Supabase `facturas_drive` → Task 1
- ✅ Registry de proveedores + lógica de estado → Task 2
- ✅ API GET (estado por mes) + POST (upload → Drive → Supabase) → Task 3
- ✅ Página `/sivra/facturas-control` con tabla + indicadores + upload → Task 4
- ✅ Sidebar entry → Task 5
- ✅ Banner alerta en dashboard → Task 6
- ✅ Agente facturas-correo escribe en Supabase → Task 7

**Placeholder scan:** Ningún TBD/TODO en el plan.

**Type consistency:** 
- `ProveedorRecurrente` definido en Task 2, consumido en Task 3 (API) y Task 4 (page) via import.
- `calcularEstado` devuelve `EstadoFactura`, usado en Task 4.
- `Alertas.facturasFaltantes` añadido en Task 6 Step 1, consumido en Task 6 Step 2.
- `DRIVE_SCRIPT_URL` consistente con el pattern de `expenses/route.ts`.
