// PATRIMONIO (22/10/2026, paso 7) — el tipo REAL de un fichero subido, por sus bytes mágicos. PURO.
//
// El `type` de un `File` lo pone el navegador (o quien monte la petición a mano): no es una prueba. Lo que decide si se
// lee y con qué lector es lo que dicen los primeros bytes. Solo lo que el lector sabe abrir: PDF y JPG/PNG/WebP
// (HEIC no se acepta: ni `pdf-parse` ni la visión del proveedor lo garantizan).
export type TipoFactura = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'

const ascii = (b: Uint8Array, desde: number, texto: string) => {
  if (b.length < desde + texto.length) return false
  for (let i = 0; i < texto.length; i++) if (b[desde + i] !== texto.charCodeAt(i)) return false
  return true
}

/** `null` = no es nada que sepamos leer (se responde 415), aunque el navegador dijera `application/pdf`. */
export function tipoRealFactura(b: Uint8Array): TipoFactura | null {
  // PDF: la cabecera `%PDF-` puede ir precedida de basura (la especificación tolera 1024 bytes).
  const cabecera = Buffer.from(b.subarray(0, 1024)).toString('latin1')
  if (cabecera.includes('%PDF-')) return 'application/pdf'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return 'image/png'
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return 'image/webp'
  return null
}
