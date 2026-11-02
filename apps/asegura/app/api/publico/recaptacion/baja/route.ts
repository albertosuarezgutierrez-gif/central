import { NextRequest, NextResponse } from 'next/server'
import { esTokenBajaValido } from '@/lib/recaptacion-baja'
import { aplicarBajaEmail } from '@/lib/cartera-recaptacion'
import { esConfirmacionDeFormulario, paginaConfirmarBaja, paginaMensajeBaja } from '@/lib/pagina-baja'

export const dynamic = 'force-dynamic'

// /api/publico/recaptacion/baja?t=<recaptacion_envios.id> — sin sesión, a propósito: lo abre el propio
// cliente desde el correo (LSSI art. 21). Está en `PUBLIC` de `middleware.ts`. Responde HTML.
//  · GET: SOLO muestra la confirmación (botón → POST). Los escáneres de correo abren los enlaces y
//    daban de baja por GET. No toca la BD.
//  · POST: ejecuta la baja (botón de la página, `confirmar=1`, responde HTML; o un one-click RFC 8058,
//    sin cuerpo útil, que responde sin cuerpo).
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t')
  if (!esTokenBajaValido(t)) return pagina('El enlace no es válido.', 400)
  const accion = `${req.nextUrl.pathname}?t=${encodeURIComponent(t.trim())}`
  return html(paginaConfirmarBaja(accion, '¿Quieres dejar de recibir estos correos?'), 200)
}

export async function POST(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t')
  const desdeFormulario = esConfirmacionDeFormulario(await req.text().catch(() => ''))
  if (!esTokenBajaValido(t)) return desdeFormulario ? pagina('El enlace no es válido.', 400) : new NextResponse(null, { status: 400 })
  const r = await aplicarBajaEmail(t)
  if (desdeFormulario) {
    if (r.estado === 'ok') return pagina('Hecho: no volverás a recibir estos correos.', 200)
    if (r.estado === 'no_encontrado') return pagina('El enlace no es válido.', 404)
    return pagina('No se ha podido procesar la baja. Vuelve a intentarlo en unos minutos.', 500)
  }
  return new NextResponse(null, { status: r.estado === 'ok' ? 200 : r.estado === 'no_encontrado' ? 404 : 500 })
}

function html(cuerpo: string, status: number): NextResponse {
  return new NextResponse(cuerpo, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function pagina(mensaje: string, status: number): NextResponse {
  return html(paginaMensajeBaja(mensaje), status)
}
