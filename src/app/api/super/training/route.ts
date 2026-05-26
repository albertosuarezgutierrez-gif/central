import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

function superAuth(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return false
  return true
}

// GET /api/super/training?formato=alpaca|sharegpt|stats&calidad_min=3&limit=5000
export async function GET(req: NextRequest) {
  if (!superAuth(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const formato = searchParams.get('formato') ?? 'stats'
  const calidadMin = parseInt(searchParams.get('calidad_min') ?? '3')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '5000'), 50000)

  if (formato === 'stats') {
    const [total, porModelo, porCalidad, corregidos, ultimos7d] = await Promise.all([
      supabase.from('ia_training_log').select('id', { count: 'exact', head: true }),
      supabase.from('ia_training_log').select('modelo_usado').not('modelo_usado', 'is', null),
      supabase.from('ia_training_log').select('calidad').not('calidad', 'is', null),
      supabase.from('ia_training_log').select('id', { count: 'exact', head: true }).eq('fue_corregido', true),
      supabase.from('ia_training_log').select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    ])

    const modelos: Record<string, number> = {}
    for (const r of (porModelo.data ?? [])) {
      const m = (r.modelo_usado as string) ?? 'desconocido'
      modelos[m] = (modelos[m] ?? 0) + 1
    }

    const calidades: Record<number, number> = {}
    for (const r of (porCalidad.data ?? [])) {
      const c = (r.calidad as number) ?? 0
      calidades[c] = (calidades[c] ?? 0) + 1
    }

    const { count: exportables } = await supabase
      .from('ia_training_log')
      .select('id', { count: 'exact', head: true })
      .gte('calidad', calidadMin)
      .not('output_brain', 'is', null)
      .not('input_raw', 'is', null)

    return NextResponse.json({
      total: total.count ?? 0,
      ultimos_7d: ultimos7d.count ?? 0,
      corregidos: corregidos.count ?? 0,
      exportables_calidad_min: exportables ?? 0,
      pct_exportable: total.count ? Math.round(((exportables ?? 0) / total.count) * 100) : 0,
      por_modelo: modelos,
      distribucion_calidad: calidades,
      velocidad_acumulacion: total.count
        ? `~${Math.round((total.count / 17))} comandas/día`
        : '0',
    })
  }

  // Exportar ejemplos
  const { data: ejemplos } = await supabase
    .from('ia_training_log')
    .select('input_raw, output_brain, fue_corregido, correccion, calidad, modelo_usado, created_at')
    .gte('calidad', calidadMin)
    .not('output_brain', 'is', null)
    .not('input_raw', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!ejemplos?.length) return NextResponse.json({ error: 'Sin datos' }, { status: 404 })

  if (formato === 'alpaca') {
    const INSTRUCTION = `Eres el sistema de interpretación de comandas de voz de ia.rest para hostelería española.\nEl camarero habla y tú interpretas su comanda devolviendo JSON estructurado.\nVocabulario hostelero: "marchar" = preparar/enviar a cocina, "86" = sin existencias, "media" = ración media,\n"tapa" = ración pequeña, "la cuenta" = cobrar mesa, sin = sin ese ingrediente.`

    const dataset = ejemplos.map(e => {
      const output = e.fue_corregido && e.correccion ? e.correccion : e.output_brain
      const { raw, latencia_brain_ms, fuente, necesita_clarificacion, opciones_clarificacion, pregunta_clarificacion, ...outputClean } = output as Record<string, unknown>
      return {
        instruction: INSTRUCTION,
        input: (e.input_raw as string).trim(),
        output: JSON.stringify(outputClean),
      }
    })

    return new NextResponse(dataset.map(d => JSON.stringify(d)).join('\n'), {
      headers: {
        'Content-Type': 'application/jsonl',
        'Content-Disposition': `attachment; filename="iarest-brain-dataset-${new Date().toISOString().slice(0,10)}.jsonl"`,
      }
    })
  }

  if (formato === 'sharegpt') {
    const SYSTEM = `Eres brain de ia.rest, sistema de interpretación de comandas de voz para hostelería española. Responde siempre en JSON.`

    const dataset = ejemplos.map(e => {
      const output = e.fue_corregido && e.correccion ? e.correccion : e.output_brain
      const { raw, latencia_brain_ms, fuente, ...outputClean } = output as Record<string, unknown>
      return {
        conversations: [
          { from: 'system', value: SYSTEM },
          { from: 'human', value: (e.input_raw as string).trim() },
          { from: 'gpt', value: JSON.stringify(outputClean) },
        ]
      }
    })

    return new NextResponse(dataset.map(d => JSON.stringify(d)).join('\n'), {
      headers: {
        'Content-Type': 'application/jsonl',
        'Content-Disposition': `attachment; filename="iarest-brain-sharegpt-${new Date().toISOString().slice(0,10)}.jsonl"`,
      }
    })
  }

  return NextResponse.json({ error: 'formato no soportado. Usa: stats, alpaca, sharegpt' }, { status: 400 })
}

// POST /api/super/training — marcar corrección (también requiere super_admin)
export async function POST(req: NextRequest) {
  if (!superAuth(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const supabase = createServerClient()
  const { training_log_id, correccion_output } = await req.json()
  if (!training_log_id || !correccion_output) {
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  }

  await supabase
    .from('ia_training_log')
    .update({ fue_corregido: true, correccion: correccion_output, calidad: 5 })
    .eq('id', training_log_id)

  return NextResponse.json({ ok: true })
}
