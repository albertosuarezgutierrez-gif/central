import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { proponerEmailsVertical } from '@/lib/lead-hunter-sevilla'

// Tanda diaria de presentaciones a RESTAURANTES/BARES (nacional). Margen para ~15 envíos.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const supabase = createServerClient()
  // Hasta 15 presentaciones de restaurantes/bares (España) por día laborable.
  // Envío automático y silencioso — solo avisan los errores (CRM_ENVIO_AUTO='0'
  // = modo aprobación). Parte del volumen total de ~40/día elegido por Alberto.
  const result = await proponerEmailsVertical(supabase, 'restaurante', 15)
  return NextResponse.json({ ...result, timestamp: new Date().toISOString() }, { status: result.ok ? 200 : 500 })
}
