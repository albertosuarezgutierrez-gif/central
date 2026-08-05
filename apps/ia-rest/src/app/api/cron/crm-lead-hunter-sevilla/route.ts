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
  // Hasta 12 emails fríos de Sevilla por día laborable (cron 10:00 España), envío
  // automático y silencioso — solo avisan los errores. Incluye también a los leads
  // con móvil (el carril WhatsApp manual se retiró el 05/08/2026).
  const result = await enviarEmailsSevilla(supabase, 12)
  return NextResponse.json({ ...result, timestamp: new Date().toISOString() }, { status: result.ok ? 200 : 500 })
}
