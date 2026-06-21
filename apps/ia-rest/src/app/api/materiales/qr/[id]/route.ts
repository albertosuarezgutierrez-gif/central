export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import QRCode from 'qrcode'

// GET /api/materiales/qr/[id]
// id = codigo_qr (URL-encoded)
// Devuelve SVG del QR listo para imprimir.
// Query param: ?size=200 (px, default 200, max 600)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const codigoQr = decodeURIComponent(id)
  const url = new URL(req.url)
  const size = Math.min(600, Math.max(100, Number(url.searchParams.get('size') ?? 200)))

  const svgString = await QRCode.toString(codigoQr, {
    type: 'svg',
    width: size,
    margin: 2,
    color: { dark: '#1a1a1a', light: '#ffffff' },
  })

  return new NextResponse(svgString, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
