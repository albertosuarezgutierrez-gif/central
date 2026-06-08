import { NextRequest, NextResponse } from 'next/server'
import { getRestauranteId } from '@/lib/session'

export async function POST(req: NextRequest) {
  const rid = getRestauranteId(req)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.iarest.es'
  const clientId = process.env.STRIPE_CLIENT_ID || ''
  if (!clientId) return NextResponse.json({ error: 'STRIPE_CLIENT_ID no configurado' }, { status: 500 })
  const url = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${clientId}&scope=read_write&redirect_uri=${appUrl}/api/qr/connect/callback&state=${rid}`
  return NextResponse.json({ url })
}
