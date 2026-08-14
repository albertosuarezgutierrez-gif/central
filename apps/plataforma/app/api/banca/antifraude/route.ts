import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { comercioDe } from '@/lib/comercio'
import { claveComercio } from '@/lib/comercio-canonico'
import { dobleCobro, esCargoFinanciero, subioPrecio, baseRecurrente, type CargoPrevio } from '@/lib/vigilantes-tarjeta'
import { eur } from '@/lib/dinero'

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
const SUBIDA_PCT = 25        // % de subida sobre el precio de referencia para avisar

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

  // 1) Posible cobro doble: mismo comercio + mismo importe + MISMO DÍA (≥2 veces). Repetir importe
  //    en días distintos es rutina, no duplicado — ver lib/vigilantes-tarjeta.ts.
  for (const g of dobleCobro(periodo.map(c => ({ id: c.id, comercio: c.comercio, importe: c.importe, fecha: c.fecha })))) {
    g.ids.forEach(id => yaAvisado.add(id))
    avisos.push({
      tipo: 'doble', comercio: g.comercio, importe: g.importe, fecha: g.fecha,
      motivo: `${g.ids.length} cargos idénticos de ${g.comercio} el mismo día — ¿cobro repetido?`,
    })
  }

  // Índice del histórico previo por IDENTIDAD de comercio (claveComercio), no por el rótulo literal:
  // otra sucursal de la misma cadena ("MERCADONA COLMENA" vs "MERCADONA SAN PABLO") NO es un
  // comercio nuevo, y decir que no se reconoce es afirmar algo que el histórico desmiente.
  const previoPorComercio = new Map<string, CargoPrevio[]>()
  for (const c of previo) {
    const k = claveComercio(c.comercio)
    if (!k) continue
    const arr = previoPorComercio.get(k) ?? []
    arr.push({ importe: Math.abs(c.importe), fecha: c.fecha ?? '' })
    previoPorComercio.set(k, arr)
  }
  const hayHistorico = previoPorComercio.size > 0

  for (const c of periodo) {
    if (yaAvisado.has(c.id)) continue
    if (esCargoFinanciero(c.comercio)) {
      avisos.push({ tipo: 'financiero', comercio: c.comercio, importe: Math.abs(c.importe), fecha: c.fecha, motivo: 'Interés/comisión/aplazamiento: liquidando a tiempo se evita.' })
      yaAvisado.add(c.id)
      continue
    }
    const previos = previoPorComercio.get(claveComercio(c.comercio)) ?? []
    if (previos.length === 0) {
      // 2) Comercio nunca visto con importe alto. Solo se afirma si HAY histórico antes del
      //    periodo: si el periodo se come toda la ventana (o la cuenta acaba de darse de alta) no
      //    hay con qué comparar y TODO parecería nuevo — eso no es un hallazgo, es un hueco.
      if (hayHistorico && Math.abs(c.importe) >= NUEVO_UMBRAL) {
        avisos.push({ tipo: 'nuevo', comercio: c.comercio, importe: Math.abs(c.importe), fecha: c.fecha, motivo: 'Comercio que no aparecía en el último año, con importe alto.' })
        yaAvisado.add(c.id)
      }
      continue
    }
    // 3) Subida fuerte, SOLO en recurrentes de importe estable (suscripciones/cuotas). En un súper
    //    o un bar el importe cambia cada vez: ahí "subida" no significa nada (ver baseRecurrente).
    const base = baseRecurrente(previos)
    if (base !== null && subioPrecio(c.importe, base, SUBIDA_PCT)) {
      const pct = Math.round(((Math.abs(c.importe) - base) / base) * 100)
      avisos.push({ tipo: 'subida', comercio: c.comercio, importe: Math.abs(c.importe), fecha: c.fecha, motivo: `Subió un ${pct}% sobre su importe habitual (~${eur(base)}).` })
      yaAvisado.add(c.id)
    }
  }

  // Orden: primero cobros dobles y nuevos (más relevantes), luego por importe.
  const peso: Record<Aviso['tipo'], number> = { doble: 0, nuevo: 1, subida: 2, financiero: 3 }
  avisos.sort((a, b) => peso[a.tipo] - peso[b.tipo] || b.importe - a.importe)

  // El hueco se DECLARA (no se sirve como "todo en orden"): sin histórico previo no se ha podido
  // mirar si un comercio es nuevo, y callarlo haría pasar un "no lo sé" por un "no hay nada raro".
  const nota = hayHistorico ? undefined
    : 'Sin movimientos anteriores al periodo elegido: no he podido comprobar qué comercios son nuevos. Prueba con un periodo más corto.'
  return NextResponse.json({ avisos: avisos.slice(0, 30), revisados: periodo.length, ...(nota ? { nota } : {}) })
}
