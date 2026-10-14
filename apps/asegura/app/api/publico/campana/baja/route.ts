import { NextRequest, NextResponse } from 'next/server'
import { esTokenBajaValido } from '@/lib/recaptacion-baja'
import { aplicarBajaCampana } from '@/lib/presentacion-app'

export const dynamic = 'force-dynamic'

// Baja de un correo de campaña (LSSI art. 21: baja sencilla y gratuita en cada comunicación comercial).
// `t` = `campana_envio.id`. Sin sesión, a propósito (está bajo `/api/publico`, PUBLIC en `middleware.ts`).
//  · GET: el enlace del pie del correo. Responde HTML: lo abre una persona.
//  · POST: el «Cancelar suscripción» de Gmail/Yahoo (RFC 8058, `List-Unsubscribe-Post: One-Click`),
//    que llega sin cookies ni cuerpo útil. Responde 200 sin cuerpo.
// La baja es de la PERSONA (todas sus fichas con ese correo) y la respetan esta campaña y la recaptación.
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t')
  if (!esTokenBajaValido(t)) return pagina('El enlace no es válido.', 400)
  const r = await aplicarBajaCampana(t.trim())
  if (r.estado === 'ok') return pagina('Hecho: no volverás a recibir estos correos de Grupo ASegura.', 200)
  if (r.estado === 'no_encontrado') return pagina('El enlace no es válido.', 404)
  return pagina('No se ha podido procesar la baja. Vuelve a intentarlo en unos minutos o responde al correo con la palabra «baja».', 500)
}

export async function POST(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t')
  if (!esTokenBajaValido(t)) return new NextResponse(null, { status: 400 })
  const r = await aplicarBajaCampana(t.trim())
  return new NextResponse(null, { status: r.estado === 'ok' ? 200 : r.estado === 'no_encontrado' ? 404 : 500 })
}

function pagina(mensaje: string, status: number): NextResponse {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Baja</title>` +
    `<style>body{font-family:'Nunito Sans',system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 16px;color:#1b2340}</style>` +
    `</head><body><p>${escaparHtml(mensaje)}</p></body></html>`
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
