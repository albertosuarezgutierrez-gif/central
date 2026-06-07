import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import QRCode from 'qrcode'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return new NextResponse('No autorizado', { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data: web } = await supabase
    .from('web_restaurante')
    .select('slug, color_acento')
    .eq('local_id', restauranteId)
    .maybeSingle()

  if (!web?.slug) return new NextResponse('Web no configurada', { status: 404 })

  const url = `https://www.iarest.es/r/${web.slug}`
  const acento = web.color_acento ?? '#D9442B'

  // Generar QR como PNG en buffer
  const buffer = await QRCode.toBuffer(url, {
    type: 'png',
    width: 400,
    margin: 3,
    color: {
      dark: '#1A1714',
      light: '#FAF7F2',
    },
    errorCorrectionLevel: 'H',
  })

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="qr-web-${web.slug}.png"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
