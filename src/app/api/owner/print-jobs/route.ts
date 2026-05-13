// src/app/api/owner/print-jobs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRestauranteId } from '@/lib/session'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const rid = getRestauranteId(req)
  const jobId = req.nextUrl.searchParams.get('job_id')

  let query = sb()
    .from('print_jobs')
    .select('id, status, seccion_id, created_at, sent_at, acked_at, attempts, error_msg, impresoras(nombre)')
    .eq('restaurante_id', rid)

  if (jobId) {
    query = query.eq('id', jobId).limit(1)
  } else {
    query = query.order('created_at', { ascending: false }).limit(30)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data })
}
