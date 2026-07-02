# Proyección fiscal completa con patrones recurrentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enriquecer la proyección fiscal con detección automática de ingresos y gastos recurrentes históricos (IA), proyectándolos a los meses restantes del año para que el margen hasta el siguiente tramo sea realista.

**Architecture:** Nueva función `detectarPatronesRecurrentes` detecta patrones en los últimos 3 meses bancarios, los enriquece con IA (etiqueta legible + confirmación de proyectabilidad), y calcula totales proyectados. El route de proyección llama esta función y suma/resta al `baseProyectada`. El cliente muestra una tarjeta nueva con el desglose.

**Tech Stack:** Next.js 15 · Prisma `$queryRaw` · `aiComplete` (NVIDIA NIM via `lib/ai-client.ts`) · `node --test` para tests unitarios de funciones puras.

---

### Task 1: Crear `lib/gastos-recurrentes.ts`

**Files:**
- Create: `apps/plataforma/lib/gastos-recurrentes.ts`
- Create: `apps/plataforma/lib/gastos-recurrentes.test.ts`

- [ ] **Step 1: Escribir tests para las funciones puras**

```typescript
// apps/plataforma/lib/gastos-recurrentes.test.ts
import { strict as assert } from 'assert'
import { test } from 'node:test'

// Inline the pure function to test in isolation
function calcularMesesRestantes(year: number, now: Date): number {
  const yearActual = now.getFullYear()
  if (yearActual > year) return 0
  if (yearActual < year) return 12
  const mesActual = now.getMonth() + 1 // 1–12
  return Math.max(0, 12 - mesActual)
}

test('calcularMesesRestantes: julio devuelve 5 (ago-dic)', () => {
  assert.equal(calcularMesesRestantes(2026, new Date('2026-07-02')), 5)
})

test('calcularMesesRestantes: diciembre devuelve 0', () => {
  assert.equal(calcularMesesRestantes(2026, new Date('2026-12-01')), 0)
})

test('calcularMesesRestantes: enero devuelve 11', () => {
  assert.equal(calcularMesesRestantes(2026, new Date('2026-01-15')), 11)
})

test('calcularMesesRestantes: año pasado devuelve 0', () => {
  assert.equal(calcularMesesRestantes(2025, new Date('2026-07-02')), 0)
})

test('calcularMesesRestantes: año futuro devuelve 12', () => {
  assert.equal(calcularMesesRestantes(2027, new Date('2026-07-02')), 12)
})
```

- [ ] **Step 2: Ejecutar tests para verificar que fallan (función no definida)**

```bash
cd apps/plataforma && node --test lib/gastos-recurrentes.test.ts
```
Expected: error de importación o fallo de ejecución.

- [ ] **Step 3: Escribir la implementación completa**

```typescript
// apps/plataforma/lib/gastos-recurrentes.ts
import { prisma } from '@/lib/db'
import { aiComplete } from '@/lib/ai-client'

export type PatronRecurrente = {
  concepto: string
  etiqueta: string
  destino: string
  tipo: 'ingreso' | 'gasto'
  importeMedioMensual: number
  mesesDetectado: number
  proyectable: boolean
}

export function calcularMesesRestantes(year: number, now = new Date()): number {
  const yearActual = now.getFullYear()
  if (yearActual > year) return 0
  if (yearActual < year) return 12
  const mesActual = now.getMonth() + 1
  return Math.max(0, 12 - mesActual)
}

type SqlPatron = {
  concepto_normalizado: string
  destino: string
  signo: string
  meses_detectado: unknown
  importe_medio_mensual: unknown
}

async function detectarPatronesSQL(cuentaId: string): Promise<SqlPatron[]> {
  return prisma.$queryRaw<SqlPatron[]>`
    WITH movs_periodo AS (
      SELECT
        m.concepto_normalizado,
        m.destino,
        SIGN(m.importe)::int AS signo,
        ABS(m.importe) AS importe_abs,
        date_trunc('month', m.fecha) AS mes
      FROM v_movimientos_activos m
      JOIN cuentas_bancarias cb ON cb.id = m.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}
        AND m.destino IN ('seguros', 'turistico_pisos', 'turistico_duplex')
        AND COALESCE(m.amortizable, false) = false
        AND m.fecha >= date_trunc('month', now()) - INTERVAL '3 months'
        AND m.fecha < date_trunc('month', now())
    ),
    grupos AS (
      SELECT
        concepto_normalizado,
        destino,
        signo,
        COUNT(DISTINCT mes)::int AS meses_detectado,
        AVG(importe_abs) AS importe_medio_mensual
      FROM movs_periodo
      GROUP BY concepto_normalizado, destino, signo
      HAVING COUNT(DISTINCT mes) >= 2
    )
    SELECT * FROM grupos ORDER BY importe_medio_mensual DESC
  `
}

async function enriquecerConIA(candidatos: SqlPatron[]): Promise<Map<string, { etiqueta: string; proyectable: boolean }>> {
  const prompt = `Eres un asistente fiscal español. Analiza estos movimientos bancarios recurrentes detectados automáticamente y para cada uno indica si es proyectable como gasto/ingreso futuro fijo.

