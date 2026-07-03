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
  // Hasta 10 presentaciones de catering (España) por día laborable. Desde el
  // 03/07/2026 se ENVÍAN automáticamente (plantilla tipo + resumen Telegram);
  // CRM_ENVIO_AUTO='0' vuelve al modo aprobación con botón. El goteo de 10/día
  // sigue cuidando la reputación de hola@iarest.es.
  const result = await proponerEmailsVertical(supabase, 'catering', 10)
  return NextResponse.json({ ...result, timestamp: new Date().toISOString() }, { status: result.ok ? 200 : 500 })
}
