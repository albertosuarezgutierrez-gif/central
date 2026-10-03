// Destinatario de un aviso: regla pura (sin BD).
import { decryptField } from '@central/module-seguros-pii'
import { esCanalCorreduria } from '@central/module-seguros'

/**
 * Descifra sin convertir un fallo en una ausencia silenciosa: `null` significa
 * «no se ha podido leer», y quien llama lo cuenta como «sin canal» en vez de
 * como «este cliente no tiene email». Mismo criterio que `lib/cartera-ficha.ts`.
 */
export function descifrar(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v.trim()
  try {
    const claro = decryptField(v)
    return typeof claro === 'string' && claro.trim() !== '' && !claro.startsWith('v1:') ? claro.trim() : null
  } catch {
    return null
  }
}

/** Una dirección que no tiene forma de dirección no es un canal: es basura con forma de dato. */
export function pareceEmail(v: string | null): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export type ClienteConEmails = {
  emailOptOutAt: Date | null
  email: string | null
  emails: { email: string; esPrincipal: boolean; createdAt: Date }[]
}

/**
 * El email al que escribir: principal → el más antiguo de `cliente_emails` → la
 * columna suelta de la ficha. `null` = no hay a quién escribir (o está de baja).
 */
export function destinatarioDeCliente(c: ClienteConEmails): string | null {
  // Baja de correo: no se le escribe, y no es un fallo. Es un «no».
  if (c.emailOptOutAt) return null
  const orden = [...c.emails].sort((a, b) => {
    if (a.esPrincipal !== b.esPrincipal) return a.esPrincipal ? -1 : 1
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
  for (const e of orden) {
    const claro = descifrar(e.email)
    if (pareceEmail(claro) && !esCanalCorreduria(claro)) return claro
  }
  const suelto = descifrar(c.email)
  return pareceEmail(suelto) && !esCanalCorreduria(suelto) ? suelto : null
}