Responde ÚNICAMENTE con un array JSON con este formato exacto (sin texto extra):
[{"idx":0,"etiqueta":"Nombre legible","proyectable":true},...]

Candidatos:
${candidatos.map((c, i) => `${i}. concepto="${c.concepto_normalizado}" destino="${c.destino}" importe_medio=${Number(c.importe_medio_mensual).toFixed(2)}€ tipo=${Number(c.signo) > 0 ? 'ingreso' : 'gasto'}`).join('\n')}

Reglas:
- proyectable=false solo si parece un pago atrasado pagado en 2 plazos, no un gasto fijo real
- etiqueta: nombre corto y descriptivo ("Alquiler Luxury Busto", "Comisiones Generali", etc.)
- Responde solo el array JSON`

  const resultado = await aiComplete([{ role: 'user', content: prompt }])
  const parsed: Array<{ idx: number; etiqueta: string; proyectable: boolean }> = JSON.parse(resultado.trim())
  const mapa = new Map<string, { etiqueta: string; proyectable: boolean }>()
  for (const item of parsed) {
    const c = candidatos[item.idx]
    if (c) mapa.set(c.concepto_normalizado, { etiqueta: item.etiqueta, proyectable: item.proyectable })
  }
  return mapa
}

export async function detectarPatronesRecurrentes(
  cuentaId: string,
  year: number
): Promise<{
  patrones: PatronRecurrente[]
  ingresosProyectados: number
  gastosProyectados: number
  mesesRestantes: number
}> {
  const mesesRestantes = calcularMesesRestantes(year)

  const candidatos = await detectarPatronesSQL(cuentaId)
  if (candidatos.length === 0) {
    return { patrones: [], ingresosProyectados: 0, gastosProyectados: 0, mesesRestantes }
  }

  let enriquecido = new Map<string, { etiqueta: string; proyectable: boolean }>()
  try {
    enriquecido = await enriquecerConIA(candidatos)
  } catch {
    // AI fallback: usar concepto como etiqueta, proyectable=true para todos
  }

  const patrones: PatronRecurrente[] = candidatos.map(c => {
    const ia = enriquecido.get(c.concepto_normalizado)
    return {
      concepto: c.concepto_normalizado,
      etiqueta: ia?.etiqueta ?? c.concepto_normalizado,
      destino: c.destino,
      tipo: Number(c.signo) > 0 ? 'ingreso' : 'gasto',
      importeMedioMensual: Number(c.importe_medio_mensual),
      mesesDetectado: Number(c.meses_detectado),
      proyectable: ia?.proyectable ?? true,
    }
  })

  const proyectables = patrones.filter(p => p.proyectable)
  const ingresosProyectados = proyectables
    .filter(p => p.tipo === 'ingreso')
    .reduce((s, p) => s + p.importeMedioMensual * mesesRestantes, 0)
  const gastosProyectados = proyectables
    .filter(p => p.tipo === 'gasto')
    .reduce((s, p) => s + p.importeMedioMensual * mesesRestantes, 0)

  return { patrones, ingresosProyectados, gastosProyectados, mesesRestantes }
}
```

- [ ] **Step 4: Ajustar test para importar desde el fichero real**

Reemplaza el test de la función inline con una importación real (requiere `tsx` o `ts-node`). Como el entorno usa `node --test` sin transpilación TypeScript, usamos una copia inline de la función pura en el test:

