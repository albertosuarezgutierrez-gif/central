// ────────────────────────────────────────────────────────────────────────────
// Municipio → provincia. PURO.
//
// Por qué existe: `provinciaDeTexto` de @central/module-concursos resuelve
// NOMBRES DE PROVINCIA, pero las descripciones del BOE citan el MUNICIPIO
// («Dos Hermanas», «Belmonte de Miranda», «El Puerto de Santa María») y a veces
// mandan una descripción plantilla sin ningún topónimo — ahí el único indicio es
// el nombre de la búsqueda guardada que disparó la alerta.
//
// Cubre las zonas que Alberto vigila. Añadir una zona = añadir una fila.
// ────────────────────────────────────────────────────────────────────────────

import { norm } from './parsing.ts'

/** Patrones de municipio/comarca por provincia. Se comparan sobre texto normalizado. */
export const MUNICIPIOS_POR_PROVINCIA: Array<[string, RegExp]> = [
  [
    'Huelva',
    /matalascanas|almonte|mazagon|moguer|punta umbria|isla cristina|lepe|cartaya|el rompido|islantilla|ayamonte|palos de la frontera|aljaraque|huelva/,
  ],
  [
    'Cádiz',
    /puerto de santa maria|puerto santamaria|el puerto de sta|jerez|chiclana|novo sancti petri|la barrosa|conil|rota\b|chipiona|costa ballena|sanlucar|barbate|zahara de los atunes|atlanterra|vejer|los canos de meca|el palmar|tarifa|bolonia|san fernando|puerto real|la linea|san roque|sotogrande|algeciras|cadiz/,
  ],
  [
    'Sevilla',
    /dos hermanas|camas\b|alcala de guadaira|mairena|tomares|bormujos|utrera|ecija|carmona|moron de la frontera|castilleja|espartinas|gines\b|san juan de aznalfarache|sevilla/,
  ],
  ['Asturias', /belmonte de miranda|pravia|oviedo|gijon|aviles|langreo|mieres|siero|llanes|asturias/],
]

/**
 * Deduce la provincia de un texto libre (descripción del bien y/o nombre de la
 * búsqueda guardada). Devuelve `null` si no hay indicio — nunca adivina.
 */
export function provinciaPorMunicipio(...textos: Array<string | null | undefined>): string | null {
  const t = norm(textos.filter(Boolean).join(' '))
  if (!t) return null
  for (const [provincia, re] of MUNICIPIOS_POR_PROVINCIA) {
    if (re.test(t)) return provincia
  }
  return null
}

/**
 * Las 52 provincias españolas en su forma CANÓNICA (con tildes y capitalizadas),
 * indexadas por su forma normalizada. Es la lista de referencia para unificar lo
 * que cada fuente escribe a su manera.
 */
const PROVINCIAS_CANONICAS = [
  'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Baleares',
  'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real',
  'Córdoba', 'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Guipúzcoa', 'Huelva', 'Huesca',
  'Jaén', 'La Coruña', 'La Rioja', 'Las Palmas', 'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga',
  'Melilla', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Pontevedra', 'Salamanca',
  'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo',
  'Valencia', 'Valladolid', 'Vizcaya', 'Zamora', 'Zaragoza',
]

const POR_NORMALIZADA = new Map(PROVINCIAS_CANONICAS.map((p) => [norm(p), p]))

/**
 * Unifica la forma de escribir una provincia. Existe porque cada fuente la
 * escribe distinto —el BOE manda «Sevilla» y la Junta de Andalucía «SEVILLA»— y
 * cualquier cosa que AGRUPE por el valor literal las contaba como provincias
 * distintas: la calibración de adjudicaciones partía la muestra de Sevilla en dos
 * (5 + 4) y ninguna de las mitades alcanzaba el mínimo para publicar su ratio.
 *
 * El radar no sufría el problema porque compara con `norm()`, pero agrupar y
 * comparar no pueden usar criterios distintos. Devuelve la entrada tal cual si no
 * reconoce la provincia: mejor un valor sin unificar que perder el dato.
 */
export function provinciaCanonica(provincia: string | null | undefined): string | null {
  const p = (provincia ?? '').trim()
  if (!p) return null
  return POR_NORMALIZADA.get(norm(p)) ?? p
}

// ── Enlace a Google Maps ─────────────────────────────────────────────────────

/** Ubicación mínima para poder enlazar el inmueble en un mapa externo. */
export interface UbicacionSubasta {
  lat?: number | null
  lon?: number | null
  direccion?: string | null
  municipio?: string | null
  provincia?: string | null
}

/**
 * URL de Google Maps para VER dónde está el inmueble.
 *
 * 🚨 La DIRECCIÓN POSTAL manda sobre las coordenadas, aunque parezca al revés.
 * Con `query=<lat,lon>` Google planta un pin anónimo en mitad de la manzana:
 * sin nombre de portal, sin Street View, sin contexto — inservible para valorar
 * un inmueble (queja de Alberto, 30/07/2026: «la ubicación es muy mala»). Con
 * `query=<AV PEDRO ROMERO 2, 41007 SEVILLA>` resuelve el PORTAL exacto, con su
 * nombre y su foto de calle. Las coordenadas quedan como respaldo para cuando
 * no hay dirección, y para el enlace de Street View (que sí las necesita).
 *
 * Con solo la provincia devuelve `null`: un pin en mitad de "Sevilla" confunde
 * más que ayuda.
 */
export function urlGoogleMaps(u: UbicacionSubasta): string | null {
  const busqueda = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

  const dir = u.direccion?.trim()
  if (dir) {
    // El CP ya identifica la localidad; añadir el municipio otra vez despista al
    // buscador cuando la dirección catastral lo trae dentro.
    const tieneLocalidad = /\d{5}/.test(dir) || (u.municipio && dir.toUpperCase().includes(u.municipio.trim().toUpperCase()))
    const partes = tieneLocalidad ? [dir] : [dir, u.municipio, u.provincia]
    return busqueda(partes.filter(Boolean).join(', ') + ', España')
  }

  if (u.lat != null && u.lon != null && Number.isFinite(u.lat) && Number.isFinite(u.lon)) {
    return `https://www.google.com/maps/search/?api=1&query=${u.lat},${u.lon}`
  }

  const partes = [u.municipio, u.provincia].map((p) => p?.trim()).filter((p): p is string => !!p)
  // Sin dirección ni municipio no hay nada que señalar.
  if (!partes.length || (partes.length === 1 && partes[0] === u.provincia?.trim())) return null
  return busqueda(partes.join(', ') + ', España')
}

/**
 * Street View del portal. Para un inmueble que no se puede visitar (la mayoría
 * de las subastas advierten «sin posibilidad de visita») ver la fachada y el
 * barrio es la única inspección posible sin desplazarse.
 */
export function urlStreetView(lat?: number | null, lon?: number | null): string | null {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`
}

/**
 * Ficha pública del Catastro por referencia catastral (plano de la parcela,
 * superficies por uso, año, linderos). Acepta la de 14 o la de 20 caracteres.
 */
export function urlFichaCatastro(refCatastral?: string | null): string | null {
  const rc = (refCatastral ?? '').replace(/[\s-]/g, '').toUpperCase()
  if (rc.length < 14) return null
  return `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiud.aspx?del=&mun=&RefC=${encodeURIComponent(rc)}`
}
