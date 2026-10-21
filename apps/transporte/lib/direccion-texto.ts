// Texto canónico de una dirección postal para columnas de texto (origen, destino, parada.direccion):
// «Calle Nº, CP Municipio (Provincia)». Puro: sin red ni BD. Devuelve '' si falta algo (nunca una dirección a medias).
export type PartesDireccion = { calle: string; numero: string; cp: string; municipio: string; provincia: string }

const limpia = (s: string) => s.replace(/\s+/g, ' ').trim()

export function componerDireccion(p: PartesDireccion): string {
  const calle = limpia(p.calle)
  const numero = limpia(p.numero)
  const cp = p.cp.trim()
  const municipio = limpia(p.municipio)
  const provincia = limpia(p.provincia)
  if (!calle || !numero || !/^\d{5}$/.test(cp) || !municipio || !provincia) return ''
  return `${calle} ${numero}, ${cp} ${municipio} (${provincia})`
}

/** Dirección fuera de España: país + texto libre (sin CP español). «Texto, País»; '' si falta alguno. */
export function componerExtranjera(p: { pais: string; texto: string }): string {
  const pais = limpia(p.pais)
  const texto = limpia(p.texto)
  return pais && texto ? `${texto}, ${pais}` : ''
}

/** Lo que se emite al padre: la dirección nueva si está completa; si no, el valor previo (nunca '' encima de un valor guardado). */
export const valorAEmitir = (nueva: string, previo: string): string => nueva || previo
