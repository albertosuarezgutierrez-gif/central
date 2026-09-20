import { NextRequest, NextResponse } from 'next/server'
import { esTokenBajaValido } from '@/lib/recaptacion-baja'
import { aplicarBajaEmail } from '@/lib/cartera-recaptacion'

export const dynamic = 'force-dynamic'

// GET /api/publico/recaptacion/baja?t=<recaptacion_envios.id> — sin sesión, a
// propósito: lo abre el propio cliente desde el correo (LSSI art. 21, baja de
// un solo clic). Está en `PUBLIC` de `middleware.ts`. Responde HTML, no JSON:
// quien lo abre es una persona en un navegador, no un llamador programático.
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t')
  if (!esTokenBajaValido(t)) return pagina('El enlace no es válido.', 400)

  const r = await aplicarBajaEmail(t)
  if (r.estado === 'ok') return pagina('Hecho: no volverás a recibir estos correos.', 200)
  if (r.estado === 'no_encontrado') return pagina('El enlace no es válido.', 404)
  return pagina('No se ha podido procesar la baja. Vuelve a intentarlo en unos minutos.', 500)
}

function pagina(mensaje: string, status: number): NextResponse {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Baja</title>` +
    `<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 16px;color:#111}</style>` +
    `</head><body><p>${escaparHtml(mensaje)}</p></body></html>`
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
