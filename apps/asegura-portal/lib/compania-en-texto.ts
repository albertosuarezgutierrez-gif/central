// Validación de la compañía LEÍDA por la IA contra el TEXTO del PDF.
// Bug: la IA devolvió «Mutua Madrileña» en una póliza de GENERALI. `compania` es
// texto libre; si lo que devuelve no aparece en el documento, es invención
// (null = «no se sabe», nunca un valor plausible). Puro: sin BD ni IA.

const SUFIJOS = [
  'compania de seguros y reaseguros', 'seguros y reaseguros', 'compania de seguros',
  'sociedad anonima', 'sociedad mutua', 'seguros', 'reaseguros', 's a u', 's a', 's l', 'sa', 'sau', 'sl',
]

/** minúsculas, sin acentos, sin puntuación, espacios colapsados. */
export function normalizarTextoCompania(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Nombre sin sufijos societarios ni «seguros»: «Generali España, S.A. de Seguros» → «generali espana». */
export function nucleoCompania(nombre: string): string {
  let n = ` ${normalizarTextoCompania(nombre)} `
  for (const suf of SUFIJOS) n = n.replace(new RegExp(` ${suf} `, 'g'), ' ')
  return n.replace(/\s+/g, ' ').trim()
}

const GENERICAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'espana', 'iberica', 'group', 'grupo'])

/** ¿Aparece la compañía en el texto? Núcleo completo, o su token distintivo (el 1.º no genérico). */
export function companiaApareceEnTexto(compania: string, texto: string): boolean {
  const nucleo = nucleoCompania(compania)
  if (!nucleo) return false
  const t = ` ${normalizarTextoCompania(texto)} `
  if (t.includes(` ${nucleo} `)) return true
  const distintivo = nucleo.split(' ').find((p) => p.length >= 4 && !GENERICAS.has(p))
  return distintivo ? t.includes(` ${distintivo}`) : false
}

/** Compañía validada: la devuelta si aparece en el texto; null si no (o vacía). */
export function validarCompaniaContraTexto(compania: string | null | undefined, texto: string): string | null {
  if (typeof compania !== 'string' || !compania.trim()) return null
  return companiaApareceEnTexto(compania, texto) ? compania : null
}
