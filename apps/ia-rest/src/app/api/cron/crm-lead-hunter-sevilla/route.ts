import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { enviarEmailsSevilla } from '@/lib/lead-hunter-sevilla'

// Margen para enviar la tanda diaria (hasta ~10 emails seguidos vía Resend).
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const supabase = createServerClient()
  // Hasta 12 propuestas de email NO-móvil por día laborable (cron 10:00 España). Ya no
  // se auto-envía: se PROPONE en Telegram y Alberto aprueba. El botón manual prepara 20.
  const result = await enviarEmailsSevilla(supabase, 12)
  return NextResponse.json({ ...result, timestamp: new Date().toISOString() }, { status: result.ok ? 200 : 500 })
}
