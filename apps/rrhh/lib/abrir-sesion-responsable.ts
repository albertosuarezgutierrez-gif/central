// Pegamento (con Prisma y Next) que comparten el canje del código y la contraseña opcional: a partir de UN responsable
// ya identificado, o abre la sesión (una empresa, o la última recordada si sigue autorizada) o devuelve el selector.
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { firmarSesion, firmarPendiente } from '@/lib/auth'
import { MAX_SESIONES_SIMULTANEAS } from '@/lib/sesion-responsable-vigencia'
import {
  COOKIE_SESION_RESPONSABLE, COOKIE_ULTIMA_EMPRESA, OPCIONES_COOKIE_ULTIMA_EMPRESA, empresaDeEntrada, leerCookie, opcionesCookieSesion,
} from '@/lib/sesion-responsable-reglas'

export const DESTINO_RESPONSABLE = '/admin'

/** Emite la sesión de `usuario_id` en `empresa_id` (un jti por dispositivo) y recuerda la empresa. */
export async function emitirSesionResponsable(
  res: NextResponse, usuario_id: string, empresa_id: string, recordar: boolean, reemplazaJti?: string,
): Promise<void> {
  const { token, jti } = await firmarSesion({ usuario_id, empresa_id, recordar })
  // Una sesión por DISPOSITIVO: se AÑADE el jti a la lista (máx. 5, cae el más antiguo) en vez de pisar el de los demás.
  // Cambio de empresa en el mismo dispositivo: `reemplazaJti` sale de la lista para no gastar plaza.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.usuarios_rrhh u SET session_jti = array_to_string(
      coalesce((SELECT array_agg(t.j ORDER BY t.n) FROM (
                  SELECT j, n, max(n) OVER () AS m
                  FROM unnest(string_to_array(coalesce(u.session_jti, ''), ',')) WITH ORDINALITY AS x(j, n)
                  WHERE j <> '' AND j <> ${reemplazaJti ?? ''}) t
                WHERE t.n > t.m - ${MAX_SESIONES_SIMULTANEAS - 1}), '{}'::text[]) || ARRAY[${jti}]::text[], ',')
    WHERE u.id = ${usuario_id}::uuid`)
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
