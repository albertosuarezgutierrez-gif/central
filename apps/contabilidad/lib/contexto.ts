// Contexto de la petición: sesión firmada + REVALIDACIÓN EN BD (fail-closed). Lo usan todas las páginas y APIs internas.
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { COOKIE_NAME, leerCookie } from './sesion-cookie'
import { sesionVigenteBd, usuarioVigenteBd } from './db'

export type Contexto = { usuarioId: string; empresaId: string; rol: 'dueno' | 'gestor' }

/** null si no hay sesión, no hay empresa elegida o la BD ya no la respalda (baja, «Salir», acceso revocado). */
export async function leerContexto(): Promise<Contexto | null> {
  const s = await leerCookie((await cookies()).get(COOKIE_NAME)?.value, new Date())
  if (!s || !s.e) return null
  const rol = await sesionVigenteBd(s.u, s.e, s.sv)
  return rol ? { usuarioId: s.u, empresaId: s.e, rol } : null
}

/** Para páginas: sin contexto vigente → al login. */
export async function exigirContexto(): Promise<Contexto> {
  const c = await leerContexto()
  if (!c) redirect('/login')
  return c
}

/**
 * Usuario con sesión vigente en BD pero SIN exigir empresa elegida (el portal de la gestoría lista varias). null si no hay sesión, está manipulada,
 * caducada o el usuario ya no es vigente (baja o «Salir»). Las empresas se leen luego de BD (`empresas_de_usuario`), nunca de la petición.
 */
export async function leerUsuario(): Promise<{ usuarioId: string; empresaActual: string | null } | null> {
  const s = await leerCookie((await cookies()).get(COOKIE_NAME)?.value, new Date())
  if (!s || !(await usuarioVigenteBd(s.u, s.sv))) return null
  return { usuarioId: s.u, empresaActual: s.e }
}
