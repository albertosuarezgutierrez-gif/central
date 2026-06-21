import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { runQA } from '@/lib/qa-runner'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()
  const runId = new URL(req.url).searchParams.get('run_id')

  if (runId) {
    const { data: checks } = await supabase.from('qa_checks').select('*')
      .eq('run_id', runId).order('created_at', { ascending: true })
    return NextResponse.json({ checks: checks ?? [] })
  }

  const { data: runs } = await supabase.from('qa_runs').select(
    'id,trigger,modo,total,ok,warnings,fallidos,criticos,regresiones,auto_fixes,score,duracion_ms,informe_ia,telegram_enviado,created_at'
  ).order('created_at', { ascending: false }).limit(30)

  const { data: tendencias } = await supabase.from('qa_tendencias')
    .select('metrica,valor,created_at').order('created_at', { ascending: false }).limit(100)

  return NextResponse.json({ runs: runs ?? [], tendencias: tendencias ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const trigger: string = body.trigger ?? 'manual'

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch {}
      }
      send({ tipo: 'inicio', trigger })
      const result = await runQA(
        trigger,
        (c) => send({ tipo: 'check', ...c }),
        (cat) => send({ tipo: 'categoria', nombre: cat })
      )
      send({ tipo: 'totales', ...result })
      send({ tipo: 'fin', run_id: result.run_id, score: result.score, duracion_ms: result.duracion_ms })
      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    }
  })
}
