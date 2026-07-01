# Nueva estructura Finanzas — plataforma

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar la sección Finanzas de `apps/plataforma` en una estructura plana con filtros potentes (Gastos · Fiscal · Proyección), eliminando páginas por negocio y dando protagonismo al control de deducibilidad y la fiscalidad.

**Architecture:** El sidebar se reorganiza en 5 ítems planos. Correduría y Apartamentos desaparecen del sidebar — su información se filtra desde la nueva página Gastos. Se extraen las pestañas Fiscal y Gastos de `FinanzasClient.tsx` en páginas propias (`/finanzas/gastos`, `/finanzas/fiscal`, `/finanzas/proyeccion`). La lógica de cálculo existente (`lib/finanzas.ts`, `lib/fiscal-deducciones.ts`) no se modifica — solo se consume desde nueva UI.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, `lib/finanzas.ts` (server functions), `lib/fiscal-deducciones.ts` (tax calculations), Prisma (sivra schema para reservas futuras).

---

## Mapa de archivos

**Modificar:**
- `apps/plataforma/app/(usuario)/UserSidebar.tsx` — reorganizar `NAV_NEGOCIO`
- `apps/plataforma/app/(usuario)/finanzas/FinanzasClient.tsx` — eliminar tabs Fiscal y Gastos, dejar solo Ingresos y Categorías (o deprecar según Task 2)
- `apps/plataforma/lib/finanzas.ts` — extender `getGastosControl` con `desde`/`hasta` opcionales
- `apps/plataforma/app/api/finanzas/gastos/route.ts` — pasar `desde`/`hasta` al handler

**Crear:**
- `apps/plataforma/app/(usuario)/finanzas/gastos/page.tsx`
- `apps/plataforma/app/(usuario)/finanzas/gastos/GastosPageClient.tsx`
- `apps/plataforma/app/(usuario)/finanzas/fiscal/page.tsx`
- `apps/plataforma/app/(usuario)/finanzas/fiscal/FiscalPageClient.tsx`
- `apps/plataforma/app/(usuario)/finanzas/proyeccion/page.tsx`
- `apps/plataforma/app/(usuario)/finanzas/proyeccion/ProyeccionClient.tsx`
- `apps/plataforma/app/api/finanzas/proyeccion/route.ts`

---

## Task 1: Reorganizar sidebar

**Files:**
- Modify: `apps/plataforma/app/(usuario)/UserSidebar.tsx`

- [ ] **Abrir el archivo y localizar `NAV_NEGOCIO`**

```bash
grep -n "NAV_NEGOCIO\|correduria\|apartamentos" apps/plataforma/app/\(usuario\)/UserSidebar.tsx
```

- [ ] **Reemplazar `NAV_NEGOCIO` con la nueva estructura**

Busca el array `NAV_NEGOCIO` (es un array de objetos con `href`, `label`, `icon` y opcionalmente `children`). Reemplázalo por:

```tsx
const NAV_NEGOCIO = [
  { href: '/dashboard', label: 'Resumen', icon: '🏠' },
  { href: '/banca', label: 'Banca', icon: '🏦' },
  { href: '/finanzas/gastos', label: 'Gastos', icon: '🧾' },
  { href: '/finanzas/fiscal', label: 'Fiscal', icon: '🏛️' },
  { href: '/finanzas/proyeccion', label: 'Proyección', icon: '📈' },
]
```

Elimina los ítems de Correduría (`/correduria`), Apartamentos (`/apartamentos`), Finanzas (`/finanzas`) y Tarjeta Crédito (children de Finanzas). **No borres** `NAV_PISOS` ni `NAV_OPERADOR`.

- [ ] **Verificar que el sidebar renderiza sin errores**

```bash
cd apps/plataforma && npx tsc --noEmit 2>&1 | head -30
```

Expected: sin errores de tipo en UserSidebar.

- [ ] **Commit**

```bash
git add apps/plataforma/app/\(usuario\)/UserSidebar.tsx
git commit -m "feat(plataforma): reorganizar sidebar — Gastos, Fiscal, Proyección"
```

---

## Task 2: Extender `getGastosControl` con rango de fechas

**Files:**
- Modify: `apps/plataforma/lib/finanzas.ts`
- Modify: `apps/plataforma/app/api/finanzas/gastos/route.ts`

El objetivo es que `getGastosControl` acepte un rango libre `desde`/`hasta` además del `year`/`quarter` existente. Si se pasan `desde`/`hasta`, se usan directamente. Si no, se calcula con la lógica actual de `mesRange`.

- [ ] **Localizar la función `getGastosControl` y `mesRange` en `lib/finanzas.ts`**

```bash
grep -n "getGastosControl\|mesRange\|function mesRange" apps/plataforma/lib/finanzas.ts | head -20
```

- [ ] **Añadir parámetros opcionales `desde`/`hasta` a la firma de `getGastosControl`**

