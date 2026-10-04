// Callbacks de Telegram para decidir anomalías contables con botones. Módulo PURO (sin imports).
//
// Formato `<prefijo>_<acción>:<uuid>` (parseCallback de @central/core-telegram). Telegram admite
// 64 bytes en callback_data: `fiva_sin:` + uuid = 45. Por eso un duplicado lleva UN solo id (el de la
// fila más nueva, la candidata a quitar) y no el par (2 uuid = 73 bytes, no cabe).
//
//   fiva_sin:<facturaId>  IVA dudoso, proveedor extranjero → cuota_iva = 0 (solo si seguía null)
//   fiva_rev:<facturaId>  «Revisar»: no hace nada
//   gdup_ok:<gastoId>     «Son distintos»: la fila no se vuelve a preguntar (ver `claveNoDuplicado`)
//   gdup_del:<gastoId>    «Quitar duplicado» (sin cablear: `gastos` no tiene estado de descarte)

export const PREFIJO_IVA = 'fiva'
export const PREFIJO_DUP = 'gdup'
export type AccionIva = 'sin' | 'rev'
export type AccionDup = 'ok' | 'del'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function esUuid(s: unknown): s is string {
  return typeof s === 'string' && RE_UUID.test(s)
}

function construir(prefijo: string, accion: string, id: string): string {
  if (!esUuid(id)) throw new Error('callback: id no es un uuid')
  const data = `${prefijo}_${accion}:${id}`
  if (Buffer.byteLength(data, 'utf8') > 64) throw new Error('callback: más de 64 bytes')
  return data
}

export const callbackIva = (accion: AccionIva, facturaId: string) => construir(PREFIJO_IVA, accion, facturaId)
export const callbackDup = (accion: AccionDup, gastoId: string) => construir(PREFIJO_DUP, accion, gastoId)

/** Interpreta lo que `parseCallback` devolvió. `null` si la acción o el id no son válidos. */
export function interpretarIva(action: string, args: string[]): { accion: AccionIva; id: string } | null {
  if ((action !== 'sin' && action !== 'rev') || !esUuid(args[0])) return null
  return { accion: action, id: args[0] }
}
export function interpretarDup(action: string, args: string[]): { accion: AccionDup; id: string } | null {
  if ((action !== 'ok' && action !== 'del') || !esUuid(args[0])) return null
  return { accion: action, id: args[0] }
}

/**
 * ¿Proveedor extranjero (sin IVA español)? Solo con señal positiva: un NIF con prefijo de país
 * distinto de ES seguido de dígito (IE6388047V, DE123456789) o un proveedor de la lista. Sin NIF y
 * fuera de la lista = «no se sabe» → false (no se ofrece fijar IVA 0 a ciegas).
 */
const PROVEEDORES_EXTRANJEROS = /\b(vercel|openrouter|anthropic|openai|github|supabase|cloudflare|digitalocean|fly\.io|stripe payments|google cloud|aws|amazon web services|twilio|hubspot|notion|slack)\b/i
export function esProveedorExtranjero(d: { nif_proveedor?: string | null; proveedor?: string | null }): boolean {
  const nif = (d.nif_proveedor ?? '').toUpperCase().replace(/[\s.-]/g, '')
  const m = /^([A-Z]{2})\d/.exec(nif)
  if (m) return m[1] !== 'ES'
  if (nif) return false // formato español (letra+dígitos) u otro desconocido: no se afirma
  return PROVEEDORES_EXTRANJEROS.test(d.proveedor ?? '')
}

/** ¿Hay que ofrecer «Sin IVA (extranjero)»? IVA no leído (null) y proveedor extranjero. 0 SÍ es dato. */
export function ofrecerSinIvaExtranjero(ivaPct: number | null, d: { nif_proveedor?: string | null; proveedor?: string | null }): boolean {
  return ivaPct === null && esProveedorExtranjero(d)
}

export interface FilaDup { id: string; created_at: string | Date; fecha?: string | null }

/** Fila a quitar de un par duplicado: la MÁS NUEVA por alta (created_at); empate → id mayor. */
export function filaAQuitar(a: FilaDup, b: FilaDup): string {
  const ta = new Date(a.created_at).getTime()
  const tb = new Date(b.created_at).getTime()
  if (ta !== tb) return ta > tb ? a.id : b.id
  return a.id > b.id ? a.id : b.id
}

/** Marca en `raw_extraction` para «Son distintos» (no se crea tabla). */
export const claveNoDuplicado = 'no_duplicado'
