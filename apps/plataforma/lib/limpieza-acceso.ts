// Autorización de la intranet de limpieza: acepta la sesión normal de plataforma (Alberto, preview)
// O un TOKEN de invitado (Vanesa, la limpieza de los 4 pisos, sin cuenta). El token vive en la BD
// (tabla limpieza_acceso_token, fila única activa) para poder rotarlo/revocarlo sin redeploy.
// Corre en runtime Node (route handlers y server components), nunca en el middleware edge.
// Mismo patrón que lib/empresas-acceso.ts / lib/trading-acceso.ts.
import { cookies } from 'next/headers'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export type ModoAcceso = 'sesion' | 'invitado' | null
export const COOKIE_INVITADO = 'limpieza_invitado'

/** Token de invitado activo (o null si no hay). */
export async function getTokenInvitado(): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<{ token: string }[]>`
      SELECT token FROM limpieza_acceso_token WHERE activo IS TRUE LIMIT 1`
    return rows[0]?.token ?? null
  } catch {
    return null
  }
}

/** Valida un token contra el activo en BD. */
export async function tokenInvitadoValido(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const activo = await getTokenInvitado()
  return Boolean(activo && token === activo)
}

/** Modo de acceso: 'sesion' (Alberto), 'invitado' (token de Vanesa en cookie) o null. */
export async function accesoLimpieza(): Promise<ModoAcceso> {
  const s = await getSession()
  if (s) return 'sesion'
  const jar = await cookies()
  const c = jar.get(COOKIE_INVITADO)?.value
  return (await tokenInvitadoValido(c)) ? 'invitado' : null
}
