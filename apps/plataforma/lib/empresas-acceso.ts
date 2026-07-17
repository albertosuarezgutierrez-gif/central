// Autorización de la sección Empresas: acepta la sesión normal de plataforma (Alberto) O un TOKEN de
// invitado (Pablo, que prueba el módulo sin cuenta). El token vive en la env EMPRESAS_INVITADO_TOKEN
// (secreto que concede acceso → SIN fallback literal: si no está, el acceso invitado queda desactivado).
import { cookies } from 'next/headers'
import { getSession } from '@/lib/session'

export type ModoAcceso = 'sesion' | 'invitado' | null
export const COOKIE_INVITADO = 'empresas_invitado'

/** Devuelve el modo de acceso: 'sesion' (Alberto), 'invitado' (token de Pablo) o null (sin acceso). */
export async function accesoEmpresas(): Promise<ModoAcceso> {
  const s = await getSession()
  if (s) return 'sesion'
  const tok = process.env.EMPRESAS_INVITADO_TOKEN
  if (!tok) return null
  const jar = await cookies()
  return jar.get(COOKIE_INVITADO)?.value === tok ? 'invitado' : null
}

/** Valida un token de invitado contra la env (para la página de invitado). */
export function tokenInvitadoValido(token: string | undefined | null): boolean {
  const tok = process.env.EMPRESAS_INVITADO_TOKEN
  return Boolean(tok && token && token === tok)
}
