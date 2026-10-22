// PATRIMONIO (22/10/2026) — regla de la casa para direcciones: CP PRIMERO → provincia automática + desplegable de
// municipios → calle autocompletada con el callejero del Catastro → número. PURO: lo usa `DireccionCp.tsx` (cliente) y
// `alta-inmueble.ts` (servidor), así que lo que la pantalla bloquea el servidor también lo rechaza.
//
// 🚨 Nunca un municipio ni una provincia inventados: sin CP válido quedan VACÍOS. Un CP que la tabla no conoce
// (`municipios: null`) NO es «sin municipios»: se escribe a mano. Un fallo de red al consultar el CP tampoco inventa nada.

export type LecturaCp =
  | { estado: 'vacio' }
  | { estado: 'consultando' }
  | { estado: 'ok'; municipios: string[] | null; provincia: string | null }
  | { estado: 'error' }

/** Solo cifras y como mucho cinco: lo que se teclea en el campo. */
export function normalizarCp(crudo: string): string {
  return crudo.replace(/\D/g, '').slice(0, 5)
}

export function cpValido(cp: string): boolean {
  return /^\d{5}$/.test(cp.trim())
}

export type EstadoDireccion = {
  cpValido: boolean
  /** El municipio sale de una lista (el CP da varios) en vez de teclearse. */
  eligeMunicipioDeLista: boolean
  /** Hay CP, provincia y municipio: solo entonces se busca la calle en el callejero. */
  puedeBuscarCalle: boolean
  /** Lo que la pantalla le dice a la persona bajo el CP. `''` = nada que decir. */
  mensaje: string
}

export function estadoDireccion(x: { cp: string; provincia: string; municipio: string; lectura: LecturaCp }): EstadoDireccion {
  const valido = cpValido(x.cp)
  const lista = x.lectura.estado === 'ok' ? x.lectura.municipios : null
  const puedeBuscarCalle = valido && x.provincia.trim() !== '' && x.municipio.trim() !== ''
  let mensaje = ''
  if (!valido) mensaje = 'Con el código postal salen la provincia y el municipio; sin él, no se puede seguir.'
  else if (x.lectura.estado === 'consultando') mensaje = 'Consultando el código postal…'
  else if (x.lectura.estado === 'error') mensaje = 'No se ha podido leer el código postal ahora: escribe la provincia y el municipio a mano.'
  else if (x.lectura.estado === 'ok' && x.lectura.municipios === null) mensaje = 'Ese código postal no está en la tabla: escribe el municipio a mano.'
  return { cpValido: valido, eligeMunicipioDeLista: lista !== null && lista.length > 1, puedeBuscarCalle, mensaje }
}

/**
 * Qué provincia y municipio quedan tras leer un CP. La provincia es la del CP siempre que el CP la dé; el municipio
 * solo se fija solo si el CP tiene UNO; si había uno elegido y ya no está en la lista, se vacía (otro CP, otro municipio).
 * Si el CP no da lista (`null`), lo que había escrito a mano se respeta.
 */
export function aplicarLecturaCp(
  lectura: { municipios: string[] | null; provincia: string | null },
  actual: { provincia: string; municipio: string },
): { provincia: string; municipio: string } {
  const provincia = lectura.provincia ?? actual.provincia
  const lista = lectura.municipios
  if (lista === null) return { provincia, municipio: actual.municipio }
  if (lista.length === 1) return { provincia, municipio: lista[0] }
  return { provincia, municipio: lista.includes(actual.municipio) ? actual.municipio : '' }
}

/** Texto para casar facturas y mostrar: «CL PARRA LA 12, 41003 SEVILLA (SEVILLA)». */
export function componerDireccionNormalizada(x: { direccion: string; cp: string; municipio: string; provincia: string }): string {
  return `${x.direccion.trim().replace(/\s+/g, ' ')}, ${x.cp.trim()} ${x.municipio.trim()} (${x.provincia.trim()})`
}
