import { NextResponse } from 'next/server'
import { verificarTraspaso, envSecretoTraspaso } from '@central/core-herramientas/traspaso'
import { leerSecreto } from '@/lib/secretos'
import { repoAccesoBd, empresasDeUsuarioBd, consumirTraspasoBd } from '@/lib/db'
import { COOKIE_NAME, cookieOpts, emitirCookie } from '@/lib/sesion-cookie'

// Entrada desde «Mi empresa»: token HS256 de un solo uso (aud=contabilidad, secreto PROPIO de esta app). El token no autoriza:
// se consume el jti (un solo uso), se busca al usuario por su correo VERIFICADO y se exige SU vínculo con esa empresa.
export const dynamic = 'force-dynamic'

const fallo = (req: Request, motivo: string) => NextResponse.redirect(new URL(`/login?traspaso=${encodeURIComponent(motivo)}`, req.url), 303)

export async function POST(req: Request) {
  const secreto = leerSecreto(envSecretoTraspaso('contabilidad'))
  if (!secreto) return fallo(req, 'no_configurado')
  const form = await req.formData().catch(() => null)
  const r = await verificarTraspaso(form?.get('token'), 'contabilidad', secreto)
  if (!r.ok) return fallo(req, r.error)
  if (!(await consumirTraspasoBd(r.carga.jti, new Date(r.carga.exp * 1000)))) return fallo(req, 'usado')
  const u = await repoAccesoBd.usuarioPorEmail(r.carga.email)
  if (!u) return fallo(req, 'sin_acceso')
  const empresas = await empresasDeUsuarioBd(u.id)
  if (!empresas.some((e) => e.empresaId.toLowerCase() === r.carga.ref)) return fallo(req, 'sin_acceso')
  const res = NextResponse.redirect(new URL('/', req.url), 303)
  res.cookies.set(COOKIE_NAME, await emitirCookie({ u: u.id, e: r.carga.ref, sv: u.sv }, new Date()), cookieOpts())
  return res
}
