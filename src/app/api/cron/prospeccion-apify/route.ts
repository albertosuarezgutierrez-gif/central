export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { avanzarProspeccionApify } from '@/lib/prospeccion-apify'

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const supabase = createServerClient()
  const result = await avanzarProspeccionApify(supabase)
  return NextResponse.json(result)
}
