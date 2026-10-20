// Lógica PURA de los formularios de dirección (CP primero). Sin React ni red: se prueba con node --test.

export type ViaSugerida = { tipo: string; nombre: string }

export const normMunicipio = (s: string) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Opción de la lista equivalente (sin tildes/mayúsculas) al municipio guardado, o null. */
export function municipioEquivalente(lista: string[] | null, actual: string): string | null {
  if (!lista || !normMunicipio(actual)) return null
  return lista.find((m) => normMunicipio(m) === normMunicipio(actual)) ?? null
}

/** Municipios que ofrece el desplegable + `valor` a seleccionar. «SEVILLA»/«Malaga» seleccionan la opción oficial equivalente.
 *  Un municipio guardado que no está en la lista (texto libre antiguo) se conserva como primera opción y se marca `legado`. */
export function opcionesMunicipio(lista: string[] | null, actual: string): { opciones: string[]; legado: boolean; valor: string } {
  const base = lista ?? []
  const a = (actual ?? '').trim()
  if (!a) return { opciones: base, legado: false, valor: '' }
  const eq = municipioEquivalente(base, a)
  return eq ? { opciones: base, legado: false, valor: eq } : { opciones: [a, ...base], legado: true, valor: a }
}

/** Sustituye lo escrito de la calle por la vía oficial del Catastro conservando la cola (número, piso):
 *  «parra 12» + CL «PARRA LA» → «CL PARRA LA 12». */
export function insertarVia(texto: string, v: ViaSugerida): string {
  const i = texto.search(/[,;]|\d/)
  const cola = texto.slice(i >= 0 ? i : texto.length)
  return `${v.tipo} ${v.nombre} ${cola}`.replace(/\s+$/, ' ').replace(/ +,/g, ',').trimStart()
}

/** Dirección en una sola línea para columnas de texto libre heredadas: «Calle X 12, 41003 Sevilla (Sevilla)». */
export function componerDireccion(p: { calle: string; cp: string; municipio: string; provincia: string }): string {
  const calle = p.calle.trim()
  const loc = [p.cp.trim(), p.municipio.trim()].filter(Boolean).join(' ')
  const prov = p.provincia.trim()
  const zona = loc && prov && prov.toLowerCase() !== p.municipio.trim().toLowerCase() ? `${loc} (${prov})` : loc
  return [calle, zona].filter(Boolean).join(', ')
}

/** ¿Está la localización completa y es coherente para guardar una dirección NUEVA o editada? */
export function localizacionValida(p: { cp: string; municipio: string; provincia: string }): boolean {
  return /^\d{5}$/.test(p.cp.trim()) && p.municipio.trim() !== '' && p.provincia.trim() !== ''
}