Localiza la firma actual:
```ts
export async function getGastosControl(
  cuentaId: string,
  year: number,
  quarter = 0
): Promise<GastosControl>
```

Cámbiala por:
```ts
export async function getGastosControl(
  cuentaId: string,
  year: number,
  quarter = 0,
  desde?: string,   // 'YYYY-MM-DD', opcional
  hasta?: string    // 'YYYY-MM-DD', opcional
): Promise<GastosControl>
```

Dentro de la función, localiza donde se llama a `mesRange(year, quarter)` para obtener `{ inicio, fin }`. Añade justo antes:

```ts
const rango = desde && hasta
  ? { inicio: desde, fin: hasta }
  : mesRange(year, quarter)
```

Y sustituye todas las referencias a `inicio`/`fin` derivadas de `mesRange` por `rango.inicio` / `rango.fin`.

- [ ] **Actualizar el API route para leer `desde`/`hasta` de los query params**

En `apps/plataforma/app/api/finanzas/gastos/route.ts`, el handler actual lee `year` y `quarter`. Añade:

```ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGastosControl } from '@/lib/finanzas'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'no session' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const quarter = parseInt(searchParams.get('quarter') ?? '0')
  const desde = searchParams.get('desde') ?? undefined
  const hasta = searchParams.get('hasta') ?? undefined

  const data = await getGastosControl(session.id, year, quarter, desde, hasta)
  return NextResponse.json(data)
}
```

- [ ] **Verificar tipos**

```bash
cd apps/plataforma && npx tsc --noEmit 2>&1 | head -30
```

Expected: sin errores.

- [ ] **Commit**

```bash
git add apps/plataforma/lib/finanzas.ts apps/plataforma/app/api/finanzas/gastos/route.ts
git commit -m "feat(plataforma): getGastosControl acepta rango desde/hasta"
```

---

## Task 3: Página Gastos (`/finanzas/gastos`)

**Files:**
- Create: `apps/plataforma/app/(usuario)/finanzas/gastos/page.tsx`
- Create: `apps/plataforma/app/(usuario)/finanzas/gastos/GastosPageClient.tsx`

### 3a — Server page

- [ ] **Crear `page.tsx`**

```tsx
// apps/plataforma/app/(usuario)/finanzas/gastos/page.tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getGastosControl } from '@/lib/finanzas'
import { GastosPageClient } from './GastosPageClient'

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string; desde?: string; hasta?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sp = await searchParams
  const year = parseInt(sp.year ?? String(new Date().getFullYear()))
  const quarter = parseInt(sp.quarter ?? '0')
  const desde = sp.desde
  const hasta = sp.hasta

  const data = await getGastosControl(session.id, year, quarter, desde, hasta)
  return <GastosPageClient initialData={data} year={year} quarter={quarter} />
}
```

### 3b — Client component con filtros y buckets

- [ ] **Crear `GastosPageClient.tsx`**