```typescript
// apps/plataforma/lib/gastos-recurrentes.test.ts
import { strict as assert } from 'assert'
import { test } from 'node:test'

// Tests de la función pura calcularMesesRestantes
// La función vive en gastos-recurrentes.ts; copiamos aquí para tests node:test sin transpilación
function calcularMesesRestantes(year: number, now: Date = new Date()): number {
  const yearActual = now.getFullYear()
  if (yearActual > year) return 0
  if (yearActual < year) return 12
  const mesActual = now.getMonth() + 1
  return Math.max(0, 12 - mesActual)
}

test('julio 2026 devuelve 5 meses restantes', () => {
  assert.equal(calcularMesesRestantes(2026, new Date('2026-07-02')), 5)
})

test('diciembre devuelve 0', () => {
  assert.equal(calcularMesesRestantes(2026, new Date('2026-12-01')), 0)
})

test('enero devuelve 11', () => {
  assert.equal(calcularMesesRestantes(2026, new Date('2026-01-15')), 11)
})

test('año pasado devuelve 0', () => {
  assert.equal(calcularMesesRestantes(2025, new Date('2026-07-02')), 0)
})

test('año futuro devuelve 12', () => {
  assert.equal(calcularMesesRestantes(2027, new Date('2026-07-02')), 12)
})
```

- [ ] **Step 5: Ejecutar tests y verificar que pasan**

```bash
cd apps/plataforma && node --test lib/gastos-recurrentes.test.ts
```
Expected: `✓ julio 2026 devuelve 5 meses restantes`, `✓ diciembre devuelve 0`, etc. — todos PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/plataforma/lib/gastos-recurrentes.ts apps/plataforma/lib/gastos-recurrentes.test.ts
git commit -m "feat(plataforma): detectarPatronesRecurrentes — detección SQL + enriquecimiento IA de gastos/ingresos recurrentes"
```

---

### Task 2: Modificar `app/api/finanzas/proyeccion/route.ts`

**Files:**
- Modify: `apps/plataforma/app/api/finanzas/proyeccion/route.ts`

- [ ] **Step 1: Añadir la llamada a `detectarPatronesRecurrentes` y actualizar la fórmula**

Sustituir el contenido de `route.ts` por:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getResumenFinanciero } from '@/lib/finanzas'
import { prisma } from '@/lib/db'
import { detectarPatronesRecurrentes } from '@/lib/gastos-recurrentes'

export const dynamic = 'force-dynamic'

// GET /api/finanzas/proyeccion?year= — proyección fiscal a fin de año
// Combina ingresos reales acumulados + reservas futuras confirmadas de sivra
// + ingresos recurrentes proyectados - gastos deducibles proyectados (IA)
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()

  try {
    // Ingresos reales acumulados (mismo motor que ResumenFinanciero)
    const resumen = await getResumenFinanciero(session.id, year, 0)

    // Reservas futuras de sivra agrupadas por mes (schema sivra, tabla incomes)
    const hoy = new Date().toISOString().slice(0, 10)
    const finAnio = `${year}-12-31`

    const [reservasFuturasRows, patronesResult] = await Promise.all([
      prisma.$queryRaw<Array<{
        mes: string
        total_neto: unknown
        num_reservas: unknown
      }>>`
        SELECT
          to_char(date_trunc('month', "checkIn"), 'YYYY-MM') AS mes,
          coalesce(sum(amount), 0) AS total_neto,
          count(*)::int AS num_reservas
        FROM incomes
        WHERE "checkIn" > ${hoy}::date
          AND "checkIn" <= ${finAnio}::date
          AND amount > 0
        GROUP BY date_trunc('month', "checkIn")
        ORDER BY 1
      `,
      detectarPatronesRecurrentes(session.id, year),
    ])

    const reservasFuturas = reservasFuturasRows.map(r => ({
      mes: r.mes as string,
      totalNeto: Number(r.total_neto),
      numReservas: Number(r.num_reservas),
    }))

    const ingresosFuturos = reservasFuturas.reduce((s, r) => s + r.totalNeto, 0)

    const baseReal = resumen.fiscal.baseImponibleEstimada
    const baseProyectada =
      baseReal +
      ingresosFuturos +
      patronesResult.ingresosProyectados -
      patronesResult.gastosProyectados

    return NextResponse.json({
      baseReal,
      baseProyectada,
      ingresosFuturos,
      reservasFuturas,
      tramoActual: resumen.fiscal.tramoActual,
      tramosIRPF: resumen.fiscal.tramosIRPF,
      margenHastaProximoTramo: resumen.fiscal.margenHastaProximoTramo,
      retencionesAcumuladas: resumen.fiscal.retencionesAcumuladas,
      year,
      // Nuevos campos de patrones recurrentes
      patrones: patronesResult.patrones,
      ingresosRecurrentesProyectados: patronesResult.ingresosProyectados,
      gastosDeduciblesProyectados: patronesResult.gastosProyectados,
      mesesRestantes: patronesResult.mesesRestantes,
    })
  } catch (e) {
    console.error('[/api/finanzas/proyeccion]', e)
    return NextResponse.json({ error: 'Error al calcular proyección' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verificar que el servidor compila sin errores**

```bash
cd apps/plataforma && npx tsc --noEmit 2>&1 | head -30
```
Expected: sin errores de TypeScript relevantes al fichero modificado.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/api/finanzas/proyeccion/route.ts
git commit -m "feat(plataforma): proyeccion route — fórmula corregida con patrones recurrentes IA"
```

