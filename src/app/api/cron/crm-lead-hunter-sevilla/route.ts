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
  // 10 emails fríos por día laborable (cron 10:00 España). Ramp prudente: iarest.es
  // también manda transaccional (facturas/portales), así que no quemamos su reputación
  // con frío masivo. El botón manual sigue en 3. Subir solo si la entregabilidad va bien.
  const result = await enviarEmailsSevilla(supabase, 10)
  return NextResponse.json({ ...result, timestamp: new Date().toISOString() }, { status: result.ok ? 200 : 500 })
}
