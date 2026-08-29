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
  let v = (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  // CIF/NIF español a veces con prefijo de país "ES" (p.ej. "ES A-81864498").
  if (v.length === 11 && v.startsWith('ES')) v = v.slice(2)
  return v
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

/**
 * TODAS las huellas bajo las que puede estar registrado el mismo proveedor, la mejor primero.
 *
 * 🚨 Por qué hace falta (29/08/2026). `fingerprint()` usa el NIF **si lo hay** y si no el nombre,
 * o sea la identidad CAMBIA DE EJE según lo que traiga cada factura. Alberto lo vio así:
 *
 *   «Anthropic Ireland, Limited»  NIF IE4276970QH  → huella 'IE4276970QH'   (la que confirmó)
 *   «Anthropic, PBC»              sin NIF          → huella 'anthropic pbc' (seguía pendiente)
 *
 * Mismo proveedor, dos identidades, y lo aprendido en una no llega nunca a la otra: «he dado ok a
 * varios y sigue apareciendo». Le pasa a cualquier proveedor que unas veces publique el NIF en el
 * PDF y otras no, que son casi todos.
 *
 * Buscar por las dos une los ejes sin migrar el corpus ni tocar las reglas ya aprendidas. Es una
 * lista ORDENADA, no un conjunto: la huella por NIF es la buena (un nombre se escribe de tres
 * formas; un NIF no), así que va primera y es la que se escribe cuando no hay nada que reutilizar.
 */
export function huellasDe(f: {
  nif_proveedor?: string | null
  proveedor?: string | null
  concepto?: string | null
}): string[] {
  const disc = discriminador(f.concepto)
  const con = (base: string) => (disc ? `${base}:${disc}` : base)

  const nif = normalizaNif(f.nif_proveedor)
  const nombre = normalizaProveedor(f.proveedor || '')

  const out: string[] = []
  if (nif) out.push(con(nif))
  if (nombre) out.push(con(nombre))
  return [...new Set(out)]
}
