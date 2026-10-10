/**
 * Teléfono de un contacto de compañía (05/10/2026). Se guarda en E.164 (`+34600112233`) porque de
 * aquí salen también los contactos 🔵 de la sincronización con Google Contacts, que empareja por
 * E.164. PURO; test: `compania-contacto-telefono.test.ts`.
 *
 *   · `null` o texto vacío → se BORRA el teléfono (Alberto lo quitó a propósito).
 *   · texto que no es un teléfono válido → rechazo (nunca se guarda un número «arreglado» a ojo).
 */
import { aE164 } from '@central/module-seguros/telefono-e164'

export type TelefonoContacto = { ok: true; telefono: string | null } | { ok: false; motivo: 'no_valido' | 'tipo' }

export function telefonoContacto(v: unknown): TelefonoContacto {
  if (v === null) return { ok: true, telefono: null }
  if (typeof v !== 'string' || v.length > 40) return { ok: false, motivo: 'tipo' }
  if (v.trim() === '') return { ok: true, telefono: null }
  const e164 = aE164(v)
  return e164 ? { ok: true, telefono: e164 } : { ok: false, motivo: 'no_valido' }
}
