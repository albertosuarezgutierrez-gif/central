// GET /api/qr/connect/callback — Stripe Connect OAuth callback
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const restaurante_id = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !restaurante_id) {
    return NextResponse.redirect(new URL('/owner?qr=connect_error', req.url))
  }

  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/qr-connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ action: 'oauth_callback', code, restaurante_id }),
    })

    const data = await res.json()
    if (!data.ok) throw new Error(data.error)

    return NextResponse.redirect(new URL('/owner?qr=connect_ok', req.url))
  } catch (e) {
    console.error('Stripe Connect callback error:', e)
    return NextResponse.redirect(new URL('/owner?qr=connect_error', req.url))
  }
}
