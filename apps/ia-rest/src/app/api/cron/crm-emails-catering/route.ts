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
  // Hasta 10 propuestas de catering (España) por día laborable. NO auto-envía:
  // se PROPONE en Telegram y Alberto aprueba con un toque. Goteo prudente para
  // cuidar la reputación de hola@iarest.es.
  const result = await proponerEmailsVertical(supabase, 'catering', 10)
  return NextResponse.json({ ...result, timestamp: new Date().toISOString() }, { status: result.ok ? 200 : 500 })
}
