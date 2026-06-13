// Huella estable para deduplicar e identificar gastos recurrentes.
// Módulo PURO (sin imports) para que sea testeable con `node --test`.

// Formas jurídicas a eliminar (se aplican ANTES de quitar la puntuación,
// para capturar "S.A.", "S.L.U", "S.A", etc.).
const LEGAL = /\b(s\.?l\.?u?\.?|s\.?a\.?u?\.?|s\.?c\.?p?\.?|sociedad\s+(?:limitada|anonima)|limitada|anonima)\b\.?/g

export function normalizaTexto(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function normalizaProveedor(s: string): string {
  const sinAcentos = (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const sinLegal = sinAcentos.replace(/,/g, ' ').replace(LEGAL, ' ')
  return normalizaTexto(sinLegal)
}

export function normalizaNif(s?: string | null): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Palabras clave que distinguen un mismo proveedor entre varias propiedades
// (p.ej. el alquiler "Bajo Derecha" vs "Bajo Izquierda" del mismo arrendador).
function discriminador(concepto?: string | null): string {
  const t = normalizaTexto(concepto || '')
  const m = t.match(/\b(derecha|izquierda|atico|duplex|1a|1b|2a|2b|3a|3b)\b/g)
  return m ? Array.from(new Set(m)).sort().join('-') : ''
}

export function fingerprint(f: {
  nif_proveedor?: string | null
  proveedor?: string | null
  concepto?: string | null
}): string {
  const base = normalizaNif(f.nif_proveedor) || normalizaProveedor(f.proveedor || '')
  const disc = discriminador(f.concepto)
  return disc ? `${base}:${disc}` : base
}
