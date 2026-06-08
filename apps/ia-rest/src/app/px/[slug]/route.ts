// src/app/px/[slug]/route.ts
// v1 — pixel 1x1 de apertura de email + aviso Telegram (orientativo)
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServerClient()
  const ua = req.headers.get('user-agent') || ''
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida'

  const { data: link } = await supabase
    .from('outreach_links').select('slug, label').eq('slug', slug).maybeSingle()

  if (link) {
    await supabase.from('outreach_events').insert({ slug, tipo: 'open', ip, user_agent: ua })
    await tgAlert(
      `📬 Email abierto (orientativo)\n\nCampaña: ${link.label}\nIP: ${ip}`,
      'info'
    )
  }

  return new NextResponse(new Uint8Array(PIXEL), {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
    },
  })
}
