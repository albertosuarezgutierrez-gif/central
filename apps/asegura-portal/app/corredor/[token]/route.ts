import { NextResponse } from 'next/server'
import { COOKIE_NAME, COOKIE_OPTS_CORREDOR, crearSesionCorredor } from '@/lib/auth'
import { abrirVistaCorredor } from '@/lib/vista-corredor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * La puerta del CORREDOR: abre el portal como lo ve un cliente (08/09/2026).
 *
 * GET porque lo abre plataforma en una pestaña nueva y no hay formulario que
 * enviar. El token es de UN solo uso y de 10 minutos, así que la precarga de un
 * enlace lo gastaría — por eso plataforma lo abre con `window.open` y no lo
 * pinta como `<a href>` que un navegador pueda prefetchear.
 *
 * Un enlace que no vale responde con TEXTO y un código, no redirige a la puerta
 * de entrada: ahí Alberto vería la pantalla de pedir código y creería que la
 * vista de corredor «no existe».
 */
const TEXTOS: Record<Exclude<Awaited<ReturnType<typeof abrirVistaCorredor>>['estado'], 'ok'>, [number, string]> = {
  enlace_invalido: [404, 'Este enlace de vista de corredor no existe. Vuelve a la ficha en plataforma y genera otro.'],
  usado: [410, 'Este enlace ya se abrió una vez. Vuelve a la ficha en plataforma y genera otro.'],
  caducado: [410, 'Este enlace caducó (dura 10 minutos). Vuelve a la ficha en plataforma y genera otro.'],
  sin_identidad_corredor: [
    503,
    'Falta la identidad del corredor en la base de datos (migración 2026-09-08_portal_vista_corredor.sql sin aplicar).',
  ],
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const r = await abrirVistaCorredor(token)
  if (r.estado !== 'ok') {
    const [status, texto] = TEXTOS[r.estado]
    return new NextResponse(texto, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  const sesion = await crearSesionCorredor(r.clienteId)
  const res = NextResponse.redirect(new URL('/boveda', req.url), 303)
  res.cookies.set(COOKIE_NAME, sesion, COOKIE_OPTS_CORREDOR)
  return res
}