```tsx
// apps/plataforma/app/(usuario)/finanzas/gastos/GastosPageClient.tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import type { GastosControl, GastoMov, GastoBucket } from '@/lib/finanzas'

const BUCKET_COLOR: Record<GastoBucket, string> = {
  negocio: 'bg-green-900/40 border-green-700 text-green-300',
  renta: 'bg-purple-900/40 border-purple-700 text-purple-300',
  no_deducible: 'bg-red-900/40 border-red-700 text-red-300',
  traspaso: 'bg-blue-900/40 border-blue-700 text-blue-300',
}

const BUCKET_LABEL: Record<GastoBucket, string> = {
  negocio: '✓ Negocio',
  renta: '🏘 Renta',
  no_deducible: '✗ No deducible',
  traspaso: '↔ Traspaso',
}

const DESTINO_NEGOCIO: Record<string, string> = {
  seguros: 'Correduría',
  turistico_pisos: 'Apartamentos',
  turistico_duplex: 'Apartamentos',
  personal: 'Personal',
  actividad_pilar: 'Pilar',
  traspaso_interno: 'Traspaso',
}

type Filtros = {
  negocio: string
  tipo: string  // 'todos' | 'por_revisar' | 'deducible' | 'no_deducible' | 'traspaso'
  sinJustificante: boolean
  mesMode: 'mes' | 'rango'
  mes: string    // 'YYYY-MM'
  desde: string  // 'YYYY-MM-DD'
  hasta: string  // 'YYYY-MM-DD'
}

function filtrarMovs(movs: GastoMov[], f: Filtros): GastoMov[] {
  return movs.filter(m => {
    if (f.negocio !== 'todos') {
      const neg = DESTINO_NEGOCIO[m.destino] ?? 'Otro'
      if (neg !== f.negocio) return false
    }
    if (f.tipo === 'por_revisar' && !m.porRevisar) return false
    if (f.tipo === 'deducible' && !m.deducible) return false
    if (f.tipo === 'no_deducible' && m.bucket !== 'no_deducible') return false
    if (f.tipo === 'traspaso' && m.bucket !== 'traspaso') return false
    if (f.sinJustificante && !(m.deducible && !m.conciliado && !m.facturaRef)) return false
    return true
  })
}

export function GastosPageClient({
  initialData,
  year,
  quarter,
}: {
  initialData: GastosControl
  year: number
  quarter: number
}) {
  const router = useRouter()
  const hoy = new Date()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`

  const [filtros, setFiltros] = useState<Filtros>({
    negocio: 'todos',
    tipo: 'todos',
    sinJustificante: false,
    mesMode: 'mes',
    mes: mesActual,
    desde: `${year}-01-01`,
    hasta: `${year}-12-31`,
  })

  const setF = (patch: Partial<Filtros>) => setFiltros(f => ({ ...f, ...patch }))

  // Todos los movimientos de todos los buckets
  const todosMovs: GastoMov[] = [
    ...initialData.buckets.flatMap(b => b.movs),
    ...initialData.porRevisar,
  ].filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i) // dedup

  const movsVisibles = filtrarMovs(todosMovs, filtros)

  // Totales por bucket (sobre movs visibles)
  const totalPorBucket = (bucket: GastoBucket) =>
    movsVisibles.filter(m => m.bucket === bucket).reduce((s, m) => s + m.importe, 0)

  const sinJustificanteCount = movsVisibles.filter(
    m => m.deducible && !m.conciliado && !m.facturaRef
  ).length

  const aplicarRango = () => {
    const params = new URLSearchParams()
    if (filtros.mesMode === 'mes') {
      const [y, mo] = filtros.mes.split('-')
      params.set('desde', `${y}-${mo}-01`)
      const lastDay = new Date(parseInt(y), parseInt(mo), 0).getDate()
      params.set('hasta', `${y}-${mo}-${lastDay}`)
    } else {
      params.set('desde', filtros.desde)
      params.set('hasta', filtros.hasta)
    }
    router.push(`/finanzas/gastos?${params.toString()}`)
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-white">Gastos</h1>

      {/* Filtros */}
      <div className="bg-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Negocio */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Negocio</label>
            <select
              className="bg-slate-700 text-white rounded px-2 py-1 text-sm"
              value={filtros.negocio}
              onChange={e => setF({ negocio: e.target.value })}
            >
              <option value="todos">Todos</option>
              <option value="Correduría">Correduría</option>
              <option value="Apartamentos">Apartamentos</option>
              <option value="Personal">Personal</option>
              <option value="Pilar">Pilar</option>
            </select>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Tipo</label>
            <select
              className="bg-slate-700 text-white rounded px-2 py-1 text-sm"
              value={filtros.tipo}
              onChange={e => setF({ tipo: e.target.value })}
            >
              <option value="todos">Todos</option>
              <option value="por_revisar">Por revisar</option>
              <option value="deducible">Deducibles</option>
              <option value="no_deducible">No deducibles</option>
              <option value="traspaso">Traspasos</option>
            </select>
          </div>

          {/* Sin justificante */}
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={filtros.sinJustificante}
              onChange={e => setF({ sinJustificante: e.target.checked })}
              className="rounded"
            />
            Sin justificante
          </label>
        </div>

        {/* Periodo */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex gap-2">
            <button
              onClick={() => setF({ mesMode: 'mes' })}
              className={`px-3 py-1 rounded text-sm ${filtros.mesMode === 'mes' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              Mes
            </button>
            <button
              onClick={() => setF({ mesMode: 'rango' })}
              className={`px-3 py-1 rounded text-sm ${filtros.mesMode === 'rango' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              Rango
            </button>
          </div>

          {filtros.mesMode === 'mes' ? (
            <input
              type="month"
              value={filtros.mes}
              onChange={e => setF({ mes: e.target.value })}
              className="bg-slate-700 text-white rounded px-2 py-1 text-sm"
            />
          ) : (
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={filtros.desde}
                onChange={e => setF({ desde: e.target.value })}
                className="bg-slate-700 text-white rounded px-2 py-1 text-sm"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={filtros.hasta}
                onChange={e => setF({ hasta: e.target.value })}
                className="bg-slate-700 text-white rounded px-2 py-1 text-sm"
              />
            </div>
          )}

          <button
            onClick={aplicarRango}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm"
          >
            Aplicar
          </button>
        </div>
      </div>

      {/* Buckets summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(['negocio', 'renta', 'no_deducible', 'traspaso'] as GastoBucket[]).map(bucket => {
          const total = totalPorBucket(bucket)
          const sinJust = bucket !== 'no_deducible' && bucket !== 'traspaso' ? sinJustificanteCount : 0
          return (
            <div key={bucket} className={`rounded-lg border p-3 ${BUCKET_COLOR[bucket]}`}>
              <div className="text-xs font-semibold mb-1">{BUCKET_LABEL[bucket]}</div>
              <div className="text-lg font-bold">
                {total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
              </div>
              {sinJust > 0 && (
                <div className="text-xs mt-1 text-yellow-400">⚠️ {sinJust} sin justificante</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Lista */}
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-700">
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-left px-3 py-2">Concepto</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Negocio</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Tipo</th>
              <th className="text-right px-3 py-2">Importe</th>
              <th className="text-center px-3 py-2">Just.</th>
            </tr>
          </thead>
          <tbody>
            {movsVisibles.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-500">
                  Sin movimientos para los filtros seleccionados
                </td>
              </tr>
            )}
            {movsVisibles.map(m => (
              <tr key={m.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                  {m.fecha ? m.fecha.slice(0, 10) : '—'}
                </td>
                <td className="px-3 py-2 text-white max-w-[200px] truncate" title={m.concepto}>
                  {m.concepto}
                  {m.porRevisar && (
                    <span className="ml-1 text-xs bg-yellow-700 text-yellow-200 px-1 rounded">revisar</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-300 hidden md:table-cell">
                  {DESTINO_NEGOCIO[m.destino] ?? m.destinoLabel}
                </td>
                <td className="px-3 py-2 hidden md:table-cell">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${BUCKET_COLOR[m.bucket]}`}>
                    {BUCKET_LABEL[m.bucket]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-white">
                  {m.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </td>
                <td className="px-3 py-2 text-center">
                  {m.facturaRef || m.conciliado ? (
                    <span title="Con justificante">📎</span>
                  ) : m.deducible ? (
                    <span title="Falta justificante">❗</span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Verificar tipos**

```bash
cd apps/plataforma && npx tsc --noEmit 2>&1 | grep "gastos" | head -20
```

Expected: sin errores en los archivos de gastos.

- [ ] **Commit**

```bash
git add apps/plataforma/app/\(usuario\)/finanzas/gastos/
git commit -m "feat(plataforma): página /finanzas/gastos con filtros y buckets"
```

---

## Task 4: Página Fiscal (`/finanzas/fiscal`)

**Files:**
- Create: `apps/plataforma/app/(usuario)/finanzas/fiscal/page.tsx`
- Create: `apps/plataforma/app/(usuario)/finanzas/fiscal/FiscalPageClient.tsx`

### 4a — Server page

- [ ] **Crear `page.tsx`**

```tsx
// apps/plataforma/app/(usuario)/finanzas/fiscal/page.tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getResumenFinanciero } from '@/lib/finanzas'
import { FiscalPageClient } from './FiscalPageClient'

export default async function FiscalPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sp = await searchParams
  const year = parseInt(sp.year ?? String(new Date().getFullYear()))

  const data = await getResumenFinanciero(session.id, year, 0)
  return <FiscalPageClient data={data} year={year} />
}
```

### 4b — Client component

- [ ] **Crear `FiscalPageClient.tsx`**

```tsx
// apps/plataforma/app/(usuario)/finanzas/fiscal/FiscalPageClient.tsx
'use client'

import { useRouter } from 'next/navigation'
import type { ResumenFinanciero } from '@/lib/finanzas'
import { compararDeclaracion } from '@/lib/fiscal-deducciones'

const TRAMO_COLOR = ['bg-green-500', 'bg-lime-500', 'bg-yellow-500', 'bg-orange-500', 'bg-red-500', 'bg-red-700']

function fmt(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function pct(n: number) {
  return (n * 100).toFixed(1) + '%'
}

export function FiscalPageClient({
  data,
  year,
}: {
  data: ResumenFinanciero
  year: number
}) {
  const router = useRouter()
  const { fiscal, deducciones } = data

  // Comparativa conjunta vs separada
  const comparativa = compararDeclaracion(
    fiscal.baseImponibleEstimada,
    data.personal?.total ?? 0,  // rendimiento neto cónyuge (Pilar)
    0,
    deducciones.perfil,
    deducciones.descendientes.map(d => ({
      id: d.id,
      nombre: d.nombre,
      fechaNacimiento: d.fechaNacimiento,
      gradoDiscapacidad: d.gradoDiscapacidad,
      computoCompleto: d.computoCompleto,
    })),
    year,
  )

  const baseTotal = fiscal.tramosIRPF.reduce((s, t) => s + (t.hasta ?? t.desde + 100000) - t.desde, 0)

  return (
    <div className="p-4 space-y-6 max-w-4xl mx-auto">
      {/* Header + selector año */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Fiscal {year}</h1>
        <div className="flex gap-2">
          {(data.yearsDisponibles ?? [year]).map(y => (
            <button
              key={y}
              onClick={() => router.push(`/finanzas/fiscal?year=${y}`)}
              className={`px-3 py-1 rounded text-sm ${y === year ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Base imponible</div>
          <div className="text-2xl font-bold text-white">{fmt(fiscal.baseImponibleEstimada)}</div>
        </div>
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Tipo efectivo</div>
          <div className="text-2xl font-bold text-yellow-400">{pct(fiscal.tipoEfectivo)}</div>
        </div>
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Cuota estimada</div>
          <div className="text-2xl font-bold text-red-400">
            {fmt(fiscal.tramosIRPF.reduce((s, t) => s + t.importe, 0))}
          </div>
        </div>
      </div>

      {/* 2. Tramos IRPF — barra visual */}
      <div className="bg-slate-800 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">Tramos IRPF</h2>
        <div className="flex rounded overflow-hidden h-6">
          {fiscal.tramosIRPF.map((t, i) => {
            const ancho = Math.min(100, ((t.hasta ?? fiscal.baseImponibleEstimada) - t.desde) / (fiscal.baseImponibleEstimada || 1) * 100)
            const activo = fiscal.tramoActual?.tipo === t.tipo
            return (
              <div
                key={i}
                title={`${pct(t.tipo)}: ${fmt(t.importe)}`}
                className={`${TRAMO_COLOR[i] ?? 'bg-red-900'} relative ${activo ? 'ring-2 ring-white' : ''}`}
                style={{ width: `${ancho}%`, minWidth: t.importe > 0 ? '4px' : '0' }}
              />
            )
          })}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {fiscal.tramosIRPF.map((t, i) => (
            <span key={i} className={`flex items-center gap-1 ${fiscal.tramoActual?.tipo === t.tipo ? 'text-white font-bold' : 'text-slate-400'}`}>
              <span className={`w-2 h-2 rounded-full inline-block ${TRAMO_COLOR[i]}`} />
              {pct(t.tipo)} — {fmt(t.importe)}
            </span>
          ))}
        </div>
        {fiscal.margenHastaProximoTramo != null && (
          <div className="bg-yellow-900/40 border border-yellow-700 rounded p-2 text-sm text-yellow-300">
            ⚠️ Te quedan <strong>{fmt(fiscal.margenHastaProximoTramo)}</strong> para el siguiente tramo
            {fiscal.tramosIRPF.find(t => t.desde > fiscal.baseImponibleEstimada)
              ? ` (${pct(fiscal.tramosIRPF.find(t => t.desde > fiscal.baseImponibleEstimada)!.tipo)})`
              : ''}
          </div>
        )}
      </div>

      {/* 3. Comparativa conjunta vs separada */}
      <div className="bg-slate-800 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">Comparativa declaración</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-lg p-3 border ${comparativa.recomendacion === 'conjunta' ? 'border-green-600 bg-green-900/20' : 'border-slate-600'}`}>
            <div className="text-xs text-slate-400 mb-1">Conjunta</div>
            <div className="text-xl font-bold text-white">{fmt(comparativa.conjunta.cuotaLiquida)}</div>
            <div className="text-xs text-slate-400 mt-1">Tipo efectivo: {pct(comparativa.conjunta.tipoEfectivo)}</div>
            {comparativa.recomendacion === 'conjunta' && (
              <div className="text-xs text-green-400 mt-1">✓ Recomendado — ahorro {fmt(comparativa.ahorroConjunta)}</div>
            )}
          </div>
          <div className={`rounded-lg p-3 border ${comparativa.recomendacion === 'separada' ? 'border-green-600 bg-green-900/20' : 'border-slate-600'}`}>
            <div className="text-xs text-slate-400 mb-1">Separada (Alberto + Pilar)</div>
            <div className="text-xl font-bold text-white">{fmt(comparativa.separada.cuotaLiquida)}</div>
            <div className="text-xs text-slate-400 mt-1">Tipo efectivo: {pct(comparativa.separada.tipoEfectivo)}</div>
            {comparativa.recomendacion === 'separada' && (
              <div className="text-xs text-green-400 mt-1">✓ Recomendado</div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Deducciones */}
      <div className="bg-slate-800 rounded-lg p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-300">Deducciones aplicadas</h2>
        {deducciones.resultado.deducciones?.map((d, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-slate-300">{d.concepto}</span>
            <span className="text-green-400 font-mono">{fmt(d.importe)}</span>
          </div>
        ))}
        {(!deducciones.resultado.deducciones || deducciones.resultado.deducciones.length === 0) && (
          <p className="text-slate-500 text-sm">No hay deducciones adicionales calculadas</p>
        )}
      </div>

      {/* 5. Retenciones */}
      <div className="bg-slate-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Retenciones</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-slate-400">Retenciones acumuladas (Correduría 15%)</div>
            <div className="text-white font-bold">{fmt(fiscal.retencionesAcumuladas)}</div>
          </div>
          <div>
            <div className="text-slate-400">Diferencia estimada</div>
            <div className={`font-bold ${fiscal.retencionesAcumuladas > fiscal.tramosIRPF.reduce((s, t) => s + t.importe, 0) ? 'text-green-400' : 'text-red-400'}`}>
              {fmt(fiscal.retencionesAcumuladas - fiscal.tramosIRPF.reduce((s, t) => s + t.importe, 0))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Verificar que `compararDeclaracion` existe con esa firma en `lib/fiscal-deducciones.ts`**

```bash
grep -n "compararDeclaracion\|export function comparar" apps/plataforma/lib/fiscal-deducciones.ts | head -5
```

Si la firma es diferente (parámetros distintos), ajusta la llamada en `FiscalPageClient` para que coincida con la firma real.

- [ ] **Verificar tipos**

```bash
cd apps/plataforma && npx tsc --noEmit 2>&1 | grep "fiscal" | head -20
```

- [ ] **Commit**

```bash
git add apps/plataforma/app/\(usuario\)/finanzas/fiscal/
git commit -m "feat(plataforma): página /finanzas/fiscal con tramos, comparativa y deducciones"
```

---

## Task 5: API de Proyección (reservas futuras sivra)

**Files:**
- Create: `apps/plataforma/app/api/finanzas/proyeccion/route.ts`

- [ ] **Verificar la tabla `incomes` en el schema sivra**

```bash
grep -n "incomes\|checkIn\|check_in\|Income" apps/plataforma/prisma/schema.prisma | head -20
```

Anota el nombre exacto del modelo y los campos (`checkIn` o `check_in`, `amount` o `importe`).

- [ ] **Crear `route.ts`**

Adapta los nombres de campo según lo que encuentres en el paso anterior. El código de referencia usa los nombres del schema Prisma de sivra:

```ts
// apps/plataforma/app/api/finanzas/proyeccion/route.ts
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getResumenFinanciero } from '@/lib/finanzas'
import { prisma } from '@/lib/prisma'  // ajusta el import si el cliente Prisma es diferente

export type ProyeccionMes = {
  mes: string   // 'YYYY-MM'
  ingresos: number
  tipo: 'real' | 'reserva'
}

export type ProyeccionData = {
  baseAcumulada: number
  reservasFuturas: ProyeccionMes[]
  baseProyectada: number
  year: number
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'no session' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  // Base acumulada real (año completo)
  const resumen = await getResumenFinanciero(session.id, year, 0)
  const baseAcumulada = resumen.fiscal.baseImponibleEstimada

  // Reservas futuras de apartamentos (tabla incomes en schema sivra)
  // La cuenta sivra se obtiene del perfil; por simplicidad usamos la cuenta_id del usuario
  const hoy = new Date()
  const finAnio = new Date(year, 11, 31)

  // Prisma raw query porque incomes puede estar en schema sivra separado
  // Ajusta según el cliente Prisma disponible en apps/plataforma
  let reservasFuturas: ProyeccionMes[] = []
  try {
    const rows = await prisma.$queryRaw<{ mes: string; total: number }[]>`
      SELECT
        TO_CHAR(check_in, 'YYYY-MM') as mes,
        SUM(amount)::float as total
      FROM sivra.incomes
      WHERE check_in >= ${hoy}
        AND check_in <= ${finAnio}
      GROUP BY TO_CHAR(check_in, 'YYYY-MM')
      ORDER BY mes
    `
    reservasFuturas = rows.map(r => ({
      mes: r.mes,
      ingresos: r.total,
      tipo: 'reserva' as const,
    }))
  } catch {
    // Si no hay acceso al schema sivra, devolvemos array vacío
    reservasFuturas = []
  }

  const totalReservas = reservasFuturas.reduce((s, r) => s + r.ingresos, 0)

  return NextResponse.json({
    baseAcumulada,
    reservasFuturas,
    baseProyectada: baseAcumulada + totalReservas,
    year,
  } satisfies ProyeccionData)
}
```

- [ ] **Verificar tipos**

```bash
cd apps/plataforma && npx tsc --noEmit 2>&1 | grep "proyeccion" | head -10
```

- [ ] **Commit**

```bash
git add apps/plataforma/app/api/finanzas/proyeccion/
git commit -m "feat(plataforma): API /api/finanzas/proyeccion — reservas futuras sivra"
```

---

## Task 6: Página Proyección (`/finanzas/proyeccion`)

**Files:**
- Create: `apps/plataforma/app/(usuario)/finanzas/proyeccion/page.tsx`
- Create: `apps/plataforma/app/(usuario)/finanzas/proyeccion/ProyeccionClient.tsx`

### 6a — Server page

- [ ] **Crear `page.tsx`**

```tsx
// apps/plataforma/app/(usuario)/finanzas/proyeccion/page.tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { ProyeccionClient } from './ProyeccionClient'
import type { ProyeccionData } from '@/app/api/finanzas/proyeccion/route'

export default async function ProyeccionPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sp = await searchParams
  const year = parseInt(sp.year ?? String(new Date().getFullYear()))

  // Fetch desde la misma API (o llamar directamente a las funciones si se prefiere)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/finanzas/proyeccion?year=${year}`, {
    headers: { cookie: '' }, // el fetch server-side no pasa cookies automáticamente
    cache: 'no-store',
  })
  
  // Alternativa más robusta: importar directamente getResumenFinanciero
  // y hacer la query de sivra en la propia page. Si el fetch falla, usa esto.
  const data: ProyeccionData | null = res.ok ? await res.json() : null

  return <ProyeccionClient initialData={data} year={year} />
}
```

**Nota:** Si el fetch server-to-server no funciona por cookies/auth, sustituye el fetch por llamadas directas a `getResumenFinanciero` + query Prisma de sivra dentro del `page.tsx`. El patrón de fetch es más limpio pero depende de que las cookies se pasen correctamente.

### 6b — Client component con simulador

- [ ] **Crear `ProyeccionClient.tsx`**

```tsx
// apps/plataforma/app/(usuario)/finanzas/proyeccion/ProyeccionClient.tsx
'use client'

import { useState } from 'react'
import type { ProyeccionData } from '@/app/api/finanzas/proyeccion/route'

// Tramos IRPF 2025 (mismos que en lib/fiscal-deducciones.ts)
const TRAMOS = [
  { desde: 0, hasta: 12450, tipo: 0.19 },
  { desde: 12450, hasta: 20200, tipo: 0.24 },
  { desde: 20200, hasta: 35200, tipo: 0.30 },
  { desde: 35200, hasta: 60000, tipo: 0.37 },
  { desde: 60000, hasta: 300000, tipo: 0.45 },
  { desde: 300000, hasta: Infinity, tipo: 0.47 },
]

function calcularCuota(base: number) {
  let cuota = 0
  let tramoActual = TRAMOS[0]
  for (const t of TRAMOS) {
    if (base <= t.desde) break
    const aplicado = Math.min(base, t.hasta) - t.desde
    cuota += aplicado * t.tipo
    tramoActual = t
  }
  const siguiente = TRAMOS.find(t => t.desde > base)
  const margen = siguiente ? siguiente.desde - base : null
  const tipoEfectivo = base > 0 ? cuota / base : 0
  return { cuota, tramoActual, margen, siguiente, tipoEfectivo }
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

export function ProyeccionClient({
  initialData,
  year,
}: {
  initialData: ProyeccionData | null
  year: number
}) {
  const [extraImporte, setExtraImporte] = useState('')
  const [extraMes, setExtraMes] = useState('')

  if (!initialData) {
    return (
      <div className="p-4">
        <p className="text-slate-400">No hay datos disponibles para {year}.</p>
      </div>
    )
  }

  const { baseAcumulada, reservasFuturas, baseProyectada } = initialData

  const extra = parseFloat(extraImporte) || 0
  const baseConExtra = baseProyectada + extra

  const fiscal = calcularCuota(baseProyectada)
  const fiscalConExtra = calcularCuota(baseConExtra)
  const cruzaTramo = fiscalConExtra.tramoActual.tipo > fiscal.tramoActual.tipo

  return (
    <div className="p-4 space-y-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-white">Proyección {year}</h1>

      {/* Base proyectada */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Base acumulada (real)</div>
          <div className="text-xl font-bold text-white">{fmt(baseAcumulada)}</div>
        </div>
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Reservas futuras confirmadas</div>
          <div className="text-xl font-bold text-blue-400">
            {fmt(reservasFuturas.reduce((s, r) => s + r.ingresos, 0))}
          </div>
        </div>
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Base proyectada fin de año</div>
          <div className="text-xl font-bold text-yellow-400">{fmt(baseProyectada)}</div>
        </div>
      </div>

      {/* Tramo actual proyectado */}
      <div className="bg-slate-800 rounded-lg p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-300">Situación fiscal proyectada</h2>
        <div className="flex gap-6 text-sm">
          <div>
            <div className="text-slate-400">Tramo marginal</div>
            <div className="text-white font-bold text-lg">{(fiscal.tramoActual.tipo * 100).toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-slate-400">Tipo efectivo</div>
            <div className="text-white font-bold text-lg">{(fiscal.tipoEfectivo * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-slate-400">Cuota estimada</div>
            <div className="text-red-400 font-bold text-lg">{fmt(fiscal.cuota)}</div>
          </div>
        </div>
        {fiscal.margen != null && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded p-2 text-sm text-yellow-300">
            ⚠️ Te quedan <strong>{fmt(fiscal.margen)}</strong> para el tramo del {fiscal.siguiente ? (fiscal.siguiente.tipo * 100).toFixed(0) : ''}%
          </div>
        )}
      </div>

      {/* Reservas futuras por mes */}
      {reservasFuturas.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Reservas confirmadas por mes</h2>
          <div className="space-y-1">
            {reservasFuturas.map(r => (
              <div key={r.mes} className="flex justify-between text-sm">
                <span className="text-slate-300">{r.mes}</span>
                <span className="text-blue-400 font-mono">{fmt(r.ingresos)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Simulador */}
      <div className="bg-slate-800 rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-slate-300">Simulador — ¿qué pasa si...?</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ingreso adicional (€)</label>
            <input
              type="number"
              value={extraImporte}
              onChange={e => setExtraImporte(e.target.value)}
              placeholder="0"
              className="bg-slate-700 text-white rounded px-3 py-1.5 text-sm w-32"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">En el mes</label>
            <input
              type="month"
              value={extraMes}
              onChange={e => setExtraMes(e.target.value)}
              className="bg-slate-700 text-white rounded px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        {extra > 0 && (
          <div className={`rounded-lg p-4 space-y-3 border ${cruzaTramo ? 'border-red-600 bg-red-900/20' : 'border-slate-600'}`}>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-slate-400">Nueva base</div>
                <div className="text-white font-bold">{fmt(baseConExtra)}</div>
              </div>
              <div>
                <div className="text-slate-400">Nueva cuota</div>
                <div className="text-red-400 font-bold">{fmt(fiscalConExtra.cuota)}</div>
              </div>
              <div>
                <div className="text-slate-400">Coste fiscal extra</div>
                <div className="text-orange-400 font-bold">{fmt(fiscalConExtra.cuota - fiscal.cuota)}</div>
              </div>
            </div>
            {cruzaTramo && (
              <div className="text-red-300 text-sm">
                🚨 Este ingreso cruza al tramo del <strong>{(fiscalConExtra.tramoActual.tipo * 100).toFixed(0)}%</strong>.
                Considera aplazar al año siguiente para ahorrar{' '}
                <strong>{fmt((fiscalConExtra.tramoActual.tipo - fiscal.tramoActual.tipo) * extra)}</strong>.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Verificar tipos**

```bash
cd apps/plataforma && npx tsc --noEmit 2>&1 | grep "proyeccion\|ProyeccionClient" | head -10
```

- [ ] **Commit**

```bash
git add apps/plataforma/app/\(usuario\)/finanzas/proyeccion/
git commit -m "feat(plataforma): página /finanzas/proyeccion con simulador fiscal"
```

---

## Task 7: Verificación end-to-end

- [ ] **Levantar el servidor de desarrollo**

```bash
cd apps/plataforma && npm run dev
```

- [ ] **Verificar sidebar**

Navega a cualquier página → el sidebar muestra: Resumen · Banca · Gastos · Fiscal · Proyección. Correduría y Apartamentos NO aparecen.

- [ ] **Verificar `/finanzas/gastos`**

1. Sin filtros → se ven movimientos de todos los buckets
2. Filtro Negocio=Correduría → solo movimientos con destino `seguros`
3. Filtro Negocio=Apartamentos → solo `turistico_pisos` / `turistico_duplex`
4. Checkbox "Sin justificante" → solo deducibles sin `factura_ref` y sin `conciliado`
5. Cambiar a modo Rango → introducir fechas → clic Aplicar → URL cambia con `desde=` y `hasta=`

- [ ] **Verificar `/finanzas/fiscal`**

1. Los 3 KPI (base imponible, tipo efectivo, cuota) muestran valores
2. La barra de tramos tiene colores progresivos y marca el tramo actual
3. La alerta de tramo aparece si `margenHastaProximoTramo` no es null
4. La comparativa conjunta/separada muestra dos columnas con la recomendada marcada en verde
5. Selector de año → cambia datos

- [ ] **Verificar `/finanzas/proyeccion`**

1. Los 3 KPI (base real, reservas, proyectada) se muestran
2. Si hay reservas futuras en sivra, aparecen por mes
3. Simulador: introducir 15.000€ → nueva cuota y coste fiscal extra se calculan en tiempo real
4. Si el importe cruza de tramo, aparece la alerta roja con el ahorro sugerido

- [ ] **TypeCheck final**

```bash
cd apps/plataforma && npx tsc --noEmit 2>&1
```

Expected: 0 errores.

- [ ] **Commit final**

```bash
git add -A
git commit -m "feat(plataforma): nueva estructura Finanzas — Gastos, Fiscal, Proyección"
```

---

## Notas de implementación

**Sobre `compararDeclaracion`:** Antes de Task 4, comprueba la firma real en `lib/fiscal-deducciones.ts`. El agente de exploración indicó que recibe `(baseAlberto, rendimientoNetoConyuge, retencionesConyuge, perfil, descendientes, anio)`. Ajusta la llamada en `FiscalPageClient` si los parámetros difieren.

**Sobre el fetch en Proyección page.tsx:** El fetch server-to-server dentro de `page.tsx` puede fallar si la sesión no se propaga vía cookies. La alternativa robusta es importar directamente `getResumenFinanciero` y la query de sivra en el propio `page.tsx`, evitando la capa HTTP. Decide según lo que funcione en el entorno.

**Sobre `deducciones.resultado.deducciones`:** El tipo `ResultadoFiscal` puede tener el array de deducciones bajo otro nombre. Comprueba en `lib/fiscal-deducciones.ts` el tipo `ResultadoFiscal` y ajusta el acceso en `FiscalPageClient` (Task 4).
