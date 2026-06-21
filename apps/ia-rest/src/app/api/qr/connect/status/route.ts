export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { data } = await supabase.from('restaurantes')
    .select('stripe_connect_account_id, stripe_connect_onboarded').eq('id', rid).single()
  return NextResponse.json({ conectado: !!data?.stripe_connect_onboarded, account_id: data?.stripe_connect_account_id || null })
}
