// Contexto de la petición: sesión firmada + REVALIDACIÓN EN BD (fail-closed). Lo usan todas las páginas y APIs del panel.
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { COOKIE_NAME, leerCookie } from './sesion-cookie.ts'
import { personaVigente, cuentasDePersona, type CuentaPanel } from './db.ts'

export type Contexto = { personaId: string; sv: number; exp: number; cuentas: CuentaPanel[]; cuenta: CuentaPanel | null }

/** null si no hay sesión, está manipulada/caducada, o la persona ya no vale (Salir, baja, sin ninguna cuenta). */
export async function leerContexto(): Promise<Contexto | null> {
  const s = await leerCookie((await cookies()).get(COOKIE_NAME)?.value, new Date())
  if (!s || !(await personaVigente(s.p, s.sv))) return null
  const cuentas = await cuentasDePersona(s.p)
  if (!cuentas.length) return null
  // La cuenta elegida se REVALIDA contra las que la BD le da hoy; con una sola, esa.
  const cuenta = cuentas.find((c) => c.id === s.c) ?? (cuentas.length === 1 ? cuentas[0] : null)
  return { personaId: s.p, sv: s.sv, exp: s.exp, cuentas, cuenta }
}

export async function exigirContexto(): Promise<Contexto> {
  const c = await leerContexto()
  if (!c) redirect('/login')
  return c
}
