export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { enviarEmailsSevilla } from '@/lib/lead-hunter-sevilla'

// POST → prepara una tanda de emails de venta de Sevilla a mano (hasta 20 no-móvil, a aprobar en Telegram).
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const supabase = createServerClient()
  const result = await enviarEmailsSevilla(supabase, 20)
  return NextResponse.json(result)
}
