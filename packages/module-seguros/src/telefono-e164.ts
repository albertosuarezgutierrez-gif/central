// Teléfono → E.164 (05/10/2026). Primer helper COMÚN de la casa para esto: hasta hoy cada
// sitio limpiaba a su manera (`vcard.ts` quita lo que no es dígito o `+`, el índice ciego
// `normalizeTelefonoForHash` se queda solo con los dígitos). Este NO sustituye a ninguno:
// lo usa la sincronización con Google Contacts, que necesita una forma canónica para comparar
// «el mismo teléfono» entre el CRM y Google (`+34 600 11 22 33` = `600112233` = `0034600112233`).
//
// Región por defecto: ES (la cartera es española; un número sin prefijo es español).
//
// 🚨 Tres desenlaces, no dos: `null` de entrada → `null` («no consta»); texto que no es un
// teléfono válido → `null` también, pero `esTelefonoValido` permite distinguirlo; nunca se
// inventa un número «arreglado».

import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

export const REGION_POR_DEFECTO: CountryCode = 'ES'

/** `+34600112233`, o `null` si no hay número o no es un teléfono válido. */
export function aE164(raw: string | null | undefined, region: CountryCode = REGION_POR_DEFECTO): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (t === '') return null
  // Un valor cifrado que no se pudo abrir NO es un teléfono: no se le saca un número.
  if (t.startsWith('v1:')) return null
  const p = parsePhoneNumberFromString(t, { defaultCountry: region })
  if (!p || !p.isValid()) return null
  return p.number
}

export function esTelefonoValido(raw: string | null | undefined, region: CountryCode = REGION_POR_DEFECTO): boolean {
  return aE164(raw, region) !== null
}

/**
 * Las cadenas de DÍGITOS con las que puede estar guardado ese teléfono en el índice ciego
 * (`telefono_lookup_hash` = HMAC de solo-dígitos, sin normalizar el prefijo): `34600112233`
 * y `600112233` son hashes distintos para la misma persona. Para buscar a quien llama se
 * prueban todas. Si el número no es válido, se prueba solo lo tecleado (en dígitos).
 */
export function variantesIndiceTelefono(raw: string | null | undefined, region: CountryCode = REGION_POR_DEFECTO): string[] {
  if (typeof raw !== 'string' || raw.trim().startsWith('v1:')) return []
  const tecleado = raw.replace(/\D/g, '')
  const out = new Set<string>()
  if (tecleado) out.add(tecleado)
  const t = raw.trim()
  const p = t ? parsePhoneNumberFromString(t, { defaultCountry: region }) : undefined
  if (p && p.isValid()) {
    out.add(p.number.replace(/\D/g, '')) // E.164 sin «+»: 34600112233
    out.add(String(p.nationalNumber)) // nacional: 600112233
    out.add(`00${p.number.replace(/\D/g, '')}`) // 0034600112233
  }
  return [...out]
}

/**
 * ¿Se le puede mandar un WhatsApp a este número? (07/10/2026: el presupuesto por WhatsApp sin
 * correo en la ficha.) Válido y, si es español, MÓVIL (6xx/7xx): a un fijo no le llega nada.
 * Un extranjero válido se acepta (con los metadatos mínimos no se distingue móvil de fijo).
 * Un comodín de compañía («600000000», todo el mismo dígito) NO es de nadie.
 */
export function esMovilWhatsapp(raw: string | null | undefined, region: CountryCode = REGION_POR_DEFECTO): boolean {
  const e164 = aE164(raw, region)
  if (e164 === null) return false
  const nacional = e164.startsWith('+34') ? e164.slice(3) : e164.slice(1)
  if (/^(\d)\1+$/.test(nacional.slice(1)) || /^(\d)\1+$/.test(nacional)) return false
  if (e164.startsWith('+34')) return /^\+34[67]\d{8}$/.test(e164)
  return true
}
