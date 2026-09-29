// La dirección de la FICHA como punto de partida del presupuesto de hogar (29/09/2026).
//
// Alberto: «como en todos los de auto tenemos la dirección, le podemos dar precio del hogar».
// Es un PUNTO DE PARTIDA, no el riesgo: la dirección del tomador no tiene por qué ser la vivienda
// que se asegura (puede vivir de alquiler —entonces es contenido, no continente—, o ser la de un
// familiar). Por eso solo rellena el buscador del Catastro (gratis) y la pantalla lo dice; la
// tarificación (0,50 €) la sigue pidiendo Alberto después de hablar con el cliente.
//
// PURO. `null` = no hay calle legible en la ficha (sin dato o cifrada sin clave): el buscador sale
// vacío, como antes, y nunca con un municipio/provincia inventados que parezcan del cliente.

export type ContactoConDireccion = {
  direccion: string | null
  direccionIlegible: boolean
  ciudad: string | null
  provincia: string | null
}

export type DireccionDeFicha = { direccion: string; municipio: string | null; provincia: string | null }

function limpia(s: string | null): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

export function direccionDeFicha(c: ContactoConDireccion | null | undefined): DireccionDeFicha | null {
  if (!c || c.direccionIlegible) return null
  const direccion = limpia(c.direccion)
  if (direccion === null) return null
  return { direccion, municipio: limpia(c.ciudad)?.toUpperCase() ?? null, provincia: limpia(c.provincia)?.toUpperCase() ?? null }
}
