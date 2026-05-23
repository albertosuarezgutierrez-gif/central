export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

type Periodo = { desde: string; hasta: string }

function periodoActual(tipo: string): Periodo {
  const hoy = new Date()
  const iso = (d: Date) => d.toISOString().split('T')[0]
  if (tipo === 'semana') {
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - hoy.getDay() + 1)
    return { desde: iso(lunes), hasta: iso(hoy) }
  }
  if (tipo === 'mes') {
    return { desde: `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`, hasta: iso(hoy) }
  }
  if (tipo === 'trimestre') {
    const trim = Math.floor(hoy.getMonth() / 3)
    return { desde: `${hoy.getFullYear()}-${String(trim*3+1).padStart(2,'0')}-01`, hasta: iso(hoy) }
  }
  // hoy
  return { desde: iso(hoy), hasta: iso(hoy) }
}

function periodoAnterior(tipo: string): Periodo {
  const hoy = new Date()
  const iso = (d: Date) => d.toISOString().split('T')[0]
  if (tipo === 'semana') {
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - hoy.getDay() + 1)
    const lunesAnt = new Date(lunes); lunesAnt.setDate(lunes.getDate() - 7)
    const domAnt   = new Date(lunesAnt); domAnt.setDate(lunesAnt.getDate() + 6)
    return { desde: iso(lunesAnt), hasta: iso(domAnt) }
  }
  if (tipo === 'mes') {
    const primerMesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
    const ultiMesAnt   = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
    return { desde: iso(primerMesAnt), hasta: iso(ultiMesAnt) }
  }
  if (tipo === 'trimestre') {
    const trim = Math.floor(hoy.getMonth() / 3)
    const trimAnt = trim === 0 ? 3 : trim - 1
    const yearAnt = trim === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear()
    const ultimo  = new Date(yearAnt, trimAnt * 3 + 3, 0)
    return { desde: `${yearAnt}-${String(trimAnt*3+1).padStart(2,'0')}-01`, hasta: iso(ultimo) }
  }
  // ayer
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1)
  return { desde: iso(ayer), hasta: iso(ayer) }
}

async function getMetricasPeriodo(
  supabase: ReturnType<typeof createServerClient>,
  rid: string, p: Periodo
) {
  const desde = `${p.desde}T00:00:00`
  const hasta  = `${p.hasta}T23:59:59`

  const [rFact, rComandas, rItems] = await Promise.all([
    // Ventas desde facturas VeriFactu
    supabase.from('facturas_verifactu')
      .select('importe_total, metodo_pago, fecha')
      .eq('restaurante_id', rid).eq('estado', 'emitida')
      .gte('fecha', desde).lte('fecha', hasta),
    // Comandas para ticket medio y conteo
    supabase.from('comandas')
      .select('id, total_cobrado, created_at, mesa:mesas(nombre, zona)')
      .eq('restaurante_id', rid).eq('estado', 'cerrada')
      .gte('created_at', desde).lte('created_at', hasta),
    // Productos más vendidos
    supabase.from('comanda_items')
      .select('nombre, cantidad, precio_unitario, comandas!inner(restaurante_id, created_at, estado)')
      .eq('comandas.restaurante_id', rid).eq('comandas.estado', 'cerrada')
      .gte('comandas.created_at', desde).lte('comandas.created_at', hasta),
  ])

  const facturas  = rFact.data ?? []
  const comandas  = rComandas.data ?? []
  const items     = rItems.data ?? []

  const ventas_brutas = facturas.reduce((s, f) => s + Number(f.importe_total), 0)
  const num_comandas  = comandas.length
  const ticket_medio  = num_comandas > 0 ? ventas_brutas / num_comandas : 0

  // Cobros por canal
  const cobros = facturas.reduce((acc, f) => {
    const m = f.metodo_pago ?? 'otros'
    acc[m] = (acc[m] ?? 0) + Number(f.importe_total)
    return acc
  }, {} as Record<string, number>)

  // Top 5 productos
  const porProd: Record<string, { nombre: string; unidades: number; importe: number }> = {}
  for (const it of items) {
    const k = it.nombre
    if (!porProd[k]) porProd[k] = { nombre: k, unidades: 0, importe: 0 }
    porProd[k].unidades += Number(it.cantidad)
    porProd[k].importe  += Number(it.cantidad) * Number(it.precio_unitario)
  }
  const top_productos = Object.values(porProd).sort((a, b) => b.importe - a.importe).slice(0, 5)

  // Ventas por día (para sparkline)
  const porDia: Record<string, number> = {}
  for (const f of facturas) {
    const dia = f.fecha?.slice(0, 10) ?? ''
    porDia[dia] = (porDia[dia] ?? 0) + Number(f.importe_total)
  }
  const evolucion = Object.entries(porDia).sort(([a], [b]) => a.localeCompare(b)).map(([fecha, ventas]) => ({ fecha, ventas }))

  // Por hora (distribución del servicio)
  const porHora: Record<number, number> = {}
  for (const c of comandas) {
    const h = new Date(c.created_at).getHours()
    porHora[h] = (porHora[h] ?? 0) + 1
  }
  const pico_hora = Object.entries(porHora).sort(([,a],[,b]) => b - a)[0]?.[0]

  return {
    ventas_brutas:  Math.round(ventas_brutas  * 100) / 100,
    num_comandas,
    ticket_medio:   Math.round(ticket_medio   * 100) / 100,
    cobros,
    top_productos,
    evolucion,
    pico_hora:      pico_hora ? Number(pico_hora) : null,
    dias:           evolucion.length,
    periodo:        p,
  }
}