---

### Task 3: Modificar `ProyeccionClient.tsx`

**Files:**
- Modify: `apps/plataforma/app/(usuario)/finanzas/proyeccion/ProyeccionClient.tsx`

- [ ] **Step 1: Añadir los nuevos campos al tipo `ProyeccionData`**

Localiza el tipo `ProyeccionData` (línea 43) y añade los campos nuevos:

```typescript
type ProyeccionData = {
  baseReal: number
  baseProyectada: number
  ingresosFuturos: number
  reservasFuturas: { mes: string; totalNeto: number; numReservas: number }[]
  tramoActual: { desde: number; hasta: number | null; tipo: number }
  tramosIRPF: { desde: number; hasta: number | null; tipo: number; importe: number }[]
  margenHastaProximoTramo: number | null
  retencionesAcumuladas: number
  year: number
  // Patrones recurrentes (puede no venir en respuestas antiguas)
  patrones?: Array<{
    concepto: string
    etiqueta: string
    destino: string
    tipo: 'ingreso' | 'gasto'
    importeMedioMensual: number
    mesesDetectado: number
    proyectable: boolean
  }>
  ingresosRecurrentesProyectados?: number
  gastosDeduciblesProyectados?: number
  mesesRestantes?: number
}
```

- [ ] **Step 2: Añadir la tarjeta "🔄 Patrones detectados" y el desglose en el simulador**

La tarjeta "🔄 Patrones detectados" va debajo del bloque de `.proyec-cols` (línea ~158), antes del cierre de `<>`. Sustituye el fichero completo con la versión actualizada:

