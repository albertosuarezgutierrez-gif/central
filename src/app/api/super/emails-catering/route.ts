export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { proponerEmailsVertical } from '@/lib/lead-hunter-sevilla'

// POST → prepara emails de presentación a CATERING a nivel nacional (a aprobar en Telegram).
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const supabase = createServerClient()
  const result = await proponerEmailsVertical(supabase, 'catering', 20)
  return NextResponse.json(result)
}
