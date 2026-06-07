export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { proponerInstagramCatering } from '@/lib/lead-hunter-sevilla'

// POST → prepara DMs de Instagram para caterings de Sevilla (a enviar a mano).
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const supabase = createServerClient()
  const result = await proponerInstagramCatering(supabase, 15)
  return NextResponse.json(result)
}
