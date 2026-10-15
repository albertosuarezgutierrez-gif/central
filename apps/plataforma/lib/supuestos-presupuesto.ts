// Los datos que un PRESUPUESTO de coche o moto supone cuando nadie los ha dicho (29/09/2026, Alberto).
// PURO (solo importa la tabla de garajes de `@central/module-seguros/garajes`, también pura): el garaje lo usan el asistente de Telegram y las pantallas AutoNuevo/MotoNuevo
// (navegador), para que el mismo cliente salga al mismo precio pida donde lo pida. El estado civil por
// defecto es SOLO del asistente: en la pantalla no viajaría marcado como supuesto y se emitiría sin aviso.
//
// La regla de fondo: estos datos NO se preguntan para dar precio, se CONFIRMAN al emitir. El presupuesto
// sale con el supuesto DECLARADO (nunca como dato del cliente) y la emisión es donde se comprueba.
// Si algún día hay tarificador propio, esta regla va con él (docs/CORREDURIA-INTRANET-IDEAS.md).

import { resolverGarajeEnCatalogo, rotuloGaraje } from '@central/module-seguros/garajes'

type Opcion = { id: string; nombre: string }

/** Lo que se añade a cada supuesto de este fichero en el resumen del precio. */
export const SOLO_PARA_EL_PRECIO = 'solo para el precio: se confirma con el cliente al emitir'

const RE_NO_GARAJE = /v[ií]a\s+p[uú]blica|\bcalle\b|street|public|p[uú]blic/i
const RE_GARAJE = /garaj|garage|parking|aparcamiento/i
const RE_COMUNITARIO = /comunitari|colectiv|communal/i

/**
 * Dónde duerme por defecto: en GARAJE, nunca en la calle (Alberto, 29/09/2026 — sustituye a «vía pública»
 * del 25/09). De los garajes, el comunitario: el habitual en un piso y el que menos abarata de los dos.
 * `null` = el catálogo no trae ningún garaje reconocible, y entonces se pregunta.
 */
export function garajePorDefecto(catalogo: readonly Opcion[]): Opcion | null {
  const garajes = catalogo.filter((g) => !RE_NO_GARAJE.test(g.nombre) && !RE_NO_GARAJE.test(g.id) && (RE_GARAJE.test(g.nombre) || RE_GARAJE.test(g.id)))
  return garajes.find((g) => RE_COMUNITARIO.test(g.nombre) || RE_COMUNITARIO.test(g.id)) ?? garajes[0] ?? null
}

/** Estado civil por defecto: soltero (Alberto, 29/09/2026). `null` = el catálogo no lo trae. */
export function estadoCivilPorDefecto(catalogo: readonly Opcion[]): Opcion | null {
  return catalogo.find((c) => /solter|single/i.test(c.nombre) || /^single$/i.test(c.id)) ?? null
}

// ── El garaje del RIESGO manda sobre el defecto (15/10/2026, bug de declaración del riesgo) ─────────────────────────
// El riesgo guardaba «PublicRoad» (calle); el catálogo vivo no traía ese id y la pantalla metía el comunitario por
// defecto rotulado «por defecto»: se tarificaba un garaje que el cliente no había declarado. Ahora el defecto SOLO
// aplica si el riesgo no tiene garaje; si lo tiene y no casa con certeza, el campo queda sin elegir y se pregunta.

export type GarajeInicial = {
  /** Lo que arranca en el selector ('' = sin elegir). */
  id: string
  /** El id sale del garaje guardado en el riesgo (resuelto contra el catálogo). */
  delRiesgo: boolean
  /** El riesgo trae un garaje que no casa con el catálogo: su etiqueta, para decirlo. `null` = no es el caso. */
  sinCasar: string | null
}

/**
 * PURA. Garaje con el que arranca el cotizador: el del riesgo resuelto contra el catálogo vivo; sin certeza, VACÍO (nunca
 * el defecto); el defecto (comunitario) solo cuando el riesgo NO trae garaje. Con el catálogo vacío (no se pudo leer) no
 * se afirma que «no está en la lista»: queda vacío y ya se avisa del fallo del catálogo.
 */
export function garajeInicial(garajeRiesgo: string | null | undefined, catalogo: readonly Opcion[]): GarajeInicial {
  const guardado = typeof garajeRiesgo === 'string' ? garajeRiesgo.trim() : ''
  if (guardado === '') return { id: garajePorDefecto(catalogo)?.id ?? '', delRiesgo: false, sinCasar: null }
  const resuelto = resolverGarajeEnCatalogo(guardado, catalogo)
  if (resuelto !== null) return { id: resuelto, delRiesgo: true, sinCasar: null }
  return { id: '', delRiesgo: false, sinCasar: catalogo.length > 0 ? rotuloGaraje(guardado) : null }
}

/**
 * PURA. El garaje que viaja a los bots (Mapfre…) desde el cotizador: lo que el corredor ELIGIÓ si es distinto de lo que
 * vino del riesgo; si no, el código GUARDADO en el riesgo tal cual (el mismo mapeo que `tarificador-auto-riesgo.ts`:
 * `garajeNocheDeCodigo`); sin riesgo ni elección, `null` (el defecto de la pantalla es un supuesto y no viaja).
 */
export function garajeParaBot(e: { garajeRiesgo: string | null | undefined; actual: string; elegido: boolean; resueltoDelRiesgo: string | null }): string | null {
  const actual = e.actual.trim()
  if (e.elegido && actual !== '' && actual !== e.resueltoDelRiesgo) return actual
  const guardado = typeof e.garajeRiesgo === 'string' ? e.garajeRiesgo.trim() : ''
  if (guardado !== '') return guardado
  return e.elegido && actual !== '' ? actual : null
}
