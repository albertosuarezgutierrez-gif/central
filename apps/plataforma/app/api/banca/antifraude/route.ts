import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { comercioDe } from '@/lib/comercio'
import { dobleCobro, esCargoFinanciero, subioPrecio } from '@/lib/vigilantes-tarjeta'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST /api/banca/antifraude { desde, hasta } — 🚨 Cargos raros / antifraude de /banca. Es DETERMINISTA
// (reglas puras, NO IA): para dinero/fraude las reglas son más fiables que un LLM (no alucinan cifras).
// Reutiliza los vigilantes puros de la tarjeta (dobleCobro/esCargoFinanciero/subioPrecio) + comercioDe.
// Marca sobre los CARGOS del periodo: posible cobro doble, comercio nunca visto con importe alto, subida
// fuerte de un recurrente, y cargos financieros (intereses/comisiones). Solo avisa; el dueño decide.
type Cargo = { id: string; fecha: string | null; comercio: string; importe: number }
type Aviso = { tipo: 'doble' | 'nuevo' | 'subida' | 'financiero'; comercio: string; importe: number; fecha: string | null; motivo: string }

const NUEVO_UMBRAL = 60      // € mínimo para avisar de un comercio nunca visto
const SUBIDA_PCT = 25        // % de subida sobre la mediana previa para avisar

function mediana(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { desde, hasta } = await req.json().catch(() => ({})) as { desde?: string; hasta?: string }
  if (!desde || !hasta) return NextResponse.json({ error: 'Periodo requerido' }, { status: 400 })

  // Histórico de 365 días hasta el fin del periodo (para "nunca visto" y "subida de precio").
  // v_movimientos_activos = vista canónica (ya excluye duplicados). Solo CARGOS (importe<0).
  let rows: Array<{ id: string; fecha: string | null; concepto: string | null; concepto_normalizado: string | null; contraparte: string | null; importe: number }>
  try {
    rows = await prisma.$queryRaw<typeof rows>`
      SELECT mb.id,
             mb.fecha_operacion::text AS fecha,
             mb.concepto, mb.concepto_normalizado, mb.contraparte,
             mb.importe::float AS importe
      FROM v_movimientos_activos mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${session.id}::uuid
        AND mb.importe < 0
        AND mb.fecha_operacion BETWEEN (${hasta}::date - INTERVAL '365 days') AND ${hasta}::date
      ORDER BY mb.fecha_operacion ASC
    `
  } catch (e) {
    console.error('[antifraude]', e)
    return NextResponse.json({ avisos: [], nota: 'No se pudo revisar los movimientos ahora mismo.' })
  }

  const conComercio = rows.map(r => ({
    id: r.id,
    fecha: r.fecha,
    comercio: comercioDe(r.contraparte, r.concepto_normalizado || r.concepto),
    importe: r.importe,
  })).filter(r => r.comercio)

  const enPeriodo = (c: Cargo) => !!c.fecha && c.fecha >= desde && c.fecha <= hasta
  const periodo = conComercio.filter(enPeriodo)
  const previo = conComercio.filter(c => !!c.fecha && c.fecha < desde)

  const avisos: Aviso[] = []
  const yaAvisado = new Set<string>()   // id → no repetir el mismo cargo en dos reglas

  // 1) Posible cobro doble: mismo comercio + mismo importe ≥2 veces en el periodo.
  for (const g of dobleCobro(periodo.map(c => ({ id: c.id, comercio: c.comercio, importe: c.importe })))) {
    const primero = periodo.find(c => c.id === g.ids[0])
    g.ids.forEach(id => yaAvisado.add(id))
    avisos.push({
      tipo: 'doble', comercio: g.comercio, importe: g.importe, fecha: primero?.fecha ?? null,
      motivo: `${g.ids.length} cargos idénticos de ${g.comercio} por el mismo importe — ¿cobro repetido?`,
    })
  }

  // Índice del histórico previo por comercio (para "nunca visto" y "subida").
  const previoPorComercio = new Map<string, number[]>()
  for (const c of previo) {
    const k = c.comercio.toLowerCase()
    const arr = previoPorComercio.get(k) ?? []
    arr.push(Math.abs(c.importe))
    previoPorComercio.set(k, arr)
  }

  for (const c of periodo) {
    if (yaAvisado.has(c.id)) continue
    if (esCargoFinanciero(c.comercio)) {
      avisos.push({ tipo: 'financiero', comercio: c.comercio, importe: Math.abs(c.importe), fecha: c.fecha, motivo: 'Interés/comisión/aplazamiento: liquidando a tiempo se evita.' })
      yaAvisado.add(c.id)
      continue
    }
    const previos = previoPorComercio.get(c.comercio.toLowerCase())
    if (!previos || previos.length === 0) {
      // 2) Comercio nunca visto con importe alto.
      if (Math.abs(c.importe) >= NUEVO_UMBRAL) {
        avisos.push({ tipo: 'nuevo', comercio: c.comercio, importe: Math.abs(c.importe), fecha: c.fecha, motivo: 'Comercio que no aparecía en el último año, con importe alto.' })
        yaAvisado.add(c.id)
      }
    } else if (previos.length >= 3) {
      // 3) Subida fuerte de un recurrente (vs la mediana de lo anterior).
      const base = mediana(previos)
      if (subioPrecio(c.importe, base, SUBIDA_PCT)) {
        const pct = Math.round(((Math.abs(c.importe) - base) / base) * 100)
        avisos.push({ tipo: 'subida', comercio: c.comercio, importe: Math.abs(c.importe), fecha: c.fecha, motivo: `Subió un ${pct}% sobre lo habitual (~${base.toFixed(2)}€).` })
        yaAvisado.add(c.id)
      }
    }
  }

  // Orden: primero cobros dobles y nuevos (más relevantes), luego por importe.
  const peso: Record<Aviso['tipo'], number> = { doble: 0, nuevo: 1, subida: 2, financiero: 3 }
  avisos.sort((a, b) => peso[a.tipo] - peso[b.tipo] || b.importe - a.importe)

  return NextResponse.json({ avisos: avisos.slice(0, 30), revisados: periodo.length })
}
