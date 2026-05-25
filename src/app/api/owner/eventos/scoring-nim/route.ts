import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAI, cleanJSON } from '@/lib/ai-client'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const evento_id = new URL(req.url).searchParams.get('evento_id')
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  // Recopilar datos del evento
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
      .eq('evento_id', evento_id).eq('restaurante_id', restauranteId),
    supabase.from('evento_costes').select('tipo, descripcion, importe, origen').eq('evento_id', evento_id),
    supabase.from('evento_pases').select('numero_pase, nombre, estado, hora_prevista, hora_real, comensales').eq('evento_id', evento_id),
  ])

  // Calcular métricas APPCC
  const testigos = appcc?.filter(a => a.tipo_registro === 'plato_testigo') ?? []
  const temperaturas = appcc?.filter(a => a.tipo_registro.startsWith('temperatura_')) ?? []
  const tempOk = temperaturas.filter(a => a.cumple === true).length
  const tempKo = temperaturas.filter(a => a.cumple === false).length

  // Comisiones proveedores
  const comisionTotal = (comisiones ?? []).reduce((s, c) => s + (c.comision_importe ?? 0), 0)
  const comisionCobrada = (comisiones ?? []).filter(c => c.estado === 'comision_cobrada').reduce((s, c) => s + (c.comision_importe ?? 0), 0)

  // Costes adicionales
  const costeExtra = (costes ?? []).reduce((s, c) => s + (c.importe ?? 0), 0)

  // Pases KDS
  const pasesServidos = (pases ?? []).filter(p => p.estado === 'servido').length
  const tiemposPases = (pases ?? [])
    .filter(p => p.hora_prevista && p.hora_real)
    .map(p => {
      const prev = p.hora_prevista?.split(':').map(Number) ?? [0, 0]
      const real = p.hora_real?.split(':').map(Number) ?? [0, 0]
      const diffMin = (real[0] * 60 + real[1]) - (prev[0] * 60 + prev[1])
      return { pase: p.nombre, desvio_min: diffMin }
    })

  if (!rentabilidad) {
    return NextResponse.json({
      scoring: null,
      appcc: { testigos: testigos.length, temp_ok: tempOk, temp_ko: tempKo },
      comisiones: { total: comisionTotal, cobradas: comisionCobrada },
      mensaje: 'Sin datos de rentabilidad para este evento',
    })
  }

  // Generar análisis NIM
  const r = rentabilidad
  const prompt = `Eres consultor de catering y eventos. Analiza este evento y genera scoring ejecutivo.

EVENTO: ${r.cliente_nombre} (${r.tipo}) — ${new Date(r.fecha_evento).toLocaleDateString('es-ES')}
AFORO: ${r.aforo_previsto} previsto / ${r.aforo_real ?? 'sin confirmar'} real

FINANCIERO:
- Ingresos presupuestados: ${r.ingresos_presupuestados ?? 0}€
- Ingresos reales: ${r.ingresos_reales ?? 0}€
- Coste ingredientes: ${r.coste_ingredientes ?? 0}€
- Coste personal: ${r.coste_personal ?? 0}€
- Coste espacio: ${r.coste_espacio ?? 0}€
- Costes extra registrados: ${costeExtra}€
- Margen bruto: ${r.margen_bruto ?? 0}€ (${r.margen_pct ?? 0}%)
- Comisiones proveedores pendientes: ${(comisionTotal - comisionCobrada).toFixed(2)}€

APPCC:
- Platos testigo: ${testigos.length}
- Temperaturas correctas: ${tempOk} / incorrectas: ${tempKo}

OPERATIVO (pases KDS):
- Pases servidos: ${pasesServidos} / ${pases?.length ?? 0}
${tiemposPases.slice(0,3).map(t => `- ${t.pase}: ${t.desvio_min > 0 ? '+' : ''}${t.desvio_min}min`).join('\n')}

Responde SOLO con JSON, sin texto adicional:
{
  "puntuacion": <número 1-10>,
  "resumen": "<2-3 frases análisis ejecutivo>",
  "puntos_fuertes": ["<punto>", "<punto>"],
  "puntos_mejora": ["<punto>", "<punto>"],
  "recomendaciones_precio": "<1 frase sobre pricing futuro>",
  "alerta_appcc": <true si tempKo>0 o testigos<2>
}`

  let analisis = { puntuacion: 0, resumen: '', puntos_fuertes: [], puntos_mejora: [], recomendaciones_precio: '', alerta_appcc: false }
  try {
    const resp = await callAI('Eres experto en rentabilidad de catering. Responde SOLO con JSON.', prompt, 350, 12_000)
    analisis = JSON.parse(cleanJSON(resp))
  } catch (e) {
    console.error('NIM scoring error:', e)
  }

  return NextResponse.json({
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
    pases: { total: pases?.length ?? 0, servidos: pasesServidos, tiempos: tiemposPases },
  })
}
