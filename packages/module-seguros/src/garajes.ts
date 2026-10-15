// Los garajes de Codeoscopic (`/car/garage-types`, `/motorcycle/garage-types`): UNA tabla para todo el monorepo
// (15/10/2026). Antes vivía repetida en asegura (`datos-cotizados.ts`, la etiqueta) y en plataforma
// (`tarificador-auto-formulario.ts`, garaje sí/no). PURO y sin imports: lo usan componentes de navegador.
//
// Regla de fondo: el garaje es DECLARACIÓN DEL RIESGO (art. 10 LCS). Un código que no se ha visto no se traduce a
// ojo — traducir mal un garaje es un precio falso o una póliza que no cubre. Sin certeza: `null`, y se pregunta.

/** Qué declara un garaje: dónde duerme el vehículo. `garaje` = «Garaje» a secas (no dice si es individual o comunitario). */
export type ClaseGaraje = 'calle' | 'comunitario' | 'individual' | 'garaje'

/**
 * Los ids del catálogo que se han VISTO (ejemplos del esquema y la petición real guardada). Uno que no está aquí se
 * enseña con su código, sin traducirlo.
 */
export const GARAJES_CONOCIDOS: Readonly<Record<string, { etiqueta: string; clase: ClaseGaraje }>> = {
  CommunalParking: { etiqueta: 'Garaje comunitario', clase: 'comunitario' },
  Garage: { etiqueta: 'Garaje', clase: 'garaje' },
  PrivateGarage: { etiqueta: 'Garaje individual', clase: 'individual' },
  IndividualGarage: { etiqueta: 'Garaje individual', clase: 'individual' },
  Street: { etiqueta: 'En la calle', clase: 'calle' },
  PublicRoad: { etiqueta: 'En la vía pública', clase: 'calle' },
  NoGarage: { etiqueta: 'En la vía pública', clase: 'calle' },
}

const limpio = (v: string | null | undefined): string => (typeof v === 'string' ? v.trim() : '')

/** Etiqueta en español de un código conocido. `null` = vacío o código que no se ha visto. */
export function etiquetaGaraje(codigo: string | null | undefined): string | null {
  return GARAJES_CONOCIDOS[limpio(codigo)]?.etiqueta ?? null
}

/** Lo que se pinta: la etiqueta, o el código entre comillas y dicho como tal (nunca el código desnudo). `null` = vacío. */
export function rotuloGaraje(codigo: string | null | undefined): string | null {
  const c = limpio(codigo)
  if (c === '') return null
  return etiquetaGaraje(c) ?? `«${c}» (código de la compañía)`
}

/** ¿Duerme en garaje? Calle / vía pública → `false`; cualquier garaje conocido → `true`; vacío o desconocido → `null`. */
export function duermeEnGaraje(codigo: string | null | undefined): boolean | null {
  const clase = GARAJES_CONOCIDOS[limpio(codigo)]?.clase
  return clase === undefined ? null : clase !== 'calle'
}

// Por ETIQUETA (la del catálogo vivo, o un garaje guardado como texto). Conservador: «Parking público» no es «calle».
const CLASE_POR_TEXTO: readonly [ClaseGaraje, RegExp][] = [
  ['calle', /v[ií]a\s+p[uú]blica|\bcalle\b|\bstreet\b|public\s*road/i],
  ['comunitario', /comunitari|colectiv|communal/i],
  // Sin «privad»: «garaje privado» no dice que sea individual (un comunitario también es privado): equivalencia dudosa.
  ['individual', /individual|private/i],
]

function claseDeTexto(t: string): ClaseGaraje | null {
  const clases = CLASE_POR_TEXTO.filter(([, re]) => re.test(t)).map(([c]) => c)
  return clases.length === 1 ? clases[0]! : null
}

/** Clase de una opción del catálogo: por id visto y, si no, por su nombre. Si id y nombre se contradicen → `null`. */
function claseDeOpcion(o: { id: string; nombre: string }): ClaseGaraje | null {
  const porId = GARAJES_CONOCIDOS[o.id]?.clase ?? null
  const porNombre = claseDeTexto(o.nombre)
  if (porId !== null && porNombre !== null && porId !== porNombre && porId !== 'garaje') return null
  return porId ?? porNombre
}

/**
 * El garaje guardado en el riesgo → id del catálogo VIVO, solo con certeza (15/10/2026). Orden: el mismo id; la misma
 * etiqueta (sin distinguir mayúsculas); y, si no, la equivalencia explícita: misma CLASE (p. ej. `PublicRoad` y `Street`
 * son las dos «calle») y UNA sola opción del catálogo de esa clase. «Garaje» a secas no se equipara a nada (no dice si es
 * individual o comunitario). `null` = no se resuelve: se pregunta, NUNCA se sustituye por el defecto.
 * Un riesgo de calle (`PublicRoad`, `Street`, «vía pública») va PRIMERO a `NoGarage` si el catálogo lo tiene (equivalencia
 * conocida de Codeoscopic, 15/10/2026); sin `NoGarage` en catálogo, sigue la lógica de abajo.
 */
export function resolverGarajeEnCatalogo(guardado: string | null | undefined, catalogo: readonly { id: string; nombre: string }[]): string | null {
  const v = limpio(guardado)
  if (v === '') return null
  if (catalogo.some((o) => o.id === v)) return v
  const clase = GARAJES_CONOCIDOS[v]?.clase ?? claseDeTexto(v)
  if (clase === 'calle' && catalogo.some((o) => o.id === 'NoGarage')) return 'NoGarage'
  const porEtiqueta = catalogo.filter((o) => o.nombre.trim().toLowerCase() === v.toLowerCase())
  if (porEtiqueta.length === 1) return porEtiqueta[0]!.id
  if (clase === null || clase === 'garaje') return null
  const mismas = catalogo.filter((o) => claseDeOpcion(o) === clase)
  return mismas.length === 1 ? mismas[0]!.id : null
}