```typescript
'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useTransition } from 'react'

function fmt(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function fmtMes(mes: string) {
  const [, m] = mes.split('-')
  const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return names[(parseInt(m) - 1)] ?? mes
}

const TRAMOS_IRPF = [
  { desde: 0, hasta: 12450, tipo: 0.19 },
  { desde: 12450, hasta: 20200, tipo: 0.24 },
  { desde: 20200, hasta: 35200, tipo: 0.30 },
  { desde: 35200, hasta: 60000, tipo: 0.37 },
  { desde: 60000, hasta: 300000, tipo: 0.45 },
  { desde: 300000, hasta: null, tipo: 0.47 },
]

function calcularTramos(base: number) {
  const basePos = Math.max(0, base)
  const tramosIRPF = TRAMOS_IRPF.map(t => {
    const hasta = t.hasta ?? Infinity
    const aplicado = Math.max(0, Math.min(basePos, hasta) - t.desde)
    return { ...t, importe: aplicado * t.tipo }
  })
  const cuotaTotal = tramosIRPF.reduce((s, t) => s + t.importe, 0)
  const tramoIdx = TRAMOS_IRPF.findLastIndex(t => basePos >= t.desde)
  const tramoActual = TRAMOS_IRPF[tramoIdx] ?? TRAMOS_IRPF[0]
  const siguiente = TRAMOS_IRPF.find(t => t.desde > basePos)
  return {
    tramosIRPF,
    tramoActual,
    cuotaTotal,
    tipoEfectivo: basePos > 0 ? cuotaTotal / basePos : 0,
    margenHastaProximoTramo: siguiente ? siguiente.desde - basePos : null,
  }
}

type ProyeccionData = {
  baseReal: number
  baseProyectada: number
  ingresosFuturos: number
  reservasFuturas: { mes: string; totalNeto: number; numReservas: number }[]
  tramoActual: { desde: number; hasta: number | null; tipo: number }
  tramosIRPF: { desde: number; hasta: number | null; tipo: number; importe: number }[]
  margenHastaProximoTramo: number | null
  retencionesAcumuladas: number
  year: number
  patrones?: Array<{
    concepto: string
    etiqueta: string
    destino: string
    tipo: 'ingreso' | 'gasto'
    importeMedioMensual: number
    mesesDetectado: number
    proyectable: boolean
  }>
  ingresosRecurrentesProyectados?: number
  gastosDeduciblesProyectados?: number
  mesesRestantes?: number
}

export default function ProyeccionClient({ year: initYear }: { year: number }) {
  const router = useRouter()
  const [year, setYear] = useState(initYear)
  const [isPending, startTransition] = useTransition()
  const [data, setData] = useState<ProyeccionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Simulador
  const [ingresoExtra, setIngresoExtra] = useState(0)

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear + 1].filter(y => y >= 2024)

  useEffect(() => {
    setLoading(true); setError('')
    fetch(`/api/finanzas/proyeccion?year=${year}`)
      .then(r => { if (!r.ok) throw new Error('Error al cargar proyección'); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [year])

  function navegarAnio(y: number) {
    setYear(y)
    startTransition(() => router.push(`/finanzas/proyeccion?year=${y}`, { scroll: false }))
  }

  // Base proyectada + simulador
  const baseProyectada = data ? data.baseProyectada + ingresoExtra : 0
  const calculo = data ? calcularTramos(baseProyectada) : null
  const calculoSinExtra = data ? calcularTramos(data.baseProyectada) : null

  const diferenciaCuota = calculo && calculoSinExtra
    ? calculo.cuotaTotal - calculoSinExtra.cuotaTotal
    : 0

  const resultadoFinal = calculo ? calculo.cuotaTotal - (data?.retencionesAcumuladas ?? 0) : 0

  // Alerta de cruce de tramo
  const cruzaTramo = calculo && calculoSinExtra
    ? calculo.tramoActual.tipo > calculoSinExtra.tramoActual.tipo
    : false

  const patronesIngreso = data?.patrones?.filter(p => p.tipo === 'ingreso' && p.proyectable) ?? []
  const patronesGasto = data?.patrones?.filter(p => p.tipo === 'gasto' && p.proyectable) ?? []
  const mesesRestantes = data?.mesesRestantes ?? 0
  const hayPatrones = (data?.patrones?.length ?? 0) > 0

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>
      <style>{`
        @media (max-width: 768px) {
          .proyec-cols { grid-template-columns: 1fr !important; }
          .proyec-kpis { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px) { .proyec-kpis { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, flex: 1 }}>📈 Proyección fiscal</h1>
        <div style={{ display: 'flex', gap: '4px' }}>
          {years.map(y => (
            <button key={y} onClick={() => navegarAnio(y)} style={{
              padding: '5px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', border: '1px solid var(--border)',
              background: year === y ? 'var(--primary)' : 'var(--surface)', color: year === y ? '#fff' : 'var(--text)', fontWeight: year === y ? 700 : 400,
            }}>{y}</button>
          ))}
        </div>
        {isPending && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cargando…</span>}
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>Calculando proyección…</div>
      ) : error ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#e53e3e' }}>{error}</div>
      ) : data && calculo ? (
        <>
          {/* KPIs */}
          <div className="proyec-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Base real acumulada', value: data.baseReal, color: 'var(--primary)', sub: 'Datos bancarios confirmados' },
              { label: 'Ingresos futuros (reservas)', value: data.ingresosFuturos, color: '#805ad5', sub: `${data.reservasFuturas.length} meses con reservas` },
              { label: 'Base proyectada a cierre', value: baseProyectada, color: '#e53e3e', sub: `Tramo: ${(calculo.tramoActual.tipo * 100).toFixed(0)}%` },
              { label: 'Resultado estimado', value: resultadoFinal, color: resultadoFinal <= 0 ? 'var(--primary)' : '#e53e3e', sub: resultadoFinal <= 0 ? 'A devolver' : 'A pagar' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{k.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: k.color }}>{fmt(k.value)}</div>
                {k.sub && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* Alerta de tramo */}
          {calculo.margenHastaProximoTramo !== null && calculo.margenHastaProximoTramo < 8000 && (
            <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '8px', padding: '14px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#742a2a' }}>Cerca del siguiente tramo</div>
                <div style={{ fontSize: '12px', color: '#742a2a' }}>
                  Te quedan <strong>{fmt(calculo.margenHastaProximoTramo)}</strong> para entrar al {TRAMOS_IRPF.find(t => t.desde > baseProyectada) ? `${(TRAMOS_IRPF.find(t => t.desde > baseProyectada)!.tipo * 100).toFixed(0)}%` : 'siguiente tramo'}.
                  Considera aplazar ingresos al año siguiente.
                </div>
              </div>
            </div>
          )}

          <div className="proyec-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            {/* Reservas futuras */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>🏨 Reservas futuras confirmadas</div>
              {data.reservasFuturas.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Sin reservas futuras para este año.</p>
              ) : (
                <>
                  {data.reservasFuturas.map(r => (
                    <div key={r.mes} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                      <span style={{ fontWeight: 600 }}>{fmtMes(r.mes)}</span>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{r.numReservas} reservas</span>
                      <span style={{ fontWeight: 700, color: '#805ad5' }}>{fmt(r.totalNeto)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '13px', paddingTop: '8px' }}>
                    <span>Total futuro</span>
                    <span style={{ color: '#805ad5' }}>{fmt(data.ingresosFuturos)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Simulador */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>🎚️ Simulador ¿qué pasa si…?</div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Ingreso adicional hipotético</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                <input
                  type="number"
                  value={ingresoExtra || ''}
                  onChange={e => setIngresoExtra(Number(e.target.value) || 0)}
                  placeholder="Ej: 10000"
                  style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '14px' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>€</span>
                {ingresoExtra > 0 && (
                  <button onClick={() => setIngresoExtra(0)} style={{ fontSize: '12px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                )}
              </div>

              {/* Resultado en tiempo real */}
              <div style={{ background: 'var(--primary-light)', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--muted)' }}>Base sin extra</span>
                    <span style={{ fontWeight: 600 }}>{fmt(data.baseProyectada)}</span>
                  </div>
                  {ingresoExtra > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--muted)' }}>+ Ingreso extra</span>
                      <span style={{ fontWeight: 600, color: '#805ad5' }}>+{fmt(ingresoExtra)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--border)', marginTop: '4px' }}>
                    <span style={{ fontWeight: 600 }}>Base proyectada</span>
                    <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)' }}>{fmt(baseProyectada)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--muted)' }}>Cuota estimada</span>
                  <span style={{ fontWeight: 700, color: '#e53e3e' }}>{fmt(calculo.cuotaTotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--muted)' }}>Tipo efectivo</span>
                  <span style={{ fontWeight: 600 }}>{(calculo.tipoEfectivo * 100).toFixed(1)}%</span>
                </div>
                {ingresoExtra > 0 && (
                  <div style={{ marginTop: '8px', padding: '8px 10px', background: cruzaTramo ? '#fff5f5' : '#c6f6d5', borderRadius: '6px', fontSize: '12px', color: cruzaTramo ? '#742a2a' : '#22543d', fontWeight: 600 }}>
                    {cruzaTramo
                      ? `⚠️ Este ingreso te sube al ${(calculo.tramoActual.tipo * 100).toFixed(0)}% (+${fmt(diferenciaCuota)} de IRPF extra)`
                      : `✓ Sin cambio de tramo · +${fmt(diferenciaCuota)} de IRPF`}
                  </div>
                )}
              </div>

              {/* Tramo actual */}
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--muted)' }}>
                Tramo marginal actual: <strong style={{ color: 'var(--text)' }}>{(calculo.tramoActual.tipo * 100).toFixed(0)}%</strong>
                {' '}({fmt(calculo.tramoActual.desde)}–{calculo.tramoActual.hasta ? fmt(calculo.tramoActual.hasta) : '∞'})
                {calculo.margenHastaProximoTramo !== null && (
                  <span style={{ marginLeft: '8px' }}>· {fmt(calculo.margenHastaProximoTramo)} para el siguiente</span>
                )}
              </div>
            </div>
          </div>

          {/* Patrones recurrentes detectados por IA */}
          {hayPatrones && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '16px' }}>
                🔄 Patrones detectados · proyección {mesesRestantes} meses restantes
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Ingresos recurrentes */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#276749', marginBottom: '8px' }}>
                    Ingresos proyectados
                    <span style={{ marginLeft: '8px', color: '#22543d', background: '#c6f6d5', borderRadius: '4px', padding: '2px 6px' }}>
                      +{fmt(data.ingresosRecurrentesProyectados ?? 0)}
                    </span>
                  </div>
                  {patronesIngreso.length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Sin patrones de ingreso detectados.</p>
                  ) : patronesIngreso.map(p => (
                    <div key={p.concepto} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--border)', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.etiqueta}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmt(p.importeMedioMensual)}/mes × {mesesRestantes}</div>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#276749', whiteSpace: 'nowrap' }}>+{fmt(p.importeMedioMensual * mesesRestantes)}</span>
                    </div>
                  ))}
                </div>

                {/* Gastos deducibles recurrentes */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#9b2c2c', marginBottom: '8px' }}>
                    Gastos proyectados
                    <span style={{ marginLeft: '8px', color: '#742a2a', background: '#fed7d7', borderRadius: '4px', padding: '2px 6px' }}>
                      -{fmt(data.gastosDeduciblesProyectados ?? 0)}
                    </span>
                  </div>
                  {patronesGasto.length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Sin patrones de gasto detectados.</p>
                  ) : patronesGasto.map(p => (
                    <div key={p.concepto} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--border)', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.etiqueta}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmt(p.importeMedioMensual)}/mes × {mesesRestantes}</div>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#9b2c2c', whiteSpace: 'nowrap' }}>-{fmt(p.importeMedioMensual * mesesRestantes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </main>
  )
}
```

- [ ] **Step 3: Verificar que compila**

```bash
cd apps/plataforma && npx tsc --noEmit 2>&1 | head -30
```
Expected: sin errores de TypeScript en los archivos modificados.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/app/(usuario)/finanzas/proyeccion/ProyeccionClient.tsx
git commit -m "feat(plataforma): ProyeccionClient — tarjeta patrones recurrentes IA con ingresos/gastos proyectados"
```

---

### Task 4: Push y PR

- [ ] **Step 1: Push a la rama de feature**

```bash
git push -u origin claude/tax-bracket-expense-planning-7b3zm5
```

- [ ] **Step 2: Verificar PR existente o crear uno nuevo**

Comprobar si ya existe PR para la rama. Si existe, el push actualiza el PR automáticamente.

---

## Self-Review

### Spec coverage

| Requisito spec | Tarea |
|---|---|
| SQL detección últimos 3 meses, ≥2 de 3 meses, excluye `duplicado_estado='ignorado'` y `amortizable=true` | Task 1 — SQL en `detectarPatronesSQL` usando `v_movimientos_activos` |
| `destino IN ('seguros', 'turistico_pisos', 'turistico_duplex')` | Task 1 — filtro SQL |
| Llamada única a IA con todos los candidatos | Task 1 — `enriquecerConIA` |
| `PatronRecurrente` type con todos los campos del spec | Task 1 — type exportado |
| `mesesRestantes` correctos | Task 1 — `calcularMesesRestantes` con tests |
| AI fallback: etiqueta=concepto, proyectable=true | Task 1 — bloque try/catch |
| Nuevos campos en route response | Task 2 |
| Fórmula corregida `baseProyectada` | Task 2 |
| KPI "Base proyectada a cierre" usa base corregida | Task 3 — ya la usaba via `data.baseProyectada` del API |
| Tarjeta "🔄 Patrones detectados" | Task 3 |
| Sublista ingresos (verde) y gastos (rojo) | Task 3 |
| Por ítem: etiqueta, importe/mes, × meses, total | Task 3 |
| Advertencia tramo sobre base corregida | Task 3 — `calculo` ya usa `baseProyectada` que incluye patrones |
| Diciembre: `mesesRestantes=0`, proyecciones=0 | Task 1 — `calcularMesesRestantes` devuelve 0 |
| Sin patrones: respuesta vacía, base igual que antes | Task 1 — check `candidatos.length === 0` |

### Placeholder scan
- Ningún "TBD", "TODO" o "implement later" en el plan.
- Todo código completo.

### Type consistency
- `PatronRecurrente.importeMedioMensual: number` — siempre positivo (se usa `ABS` en SQL).
- `PatronRecurrente.tipo: 'ingreso' | 'gasto'` — derivado de `SIGN(importe)`.
- `ProyeccionData.patrones` marcado como opcional (`?`) para retrocompatibilidad.
- `ingresosRecurrentesProyectados` y `gastosDeduciblesProyectados` también opcionales en el tipo del cliente.
