// Validación de lo que sube el proveedor. PURO.
// · El tipo se decide por los BYTES (firma del fichero), nunca por lo que diga el navegador ni por la extensión.
// · XML: se rechaza cualquier DOCTYPE/ENTITY (XXE / bomba de entidades) y lo que no sea texto.
// · Tamaño máximo configurable por el cliente (acotado a un techo duro de la plataforma).
// · El nombre que se guarda es SANEADO (sin rutas, sin caracteres raros, con la extensión del tipo REAL).
export const TIPOS_ARCHIVO = ['pdf', 'jpg', 'png', 'xml'] as const
export type TipoArchivo = (typeof TIPOS_ARCHIVO)[number]
export const MIME_DE: Readonly<Record<TipoArchivo, string>> = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', xml: 'application/xml' }

/** Techo duro (la config del cliente no puede pasar de aquí). */
export const MAX_BYTES_TECHO = 20 * 1024 * 1024
export interface PoliticaSubida { tipos: readonly TipoArchivo[]; maxBytes: number }
export const POLITICA_POR_DEFECTO: PoliticaSubida = { tipos: TIPOS_ARCHIVO, maxBytes: 10 * 1024 * 1024 }

export type ResultadoSubida =
  | { ok: true; tipo: TipoArchivo; mime: string; nombre: string; bytes: number }
  | { ok: false; motivo: 'vacio' | 'demasiado_grande' | 'tipo_no_permitido' | 'xml_peligroso'; mensaje: string }

/** Tipo REAL por la firma de los bytes. null = ninguno de los admitidos. */
export function tipoReal(b: Uint8Array): TipoArchivo | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'pdf' // %PDF-
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png'
  if (pareceXml(b)) return 'xml'
  return null
}

function cabeceraTexto(b: Uint8Array, n = 4096): string | null {
  let i = 0
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3 // BOM UTF-8
  const trozo = b.subarray(i, Math.min(b.length, i + n))
  for (const x of trozo) if (x === 0) return null // binario
  return new TextDecoder('utf-8', { fatal: false }).decode(trozo)
}

function pareceXml(b: Uint8Array): boolean {
  const t = cabeceraTexto(b)
  if (t == null) return false
  return /^\s*<(\?xml[\s?]|[A-Za-z_][\w.:-]*[\s>/])/.test(t)
}

/** DOCTYPE o ENTITY en CUALQUIER parte del XML → se rechaza (no hay factura legítima que los necesite). */
export function xmlPeligroso(b: Uint8Array): boolean {
  const t = new TextDecoder('utf-8', { fatal: false }).decode(b)
  return /<!DOCTYPE|<!ENTITY/i.test(t)
}

/** Nombre seguro para guardar: solo [a-z0-9._-], sin rutas, ≤ 80 caracteres, con la extensión del tipo real. */
export function sanearNombre(original: string | null | undefined, tipo: TipoArchivo): string {
  const base = String(original ?? '').split(/[\\/]/).pop() ?? ''
  const sinExt = base.replace(/\.[A-Za-z0-9]{1,5}$/, '')
  const limpio = sinExt.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/\.{2,}/g, '.').replace(/^[-.]+|[-.]+$/g, '').slice(0, 70)
  return `${limpio || 'documento'}.${tipo}`
}

export function validarSubida(
  a: { nombre: string | null | undefined; bytes: Uint8Array },
  politica: PoliticaSubida = POLITICA_POR_DEFECTO,
): ResultadoSubida {
  const max = Math.min(MAX_BYTES_TECHO, Math.max(1, Math.trunc(politica.maxBytes)))
  if (a.bytes.length === 0) return { ok: false, motivo: 'vacio', mensaje: 'El archivo está vacío' }
  if (a.bytes.length > max) return { ok: false, motivo: 'demasiado_grande', mensaje: `El archivo pasa del máximo (${Math.floor(max / (1024 * 1024))} MB)` }
  const tipo = tipoReal(a.bytes)
  if (!tipo || !politica.tipos.includes(tipo)) {
    return { ok: false, motivo: 'tipo_no_permitido', mensaje: `Solo se admiten: ${politica.tipos.map((t) => t.toUpperCase()).join(', ')}` }
  }
  if (tipo === 'xml' && xmlPeligroso(a.bytes)) return { ok: false, motivo: 'xml_peligroso', mensaje: 'El XML contiene declaraciones no admitidas' }
  return { ok: true, tipo, mime: MIME_DE[tipo], nombre: sanearNombre(a.nombre, tipo), bytes: a.bytes.length }
}
