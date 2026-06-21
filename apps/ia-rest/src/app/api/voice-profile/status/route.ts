export const dynamic = 'force-dynamic'

/**
 * GET /api/voice-profile/status?camarero_id=xxx
 *
 * Devuelve el estado del perfil de voz del camarero.
 * Usado por el componente VoiceProfileSection en /edge para mostrar el badge.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const camareroId = req.nextUrl.searchParams.get('camarero_id')
    if (!camareroId) {
      return NextResponse.json({ error: 'camarero_id requerido' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { data } = await supabase
      .from('voice_profiles')
      .select('estado, frases_completadas, segundos_enrollados, ultimo_score, ultimo_score_at, error_msg')
      .eq('camarero_id', camareroId)
      .maybeSingle()

    if (!data) {
      return NextResponse.json({
        estado:             'sin_calibrar',
        frases_completadas: 0,
        segundos_enrollados: 0,
        ultimo_score:       null,
      })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[VOICE-STATUS]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
