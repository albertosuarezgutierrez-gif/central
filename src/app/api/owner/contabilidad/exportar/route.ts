export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { exportarA3, exportarSage, exportarHolded, exportarCSV } from '@/lib/contabilidad'

/**
 * POST /api/owner/contabilidad/exportar
 * Body: { formato: 'a3'|'sage'|'holded'|'csv'|'json', desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD' }
 * Genera el fichero de exportación contable en el formato indicado.
 */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { formato = 'csv', desde, hasta } = await req.json()

  if (!desde || !hasta) return NextResponse.json({ error: 'desde y hasta requeridos' }, { status: 400 })

  // Cargar asientos del período
  const { data: asientos, error } = await supabase
    .from('asientos_contables')
    .select('num_asiento, fecha, concepto, tipo, lineas')
    .eq('restaurante_id', rid)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: true })
    .order('num_asiento', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!asientos?.length) return NextResponse.json({ error: 'Sin asientos en el período seleccionado.' }, { status: 404 })

  const asientosExport = asientos.map(a => ({
    num_asiento: a.num_asiento,
    fecha: a.fecha,
    concepto: a.concepto,
    tipo: a.tipo,
    lineas: a.lineas as { cuenta: string; nombre_cuenta?: string; debe: number; haber: number; concepto?: string }[],
  }))

  const fechaHoy = new Date().toISOString().split('T')[0].replace(/-/g, '')

  let contenido: string
  let contentType: string
  let filename: string

  if (formato === 'a3') {
    const { data: cfg } = await supabase.from('config_contabilidad').select('ejercicio_actual').eq('restaurante_id', rid).maybeSingle()
    contenido   = exportarA3(asientosExport, '001', cfg?.ejercicio_actual ?? new Date().getFullYear())
    contentType = 'text/plain; charset=windows-1252'
    filename    = `SUENLACE_${fechaHoy}.DAT`
  } else if (formato === 'sage') {
    contenido   = exportarSage(asientosExport)
    contentType = 'text/csv; charset=utf-8'
    filename    = `sage_asientos_${fechaHoy}.csv`
  } else if (formato === 'holded') {
    contenido   = exportarHolded(asientosExport)
    contentType = 'text/csv; charset=utf-8'
    filename    = `holded_asientos_${fechaHoy}.csv`
  } else if (formato === 'json') {
    contenido   = JSON.stringify({ asientos: asientosExport, periodo: { desde, hasta } }, null, 2)
    contentType = 'application/json; charset=utf-8'
    filename    = `contabilidad_${fechaHoy}.json`
  } else {
    contenido   = exportarCSV(asientosExport)
    contentType = 'text/csv; charset=utf-8'
    filename    = `asientos_${fechaHoy}.csv`
  }

  // Log exportación
  await supabase.from('exportaciones_contables').insert({
    restaurante_id: rid,
    formato,
    periodo_desde: desde,
    periodo_hasta: hasta,
    num_asientos: asientosExport.length,
    fichero_nombre: filename,
    exportado_por: session.id ?? null,
  })

  // Marcar asientos como exportados
  await supabase.from('asientos_contables')
    .update({ estado: 'exportado', exportado_at: new Date().toISOString() })
    .eq('restaurante_id', rid)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .eq('estado', 'confirmado')

  return new NextResponse(contenido, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Asientos': String(asientosExport.length),
    },
  })
}
