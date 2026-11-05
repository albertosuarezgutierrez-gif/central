import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'
import { generarInforme, parametrosDe } from '@/lib/informes/generar'
import { fuenteDeRepo } from '@/lib/informes/fuente'
import { aCsv, aHtmlImprimible } from '@/lib/informes/exportar'
import { aXlsx, type ModuloXlsx } from '@/lib/informes/exportar-xlsx'
import { paletaEmpresa, SELLO } from '@/lib/marca'

// GET /api/informes/<clave>?formato=csv|xlsx|html&desde=&hasta=&cuenta= — descarga de un informe del catálogo (lista blanca).
// Solo la empresa de la sesión (RLS + contexto revalidado en BD). `html` = documento imprimible (PDF desde el navegador).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ clave: string }> }) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { clave } = await params
  const url = new URL(req.url)
  const formato = url.searchParams.get('formato') ?? 'csv'
  if (!['csv', 'xlsx', 'html'].includes(formato)) return NextResponse.json({ error: 'formato: csv | xlsx | html' }, { status: 400 })
  const hoy = new Date()
  const sp = Object.fromEntries(url.searchParams.entries())
  const { tabla, empresa } = await conRepo(c.empresaId, async (repo) => ({
    tabla: await generarInforme(clave, parametrosDe(sp, hoy), fuenteDeRepo(repo)),
    empresa: await repo.empresa(),
  }), { timeout: 30_000 })
  if (!tabla) return NextResponse.json({ error: 'informe_desconocido' }, { status: 404 })
  const nombre = `informe-${tabla.clave}-${hoy.toISOString().slice(0, 10)}`
  const cab = { 'cache-control': 'no-store' }
  if (formato === 'html') {
    const html = aHtmlImprimible(tabla, { nombre: empresa?.razonSocial ?? 'Contabilidad', color: paletaEmpresa(empresa?.colorPrimario)?.brand ?? null, sello: SELLO }, hoy.toISOString().slice(0, 10))
    return new Response(html, { headers: { ...cab, 'content-type': 'text/html; charset=utf-8' } })
  }
  if (formato === 'csv') {
    return new Response(aCsv(tabla), { headers: { ...cab, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${nombre}.csv"` } })
  }
  const XLSX = (await import('xlsx')) as unknown as ModuloXlsx
  const bytes = aXlsx(tabla, XLSX)
  return new Response(Buffer.from(bytes), {
    headers: { ...cab, 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${nombre}.xlsx"` },
  })
}
