import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { enviarEmailsSevilla } from '@/lib/lead-hunter-sevilla'

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const supabase = createServerClient()
  const result = await enviarEmailsSevilla(supabase)
  return NextResponse.json({ ...result, timestamp: new Date().toISOString() }, { status: result.ok ? 200 : 500 })
}
