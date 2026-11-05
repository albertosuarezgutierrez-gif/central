// Importes y fechas de ficheros bancarios con formato humano. Sin coma flotante: se construye el entero de céntimos dígito a dígito.

/**
 * «1.234,56», «-12,30», «12,30-», «(45,00)», «1234.56», «1 234,56 €» → céntimos con signo. null si no es un importe.
 * Ambigüedad: con un solo separador, 1-2 dígitos detrás = decimales; 3 dígitos = miles (formato español). Con ambos, el último es el decimal.
 */
export function importeACentimos(texto: string | null | undefined): number | null {
  if (typeof texto !== 'string') return null
  let s = texto.trim().replace(/\s|€|eur$/gi, '')
  if (!s) return null
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1) } else if (s.startsWith('+')) s = s.slice(1)
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1) }
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null
  const ultimaComa = s.lastIndexOf(',')
  const ultimoPunto = s.lastIndexOf('.')
  let entera: string
  let decimal = ''
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    const sep = Math.max(ultimaComa, ultimoPunto)
    entera = s.slice(0, sep); decimal = s.slice(sep + 1)
  } else if (ultimaComa >= 0 || ultimoPunto >= 0) {
    const sep = ultimaComa >= 0 ? ',' : '.'
    const partes = s.split(sep)
    const cola = partes[partes.length - 1]
    if (partes.length === 2 && cola.length <= 2) { entera = partes[0]; decimal = cola } else if (cola.length === 3 && partes[0].length >= 1) { entera = partes.join('') } else return null
  } else entera = s
  entera = entera.replace(/[.,]/g, '')
  if (decimal.length > 2 || !/^\d*$/.test(decimal) || !/^\d*$/.test(entera)) return null
  const cent = Number(entera || '0') * 100 + Number(decimal.padEnd(2, '0') || '0')
  if (!Number.isSafeInteger(cent)) return null
  return neg ? -cent : cent
}

/** «31/12/2026», «31-12-26», «2026-12-31», «31.12.2026» → ISO válido; null si no existe esa fecha. */
export function fechaAIso(texto: string | null | undefined): string | null {
  if (typeof texto !== 'string') return null
  const s = texto.trim().split(/[ T]/)[0]
  let a: string, m: string, d: string
  let r = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)
  if (r) { [, a, m, d] = r } else {
    r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s)
    if (!r) return null
    ;[, d, m, a] = r
    if (a.length === 2) a = `20${a}`
  }
  const iso = `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const f = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(f.getTime()) || f.toISOString().slice(0, 10) !== iso ? null : iso
}
