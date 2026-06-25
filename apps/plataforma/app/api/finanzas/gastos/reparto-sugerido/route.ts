import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Sugerencia de reparto AUTOMÁTICO de un cargo compartido (lavandería/suministros) entre pisos,
// ponderado por la ACTIVIDAD real de cada piso en el mes del cargo:
//
//     peso_piso = Σ huéspedes servidos en el mes  (= nº_limpiezas × huéspedes por salida)
//
// Es lo que más acerca el margen por piso a la realidad: para la lavandería el consumo real
// depende de cuántas salidas hubo (cada limpieza genera ropa) y de cuántos huéspedes por salida
// (más huéspedes → más ropa). Se usan los huéspedes reales de cada limpieza (cleaning_sessions
// .num_huespedes) y, cuando ese dato no viene, la capacidad del piso (properties.maxGuests).
// El endpoint es de SOLO LECTURA: devuelve los % sugeridos para que la UI los pre-rellene; el
// usuario revisa y guarda por el flujo normal (POST /api/finanzas/gastos/desglose).
//
// Fallbacks: si no hay limpiezas ese mes en ningún piso → reparto por capacidad (maxGuests);
// si tampoco hay capacidad → reparto equitativo. Así siempre propone algo sensato.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

type RepartoSug = { propiedad: string; nombre: string; limpiezas: number; huespedes: number; capacidad: number; peso: number; porcentaje: number }

// Reparte 100% proporcional al peso, redondeando a 1 decimal y cuadrando el resto en el piso
// de mayor peso para que la suma sea exactamente 100.0.
function repartirPorPeso(items: RepartoSug[]): RepartoSug[] {
  const total = items.reduce((s, it) => s + it.peso, 0)
  if (total <= 0) return []
  const con = items.filter(it => it.peso > 0).map(it => ({ ...it, porcentaje: Math.round((it.peso / total) * 1000) / 10 }))
  const suma = con.reduce((s, it) => s + it.porcentaje, 0)
  const diff = Math.round((100 - suma) * 10) / 10
  if (con.length && Math.abs(diff) >= 0.1) {
    let idx = 0
    for (let i = 1; i < con.length; i++) if (con[i].peso > con[idx].peso) idx = i
    con[idx].porcentaje = Math.round((con[idx].porcentaje + diff) * 10) / 10
  }
  return con
}

// GET ?movimientoId=...  → { ok, periodo, base, repartos:[{propiedad,porcentaje,limpiezas,huespedes}] }
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const movimientoId = req.nextUrl.searchParams.get('movimientoId')
  if (!movimientoId) return NextResponse.json({ error: 'Falta movimientoId' }, { status: 400 })

  // El movimiento debe ser de la cuenta del usuario (scope multi-tenant).
  const movRows = await prisma.$queryRaw<Array<{ fecha_operacion: Date | null }>>`
    SELECT mb.fecha_operacion
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.id = ${movimientoId}::uuid AND cb.cuenta_id = ${session.id}::uuid
    LIMIT 1
  `
  if (!movRows[0]) return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 })
  // Si el cargo no tiene fecha, usamos el mes actual como referencia de actividad.
  const fecha = movRows[0].fecha_operacion ?? new Date()

  // Actividad del MES del cargo por piso. cleaning_sessions.property_id guarda el slug (prop_*) de
  // los pisos turísticos; al unir por ese slug nos ceñimos a los pisos de esta cuenta. No se filtra
  // por completed_at: las limpiezas vienen sincronizadas por iCal y rara vez se marcan completadas,
  // pero la salida (session_date) sí ocurrió y es la que genera lavandería. Por cada limpieza se
  // cuentan sus huéspedes reales (num_huespedes) o, si falta, la capacidad del piso (maxGuests).
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; capacidad: number; limpiezas: number; huespedes: number }>>`
    SELECT p.id, p.name, COALESCE(p."maxGuests", 0)::int AS capacidad,
           COUNT(cs.id)::int AS limpiezas,
           COALESCE(SUM(COALESCE(cs.num_huespedes, p."maxGuests")), 0)::int AS huespedes
    FROM properties p
    LEFT JOIN cleaning_sessions cs ON cs.property_id = p.id
      AND cs.session_date >= date_trunc('month', ${fecha}::date)
      AND cs.session_date <  date_trunc('month', ${fecha}::date) + interval '1 month'
    WHERE p.id <> 'prop_multi_apartamentos'
    GROUP BY p.id, p.name, p."maxGuests"
    ORDER BY p.name
  `

  const base = rows.map<RepartoSug>(r => ({
    propiedad: r.id, nombre: r.name, capacidad: Number(r.capacidad),
    limpiezas: Number(r.limpiezas), huespedes: Number(r.huespedes), peso: 0, porcentaje: 0,
  }))

  // 1) Por actividad (Σ huéspedes del mes). 2) Por capacidad (maxGuests). 3) Equitativo.
  let modo: 'actividad' | 'capacidad' | 'equitativo' = 'actividad'
  let repartos = repartirPorPeso(base.map(b => ({ ...b, peso: b.huespedes })))
  if (!repartos.length) {
    modo = 'capacidad'
    repartos = repartirPorPeso(base.map(b => ({ ...b, peso: b.capacidad })))
  }
  if (!repartos.length) {
    modo = 'equitativo'
    repartos = repartirPorPeso(base.map(b => ({ ...b, peso: 1 })))
  }

  const periodo = `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`
  return NextResponse.json({
    ok: true,
    periodo,
    base: modo,
    repartos: repartos.map(r => ({ propiedad: r.propiedad, nombre: r.nombre, porcentaje: r.porcentaje, limpiezas: r.limpiezas, huespedes: r.huespedes })),
  })
}
