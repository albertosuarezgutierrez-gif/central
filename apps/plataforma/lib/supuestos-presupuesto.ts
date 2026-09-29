// Los datos que un PRESUPUESTO de coche o moto supone cuando nadie los ha dicho (29/09/2026, Alberto).
// PURO y sin imports: el garaje lo usan el asistente de Telegram y las pantallas AutoNuevo/MotoNuevo
// (navegador), para que el mismo cliente salga al mismo precio pida donde lo pida. El estado civil por
// defecto es SOLO del asistente: en la pantalla no viajaría marcado como supuesto y se emitiría sin aviso.
//
// La regla de fondo: estos datos NO se preguntan para dar precio, se CONFIRMAN al emitir. El presupuesto
// sale con el supuesto DECLARADO (nunca como dato del cliente) y la emisión es donde se comprueba.
// Si algún día hay tarificador propio, esta regla va con él (docs/CORREDURIA-INTRANET-IDEAS.md).

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
