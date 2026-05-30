// src/app/ir/[slug]/route.ts
// v1 — redirección con tracking de click + aviso Telegram
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

// Escáneres / proxies corporativos: registramos pero NO avisamos (evita falsos positivos)
const BOT_UA = /bot|crawl|spider|preview|scan|proxy|monitor|slurp|facebookexternalhit|whatsapp|telegrambot|googleimageproxy|mimecast|proofpoint|barracuda|safelinks|urldefense/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServerClient()

  const ua = req.headers.get('user-agent') || ''
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida'
  const referer = req.headers.get('referer') || ''

  const { data: link } = await supabase
    .from('outreach_links')
    .select('slug, label, destino_url')
    .eq('slug', slug)
    .maybeSingle()

  const destino = link?.destino_url || 'https://www.iarest.es'

  if (link) {
    await supabase.from('outreach_events').insert({
      slug, tipo: 'click', ip, user_agent: ua, referer,
    })

    if (!BOT_UA.test(ua)) {
      await tgAlert(
        `👀 Han pinchado el enlace\n\n` +
        `Campaña: ${link.label}\n` +
        `IP: ${ip}\n` +
        `Dispositivo: ${ua.slice(0, 140) || 'desconocido'}\n` +
        `→ ${destino}`,
        'aviso'
      )
    }
  }

  return NextResponse.redirect(destino, 302)
}
