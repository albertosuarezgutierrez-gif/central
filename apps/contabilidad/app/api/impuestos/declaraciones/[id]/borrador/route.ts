import { NextResponse } from 'next/server'
import { borradorCsv, borradorHtml, type CalculoModelo } from '@central/module-contabilidad'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'
import { esUuid } from '@/lib/rls'
import { conF4 } from '@/lib/impuestos-carga'
import { extrasDeSnapshot } from '@/lib/impuestos-tablas'

// GET /api/impuestos/declaraciones/<id>/borrador?formato=html|csv — descarga el BORRADOR guardado (el snapshot que se revisó), con la marca
// «diseño oficial pendiente de contrastar». No es un fichero de presentación y no tiene validez ante la AEAT.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'id_invalido' }, { status: 400 })
  const formato = new URL(req.url).searchParams.get('formato') ?? 'html'
  if (formato !== 'html' && formato !== 'csv') return NextResponse.json({ error: 'formato: html | csv' }, { status: 400 })
  const d = await conF4(c.empresaId, (f4) => f4.declaracion(id)).catch(() => null)
  if (!d || d.calculo == null) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })
  const snap = d.calculo as CalculoModelo & Record<string, unknown>
  const empresa = await conRepo(c.empresaId, (r) => r.empresa())
  const hoy = new Date().toISOString().slice(0, 10)
  const nombre = `borrador-modelo-${d.modelo}-${d.anio}-${d.periodo}-v${d.version}`
  const cab = { 'cache-control': 'no-store' }
  if (formato === 'csv') return new Response(borradorCsv(snap), { headers: { ...cab, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${nombre}.csv"` } })
  const html = borradorHtml(snap, { empresa: empresa?.razonSocial ?? 'Empresa', ...(empresa?.nif ? { nif: empresa.nif } : {}), generado: hoy, extras: extrasDeSnapshot(snap) })
  return new Response(html, { headers: { ...cab, 'content-type': 'text/html; charset=utf-8' } })
}
