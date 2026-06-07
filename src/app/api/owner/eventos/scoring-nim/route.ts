import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI, cleanJSON } from '@/lib/ai-client'

// GET: devuelve scoring cacheado (o genera si ?recalcular=1)
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const evento_id = searchParams.get('evento_id')
  const recalcular = searchParams.get('recalcular') === '1'
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  // Si no forzamos recalculo, servir desde cache
  if (!recalcular) {
    const { data: cache } = await supabase
      .from('evento_scoring_cache')
      .select('scoring_json, generado_at')
      .eq('evento_id', evento_id)
      .single()
    if (cache) {
      return NextResponse.json({
        ...cache.scoring_json,
        _cache: true,
        _generado_at: cache.generado_at,
      })
    }
  }

  // Calcular scoring (puede tardar — se hace en background o bajo demanda)
  const [
    { data: rentabilidad },
    { data: appcc },
    { data: comisiones },
    { data: costes },
    { data: pases },
  ] = await Promise.all([
    supabase.from('v_rentabilidad_eventos').select('*').eq('evento_id', evento_id).maybeSingle(),
    supabase.from('evento_appcc').select('tipo_registro, valor, cumple, plato_testigo_plato').eq('evento_id', evento_id),
    supabase.from('proveedores_evento_asignaciones')
      .select('servicio_descripcion, importe, comision_pct, comision_importe, estado')
      .eq('evento_id', evento_id).eq('local_id', restauranteId),
    supabase.from('evento_costes').select('tipo, descripcion, importe').eq('evento_id', evento_id),
    supabase.from('evento_pases').select('numero_pase, nombre, estado, hora_prevista, hora_real').eq('evento_id', evento_id),
  ])

  const testigos = (appcc ?? []).filter(a => a.tipo_registro === 'plato_testigo')
  const tempOk = (appcc ?? []).filter(a => a.tipo_registro.startsWith('temp') && a.cumple === true).length
  const tempKo = (appcc ?? []).filter(a => a.tipo_registro.startsWith('temp') && a.cumple === false).length
  const comisionTotal = (comisiones ?? []).reduce((s, c) => s + (c.comision_importe ?? 0), 0)
  const comisionCobrada = (comisiones ?? []).filter(c => c.estado === 'comision_cobrada').reduce((s, c) => s + (c.comision_importe ?? 0), 0)
  const costeExtra = (costes ?? []).reduce((s, c) => s + (c.importe ?? 0), 0)
  const pasesServidos = (pases ?? []).filter(p => p.estado === 'servido').length

  if (!rentabilidad) {
    const result = {
      scoring: null,
      appcc: { testigos: testigos.length, temp_ok: tempOk, temp_ko: tempKo },
      comisiones: { total: comisionTotal, cobradas: comisionCobrada },
      mensaje: 'Sin datos de rentabilidad para este evento',
    }
    return NextResponse.json(result)
  }

  const r = rentabilidad
  const prompt = `Evento: ${r.cliente_nombre} (${r.tipo}) | ${r.aforo_previsto} pax
Ingresos presupuestados: ${r.ingresos_presupuestados ?? 0}€ | Reales: ${r.ingresos_reales ?? 0}€
Coste: ingredientes ${r.coste_ingredientes ?? 0}€ + personal ${r.coste_personal ?? 0}€ + extras ${costeExtra}€
Margen bruto: ${r.margen_bruto ?? 0}€ (${r.margen_pct ?? 0}%)
Comisiones pendientes: ${(comisionTotal - comisionCobrada).toFixed(0)}€
APPCC: ${testigos.length} testigos | temps OK:${tempOk} KO:${tempKo}
Pases servidos: ${pasesServidos}/${pases?.length ?? 0}
JSON requerido (sin texto extra): {"puntuacion":<1-10>,"resumen":"<2 frases>","puntos_fuertes":["<1>","<2>"],"puntos_mejora":["<1>","<2>"],"recomendaciones_precio":"<1 frase>","alerta_appcc":<bool>}`

  let analisis = { puntuacion: 0, resumen: '', puntos_fuertes: [] as string[], puntos_mejora: [] as string[], recomendaciones_precio: '', alerta_appcc: false }
  try {
    const resp = await callAI('Analista de rentabilidad catering. Responde SOLO JSON.', prompt, 300, 20_000)
    analisis = JSON.parse(cleanJSON(resp))
  } catch (e) {
    console.error('Scoring error:', e)
  }

  const result = {
    scoring: {
      ...analisis,
      financiero: {
        ingresos_presupuestados: r.ingresos_presupuestados,
        ingresos_reales: r.ingresos_reales,
        coste_total: (r.coste_total ?? 0) + costeExtra,
        margen_bruto: r.margen_bruto,
        margen_pct: r.margen_pct,
      },
    },
    appcc: { testigos: testigos.length, temp_ok: tempOk, temp_ko: tempKo },
    comisiones: { total: comisionTotal, cobradas: comisionCobrada, pendientes: comisionTotal - comisionCobrada },
    pases: { total: pases?.length ?? 0, servidos: pasesServidos },
  }

  // Guardar en cache
  await supabase.from('evento_scoring_cache').upsert({
    evento_id, restaurante_id: restauranteId,
    scoring_json: result, generado_at: new Date().toISOString(),
  })

  return NextResponse.json({ ...result, _cache: false, _generado_at: new Date().toISOString() })
}
