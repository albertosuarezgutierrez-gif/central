import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { proponerEmailsVertical } from '@/lib/lead-hunter-sevilla'

// Tanda diaria de presentaciones de CATERING (nacional). Margen para ~10 envíos.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const supabase = createServerClient()
  // Hasta 15 presentaciones de catering (España) por día laborable. Desde el
  // 03/07/2026 se ENVÍAN automáticamente (mensaje tipo genérico); desde el
  // 05/08/2026 sin resumen Telegram — solo avisan los errores.
  // CRM_ENVIO_AUTO='0' vuelve al modo aprobación con botón.
  // Volumen total elegido por Alberto: ~40/día (15 catering + 15 restaurantes
  // + 12 Sevilla), muy por debajo del plan gratis de Resend (100/día, 3.000/mes)
  // para cuidar la reputación de hola@iarest.es.
  const result = await proponerEmailsVertical(supabase, 'catering', 15)
  return NextResponse.json({ ...result, timestamp: new Date().toISOString() }, { status: result.ok ? 200 : 500 })
}
