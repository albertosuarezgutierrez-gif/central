// Orquesta el alta del logo de una empresa (Cuenta y operador): valida → recorta márgenes → normaliza tamaño → PNG →
// sube al bucket (mismo `subirObjeto` que el resto de subidas) → guarda `logo_path` y, si la empresa NO tiene color, el
// color dominante del logo. SVG se guarda tal cual (vectorial, sin raster que recortar).
import { subirObjeto } from '@/lib/storage'
import { actualizarBranding, getEmpresa } from '@/lib/empresa'
import { bboxContenido, colorDominante } from '@/lib/logo-pixeles'

export const MAX_LOGO = 2 * 1024 * 1024 // 2 MB
export const ANCHO_MAX_LOGO = 600
export const MIME_LOGO = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp', 'image/gif'] as const

export type LogoProcesado = { bytes: Buffer; mime: string; ext: string; color: string | null }

/** Raster → PNG recortado (≤ 600 px de ancho, proporción intacta) + color dominante. Lanza si no es imagen decodificable. */
export async function procesarLogo(entrada: Buffer, mime: string): Promise<LogoProcesado> {
  if (mime === 'image/svg+xml') return { bytes: entrada, mime, ext: 'svg', color: null }
  const sharp = (await import('sharp')).default
  const { data, info } = await sharp(entrada).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const margen = Math.max(2, Math.round(Math.max(info.width, info.height) * 0.01))
  const box = bboxContenido(data, info.width, info.height, margen)
  let img = sharp(entrada).rotate()
  if (box) img = img.extract(box) // logo vacío/blanco: se deja como vino
  const png = await img.resize({ width: ANCHO_MAX_LOGO, withoutEnlargement: true }).png().toBuffer()
  return { bytes: png, mime: 'image/png', ext: 'png', color: colorDominante(data, info.width, info.height) }
}

/** Valida (tipo y 2 MB), procesa, sube y guarda. Devuelve error legible o el color sugerido que se haya guardado. */
export async function guardarLogoEmpresa(
  empresaId: string, entrada: Buffer, mime: string,
): Promise<{ ok: true; colorDerivado: string | null } | { ok: false; error: string }> {
  if (!(MIME_LOGO as readonly string[]).includes(mime)) return { ok: false, error: 'Formato no soportado (PNG, JPG, SVG o WebP)' }
  if (entrada.byteLength > MAX_LOGO) return { ok: false, error: 'El logo supera 2 MB' }
  let p: LogoProcesado
  try { p = await procesarLogo(entrada, mime) } catch { return { ok: false, error: 'No se pudo leer la imagen' } }
  const path = `branding/${empresaId}/logo-${Date.now()}.${p.ext}`
  await subirObjeto(path, p.bytes.buffer.slice(p.bytes.byteOffset, p.bytes.byteOffset + p.bytes.byteLength) as ArrayBuffer, p.mime)
  await actualizarBranding(empresaId, { logo_path: path })
  let colorDerivado: string | null = null
  if (p.color && !(await getEmpresa(empresaId))?.color_primario) {
    await actualizarBranding(empresaId, { color_primario: p.color })
    colorDerivado = p.color
  }
  return { ok: true, colorDerivado }
}
