// Pegamento (con Prisma y Next) que comparten el canje del código y la contraseña opcional: a partir de UN responsable
// ya identificado, o abre la sesión (una empresa, o la última recordada si sigue autorizada) o devuelve el selector.
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { firmarSesion, firmarPendiente } from '@/lib/auth'
import {
  COOKIE_SESION_RESPONSABLE, COOKIE_ULTIMA_EMPRESA, OPCIONES_COOKIE_ULTIMA_EMPRESA, empresaDeEntrada, leerCookie, opcionesCookieSesion,
} from '@/lib/sesion-responsable-reglas'

export const DESTINO_RESPONSABLE = '/admin'

/** Emite la sesión de `usuario_id` en `empresa_id` (sesión única por jti) y recuerda la empresa. */
export async function emitirSesionResponsable(res: NextResponse, usuario_id: string, empresa_id: string, recordar: boolean): Promise<void> {
  const { token, jti } = await firmarSesion({ usuario_id, empresa_id, recordar })
  await prisma.$executeRaw(Prisma.sql`UPDATE rrhh.usuarios_rrhh SET session_jti = ${jti} WHERE id = ${usuario_id}::uuid`)
  res.cookies.set(COOKIE_SESION_RESPONSABLE, token, opcionesCookieSesion(recordar))
  res.cookies.set(COOKIE_ULTIMA_EMPRESA, empresa_id, OPCIONES_COOKIE_ULTIMA_EMPRESA)
}

export async function abrirSesionResponsable(
  req: Request, r: { usuario_id: string; empresas: { id: string; nombre: string }[] }, recordar: boolean,
): Promise<NextResponse> {
  const destino = empresaDeEntrada(r.empresas, leerCookie(req.headers.get('cookie'), COOKIE_ULTIMA_EMPRESA))
  if (!destino) {
    // Varias empresas y ninguna recordada (o ya no autorizada): selector de siempre, cookie «pendiente» de 5 min.
    const res = NextResponse.json({ ok: true, paso: 'elegir', empresas: r.empresas }, { headers: { 'Cache-Control': 'no-store' } })
    res.cookies.set('rrhh_pending', await firmarPendiente(r.usuario_id, recordar), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 300 })
    return res
  }
  const res = NextResponse.json({ ok: true, irA: DESTINO_RESPONSABLE }, { headers: { 'Cache-Control': 'no-store' } })
  await emitirSesionResponsable(res, r.usuario_id, destino, recordar)
  return res
}
