import { NextRequest, NextResponse } from 'next/server'
import { esTokenBajaValido } from '@/lib/recaptacion-baja'
import { aplicarBajaCampana } from '@/lib/presentacion-app'
import { esConfirmacionDeFormulario, paginaConfirmarBaja, paginaMensajeBaja } from '@/lib/pagina-baja'

export const dynamic = 'force-dynamic'

// Baja de un correo de campaña (LSSI art. 21: baja sencilla y gratuita en cada comunicación comercial).
// `t` = `campana_envio.id`. Sin sesión, a propósito (está bajo `/api/publico`, PUBLIC en `middleware.ts`).
//  · GET: el enlace del pie del correo. SOLO muestra la confirmación (botón → POST): los escáneres de correo
//    abren los enlaces y daban de baja por GET. No toca la BD.
//  · POST: ejecuta la baja. Dos entradas: el botón de la página (`confirmar=1`, responde HTML) y el
//    «Cancelar suscripción» de Gmail/Yahoo (RFC 8058, `List-Unsubscribe-Post: One-Click`), que llega sin
//    cookies y responde 200 sin cuerpo.
// La baja es de la PERSONA (todas sus fichas con ese correo) y la respetan esta campaña y la recaptación.
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t')
  if (!esTokenBajaValido(t)) return pagina('El enlace no es válido.', 400)
  const accion = `${req.nextUrl.pathname}?t=${encodeURIComponent(t.trim())}`
  return html(paginaConfirmarBaja(accion, '¿Quieres dejar de recibir estos correos de Grupo ASegura?'), 200)
}

export async function POST(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t')
  const desdeFormulario = esConfirmacionDeFormulario(await req.text().catch(() => ''))
  if (!esTokenBajaValido(t)) return desdeFormulario ? pagina('El enlace no es válido.', 400) : new NextResponse(null, { status: 400 })
  const r = await aplicarBajaCampana(t.trim())
  if (desdeFormulario) {
    if (r.estado === 'ok') return pagina('Hecho: no volverás a recibir estos correos de Grupo ASegura.', 200)
    if (r.estado === 'no_encontrado') return pagina('El enlace no es válido.', 404)
    return pagina('No se ha podido procesar la baja. Vuelve a intentarlo en unos minutos o responde al correo con la palabra «baja».', 500)
  }
  return new NextResponse(null, { status: r.estado === 'ok' ? 200 : r.estado === 'no_encontrado' ? 404 : 500 })
}

function html(cuerpo: string, status: number): NextResponse {
  return new NextResponse(cuerpo, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function pagina(mensaje: string, status: number): NextResponse {
  return html(paginaMensajeBaja(mensaje), status)
}