/**
 * GET /api/owner/analytics?tipo=semana|mes|trimestre|hoy
 * Devuelve métricas del período actual vs período anterior.
 * Para grupos: incluye también comparativa entre locales.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const tipo = req.nextUrl.searchParams.get('tipo') ?? 'semana'
  const actual   = periodoActual(tipo)
  const anterior = periodoAnterior(tipo)

  const [mActual, mAnterior] = await Promise.all([
    getMetricasPeriodo(supabase, rid, actual),
    getMetricasPeriodo(supabase, rid, anterior),
  ])

  // Deltas porcentuales
  const delta = (a: number, b: number) =>
    b === 0 ? null : Math.round((a - b) / b * 1000) / 10  // 1 decimal %

  const comparativa = {
    ventas:  delta(mActual.ventas_brutas, mAnterior.ventas_brutas),
    comandas:delta(mActual.num_comandas,  mAnterior.num_comandas),
    ticket:  delta(mActual.ticket_medio,  mAnterior.ticket_medio),
  }

  // Comparativa multi-local (si hay cuenta con varios restaurantes)
  let grupo: { id: string; nombre: string; ventas: number; ticket: number; comandas: number }[] = []
  const { data: restInfo } = await supabase
    .from('restaurantes').select('cuenta_id, nombre').eq('id', rid).single()
  if (restInfo?.cuenta_id) {
    const { data: hermanos } = await supabase
      .from('restaurantes').select('id, nombre').eq('cuenta_id', restInfo.cuenta_id)
    if (hermanos && hermanos.length > 1) {
      const mHermanos = await Promise.all(
        hermanos.map(async h => {
          const m = await getMetricasPeriodo(supabase, h.id, actual)
          return { id: h.id, nombre: h.nombre, ventas: m.ventas_brutas, ticket: m.ticket_medio, comandas: m.num_comandas }
        })
      )
      grupo = mHermanos.sort((a, b) => b.ventas - a.ventas)
    }
  }

  return NextResponse.json({
    ok: true,
    tipo,
    actual:    { ...mActual,   label: tipo === 'semana' ? 'Esta semana' : tipo === 'mes' ? 'Este mes' : tipo === 'trimestre' ? 'Este trimestre' : 'Hoy' },
    anterior:  { ...mAnterior, label: tipo === 'semana' ? 'Semana anterior' : tipo === 'mes' ? 'Mes anterior' : tipo === 'trimestre' ? 'Trimestre anterior' : 'Ayer' },
    comparativa,
    grupo,
  })
}
