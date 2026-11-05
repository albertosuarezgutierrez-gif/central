import { NextResponse } from 'next/server'
import { libroRegistroIva, rangoDeModelo, type PeriodoModelo } from '@central/module-contabilidad'
import { leerContexto } from '@/lib/contexto'
import { cargarDatosFiscales } from '@/lib/impuestos-carga'
import { tablaLibroIva, tablaResumenLibroIva } from '@/lib/impuestos-tablas'
import { aCsv, aHtmlImprimible } from '@/lib/informes/exportar'
import { aXlsx, type ModuloXlsx } from '@/lib/informes/exportar-xlsx'
import { conRepo } from '@/lib/db'
import { paletaEmpresa, SELLO } from '@/lib/marca'

// GET /api/impuestos/libros?sentido=emitidas|recibidas&anio=2026&periodo=1T|2T|3T|4T|0A&vista=libro|resumen&formato=csv|xlsx|html
// Libros registro de IVA (borrador) construidos desde los hechos asentados no rectificados. Solo la empresa de la sesión (RLS).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const sentido = q.get('sentido') === 'recibidas' ? 'recibida' : q.get('sentido') === 'emitidas' ? 'emitida' : null
  const anio = Number(q.get('anio'))
  const periodo = q.get('periodo') ?? ''
  const formato = q.get('formato') ?? 'csv'
  if (!sentido || !Number.isInteger(anio) || anio < 2000 || anio > 2200 || !['1T', '2T', '3T', '4T', '0A'].includes(periodo) || !['csv', 'xlsx', 'html'].includes(formato)) {
    return NextResponse.json({ error: 'parametros_no_validos', errores: ['sentido, anio, periodo (1T-4T/0A) y formato (csv|xlsx|html)'] }, { status: 400 })
  }
  const rango = rangoDeModelo(anio, periodo as PeriodoModelo)
  const { datos, truncado } = await cargarDatosFiscales(c.empresaId, rango.desde, rango.hasta)
  const libro = libroRegistroIva(datos.ops, sentido, rango)
  const titulo = `Libro registro de IVA — facturas ${sentido === 'emitida' ? 'emitidas' : 'recibidas'} ${periodo} ${anio}`
  const tabla = q.get('vista') === 'resumen' ? tablaResumenLibroIva(libro, titulo) : tablaLibroIva(libro, titulo, datos.refAAsiento)
  if (truncado) tabla.avisos.push('Hay más hechos de los que se pueden leer de una vez: el libro está incompleto')
  const hoy = new Date()
  const nombre = `${tabla.clave}-${anio}-${periodo}`
  const cab = { 'cache-control': 'no-store' }
  if (formato === 'html') {
    const empresa = await conRepo(c.empresaId, (r) => r.empresa())
    return new Response(aHtmlImprimible(tabla, { nombre: empresa?.razonSocial ?? 'Contabilidad', color: paletaEmpresa(empresa?.colorPrimario)?.brand ?? null, sello: SELLO }, hoy.toISOString().slice(0, 10)), { headers: { ...cab, 'content-type': 'text/html; charset=utf-8' } })
  }
  if (formato === 'csv') return new Response(aCsv(tabla), { headers: { ...cab, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${nombre}.csv"` } })
  const XLSX = (await import('xlsx')) as unknown as ModuloXlsx
  return new Response(Buffer.from(aXlsx(tabla, XLSX)), { headers: { ...cab, 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${nombre}.xlsx"` } })
}
