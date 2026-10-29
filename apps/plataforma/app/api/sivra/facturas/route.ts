import { NextRequest, NextResponse } from 'next/server'
import { exigirSesionFacturas } from '@/lib/sivra/facturas/acceso'
import { listarBorradores, listarEmitidas, listarSolicitudesListas, pisosDeCuenta } from '@/lib/sivra/facturas/listado'
import { periodoDeQuery, rangoPeriodo } from '@/lib/sivra/facturas/periodos'
import { libroCsv, totalesLibro } from '@/lib/sivra/facturas/csv'
import { fechaMadrid, evaluarSerie } from '@/lib/sivra/facturas/numeracion'
import { serieDelAnio } from '@/lib/sivra/facturas/servicio'

export const dynamic = 'force-dynamic'

// GET /api/sivra/facturas?periodo=mes|trimestre|anio|personalizado&anio=&mes=&trimestre=&desde=&hasta=&piso=&formato=csv
// Libro de facturas a huéspedes del periodo (por fecha de expedición) + borradores pendientes + estado de la serie.
export async function GET(req: NextRequest) {
  const g = await exigirSesionFacturas()
  if (!g.ok) return g.respuesta
  const q = req.nextUrl.searchParams
  const periodo = periodoDeQuery(q)
  const rango = periodo ? rangoPeriodo(periodo) : null
  if (!rango) return NextResponse.json({ error: 'Periodo no válido' }, { status: 400 })
  const piso = q.get('piso') || null
  const emitidas = await listarEmitidas(g.cuentaId, rango.desde, rango.hasta, piso)
  if (q.get('formato') === 'csv') {
    return new NextResponse(libroCsv(emitidas), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="facturas-huespedes_${rango.desde}_${rango.hasta}.csv"`, 'cache-control': 'no-store' },
    })
  }
  const { anio } = fechaMadrid(new Date())
  const [borradores, solicitudesListas, pisos, serie] = await Promise.all([listarBorradores(g.cuentaId, piso), listarSolicitudesListas(g.cuentaId, piso), pisosDeCuenta(g.cuentaId), serieDelAnio(g.cuentaId, anio)])
  const est = evaluarSerie(serie, anio)
  return NextResponse.json({
    rango, emitidas, borradores, solicitudesListas,
    totales: totalesLibro(emitidas), pisos,
    serie: est.ok ? { ok: true, prefijo: est.serie.prefijo, anio, siguiente: est.serie.siguienteNumero, tipoIva: est.serie.tipoIva } : { ok: false, motivo: est.motivo },
  }, { headers: { 'cache-control': 'no-store' } })
}
