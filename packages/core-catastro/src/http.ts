// Adaptador HTTP del Catastro: la RED. El parseo es puro y vive en `parser.ts`.
//
// Notas de campo (probadas contra los servicios reales, jul/2026):
//   · El host rechaza la conexión sin un User-Agent de navegador.
//   · El endpoint REST `/json/` devuelve 400; el que funciona es el `.asmx`
//     que responde XML.
//
// Extraído de `apps/plataforma/lib/subastas/enriquecer.ts` el 02/09/2026 para
// que la correduría (seguro de HOGAR: m², año, uso desde la referencia
// catastral o desde la dirección) lo use sin acoplarse a las subastas.

import {
  elegirVia,
  errorCatastro,
  parcelaUnica,
  parsearCatastro,
  parsearCoordenadas,
  parsearInmueblesDnploc,
  parsearVias,
  refParcela,
  terminoBusquedaVia,
  type CoordenadasCatastro,
  type DatosCatastro,
  type InmuebleCatastro,
  type ParamsDnploc,
} from './parser.ts'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const CATASTRO = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC'
const CATASTRO_COORD = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC'
const CATASTRO_DIR = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPLOC'
const CATASTRO_VIA = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/ConsultaVia'

async function bajar(url: string, ms = 20000, cookie?: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    signal: AbortSignal.timeout(ms),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

/**
 * 🚨 El Catastro CORTA LA CONEXIÓN cuando se le piden muchas cosas seguidas —
 * «Connection reset by peer», sin código de error ni cuerpo (comprobado el
 * 31/07/2026 encadenando consultas). Y ahora se le piden hasta CINCO por subasta
 * (callejero → DNPLOC con interior → DNPLOC sin interior → coordenadas → datos),
 * así que una pasada de 12 filas dispararía ~60 llamadas seguidas y el corte
 * dejaría el enriquecimiento a medias sin que nada lo notase.
 *
 * Dos defensas: espaciar las llamadas (cerrojo de módulo, igual que Nominatim) y
 * reintentar una vez ante fallo de RED —no ante un error HTTP legítimo, que se
 * repetiría igual—, dándole al servicio tiempo de recuperarse.
 */
const ESPERA_CATASTRO_MS = 350
const ESPERA_REINTENTO_CATASTRO_MS = 1500
let ultimaCatastro = 0
/**
 * Reserva el siguiente turno del cerrojo y espera a que llegue. `pausaExtra`
 * añade un descanso contado DESDE AHORA (para el reintento: el servicio acaba
 * de cortar y hay que darle aire, no basta con el espaciado normal).
 */
async function turnoCatastro(pausaExtra = 0): Promise<void> {
  const ahora = Date.now()
  const salida = Math.max(ahora + pausaExtra, ultimaCatastro + ESPERA_CATASTRO_MS)
  ultimaCatastro = salida
  const espera = salida - ahora
  if (espera > 0) await new Promise((r) => setTimeout(r, espera))
}
async function bajarCatastroHttp(url: string): Promise<string> {
  await turnoCatastro()
  try {
    return await bajar(url)
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    // Un HTTP 4xx/5xx es respuesta del servicio: reintentarlo no cambia nada.
    if (/^HTTP \d/.test(msg)) throw e
    // El reintento pasa por el MISMO cerrojo (con una espera más larga, que el
    // servicio acaba de cortar la conexión): saltárselo dejaría salir la
    // llamada a la vez que la siguiente que ya tuviera turno reservado —
    // justo la ráfaga que el cerrojo existe para evitar.
    await turnoCatastro(ESPERA_REINTENTO_CATASTRO_MS)
    return bajar(url)
  }
}

/**
 * Consulta el Catastro por referencia catastral. `null` si no hay dato.
 *
 * ⚠️ Solo devuelve datos del BIEN (superficie, año, uso) con la referencia
 * COMPLETA de 20 caracteres. Con la de parcela (14) el servicio responde el
 * LISTADO de inmuebles del edificio, sin bloque `<bico>`, y el parseo sale vacío
 * — comprobado el 30/07/2026. Por eso una referencia hallada por dirección en un
 * portal con varios pisos da ubicación exacta pero no datos del piso: no se sabe
 * cuál de ellos se subasta y inventarlo sería peor que no tenerlo.
 */
export async function bajarCatastro(refCatastral: string): Promise<DatosCatastro | null> {
  const xml = await bajarCatastroHttp(`${CATASTRO}?Provincia=&Municipio=&RC=${encodeURIComponent(refCatastral)}`)
  const err = errorCatastro(xml)
  if (err) {
    console.warn('[catastro]', refCatastral, err)
    return null
  }
  return parsearCatastro(xml)
}

/**
 * Coordenadas WGS84 por referencia catastral (`Consulta_CPMRC`, probado el
 * 30/07/2026). El servicio trabaja a nivel de PARCELA: acepta los 14 primeros
 * caracteres; con la referencia de 20 del bien concreto responde error.
 */
export async function bajarCoordenadas(refCatastral: string): Promise<CoordenadasCatastro | null> {
  const rc14 = refParcela(refCatastral)
  if (!rc14) return null
  const xml = await bajarCatastroHttp(`${CATASTRO_COORD}?Provincia=&Municipio=&SRS=EPSG:4326&RC=${encodeURIComponent(rc14)}`)
  return parsearCoordenadas(xml)
}

/**
 * Nombre OFICIAL de la vía según el callejero del Catastro (`ConsultaVia`).
 *
 * Se pregunta por UNA PALABRA distintiva, no por el nombre entero: el servicio
 * busca por subcadena y el Catastro reescribe los nombres a su manera —mueve los
 * artículos al final («Avenida de Madrid» → «MADRID DE») y los abrevia
 * («…de la Oliva» → «NUESTRA SEÑORA D LA OLIVA»)—, así que preguntar por el
 * nombre completo no encuentra nada. La elección final se hace por TOKENS.
 * ⚠️ La Ñ va intacta en la consulta: `CAÑAL` encuentra «CARLOS CAÑAL» y `CANAL`
 * no devuelve nada (verificado el 31/07/2026).
 */
export async function resolverNombreVia(
  provincia: string,
  municipio: string,
  sigla: string,
  calle: string,
): Promise<{ nombre: string | null; ambigua: boolean }> {
  const termino = terminoBusquedaVia(calle)
  if (!termino) return { nombre: null, ambigua: false }
  const q = new URLSearchParams({ Provincia: provincia, Municipio: municipio, TipoVia: sigla, NombreVia: termino })
  const vias = parsearVias(await bajarCatastroHttp(`${CATASTRO_VIA}?${q.toString()}`))
  const nombre = elegirVia(vias, calle)
  // Se distingue «el callejero no conoce ese término» de «hay varias vías y
  // ninguna gana»: lo segundo es el `null` DELIBERADO de `elegirVia` y quien
  // llama no puede tirar para adelante con el nombre crudo (ver abajo).
  return { nombre, ambigua: !nombre && vias.length > 0 }
}

/**
 * DIRECCIÓN → referencia catastral (`Consulta_DNPLOC`, servicio libre; probado
 * el 30/07/2026). Es lo que desbloquea la ubicación EXACTA de la mayor parte del
 * corpus: el BOE publica la dirección del inmueble pero solo a veces su
 * referencia catastral (5 de 34 subastas vigentes el 30/07/2026).
 *
 * Devuelve la referencia de PARCELA cuando todos los inmuebles del portal
 * coinciden en ella — que es el caso normal («CL PACO GANDIA 26» → 10 pisos, una
 * parcela) y basta para ubicar el edificio. Si la respuesta mezcla parcelas la
 * dirección era ambigua y se devuelve `null` en lugar de adivinar.
 */
export async function buscarRefPorDireccion(
  p: ParamsDnploc & { provincia: string; municipio: string },
): Promise<{ refParcela: string; refCompleta: string | null } | null> {
  // Paso previo obligado: el nombre oficial del callejero. `Consulta_DNPLOC` no
  // perdona («DE MADRID» no existe; está archivada como «MADRID DE»).
  //
  // 🚨 Si el callejero devuelve VARIAS vías y ninguna gana, `elegirVia` responde
  // `null` a propósito —«ubicar en la calle equivocada es peor que no ubicar»— y
  // aquí se ABANDONA. Seguir con el nombre crudo tiraría por tierra esa
  // decisión, y lo que sale de aquí no es un pin y ya está: se persiste en
  // `ref_catastral` (con `COALESCE`, o sea para siempre) y de ella salen los m²
  // con los que se valora la subasta.
  const via = await resolverNombreVia(p.provincia, p.municipio, p.sigla, p.calle)
    .catch(() => ({ nombre: null, ambigua: false }))
  if (via.ambigua) return null
  // Sin candidatas (o con el callejero caído) se prueba el nombre del anuncio:
  // `Consulta_DNPLOC` exige coincidencia exacta, así que un nombre que no sea el
  // oficial no devuelve otra finca — devuelve vacío.
  const calle = via.nombre ?? p.calle

  const consultar = async (interior: boolean) => {
    const q = new URLSearchParams({
      Provincia: p.provincia,
      Municipio: p.municipio,
      Sigla: p.sigla,
      Calle: calle,
      Numero: p.numero,
      Bloque: interior ? p.bloque ?? '' : '',
      Escalera: interior ? p.escalera ?? '' : '',
      Planta: interior ? p.planta ?? '' : '',
      Puerta: interior ? p.puerta ?? '' : '',
    })
    return parsearInmueblesDnploc(await bajarCatastroHttp(`${CATASTRO_DIR}?${q.toString()}`))
  }

  // 1º con el INTERIOR, que es lo que identifica el piso concreto y devuelve su
  // referencia de 20 (y con ella m², año y uso del bien, no solo del edificio).
  // Además desbloquea los portales cuyos inmuebles se reparten entre VARIAS
  // parcelas, donde la consulta sin interior es ambigua y no ubica nada
  // («CL CHAROLISTAS 4»: 21 inmuebles, varias parcelas).
  const hayInterior = !!(p.bloque || p.escalera || p.planta || p.puerta)
  if (hayInterior) {
    const exactos = await consultar(true).catch(() => [])
    const parcela = parcelaUnica(exactos)
    if (parcela) {
      return { refParcela: parcela, refCompleta: exactos.length === 1 ? exactos[0].refCompleta : null }
    }
    // El formato del interior no siempre casa («4» vs «04», «IZ» vs «A»): si no
    // encuentra nada, se reintenta sin él antes de rendirse.
  }

  const inmuebles = await consultar(false)
  const parcela = parcelaUnica(inmuebles)
  if (!parcela) return null
  // La referencia COMPLETA solo se da por buena si el portal tiene un único
  // inmueble; con varios no se sabe cuál es y el dato sería inventado.
  return { refParcela: parcela, refCompleta: inmuebles.length === 1 ? inmuebles[0].refCompleta : null }
}

/**
 * Los inmuebles de un portal, para que UNA PERSONA elija el piso.
 *
 * Es la pieza que le falta a `buscarRefPorDireccion` para el seguro de hogar:
 * allí, con varios pisos en el portal, se devuelve la parcela y se renuncia al
 * bien concreto (no se sabe cuál se subasta). En hogar sí se sabe — el cliente
 * vive en él — así que se le enseñan planta y puerta y elige. Con 2 o más
 * candidatos NO se elige aquí: decide una persona (misma regla que el
 * emparejamiento de versiones de vehículo).
 *
 * Devuelve `null` cuando el callejero da la vía por AMBIGUA (varias vías y
 * ninguna gana): seguir con el nombre crudo daría los pisos de otra calle.
 */
export async function inmueblesPorDireccion(
  p: ParamsDnploc & { provincia: string; municipio: string },
): Promise<{ via: string; inmuebles: InmuebleCatastro[] } | null> {
  const via = await resolverNombreVia(p.provincia, p.municipio, p.sigla, p.calle)
    .catch(() => ({ nombre: null, ambigua: false }))
  if (via.ambigua) return null
  const calle = via.nombre ?? p.calle
  const q = new URLSearchParams({
    Provincia: p.provincia,
    Municipio: p.municipio,
    Sigla: p.sigla,
    Calle: calle,
    Numero: p.numero,
    Bloque: p.bloque ?? '',
    Escalera: p.escalera ?? '',
    Planta: p.planta ?? '',
    Puerta: p.puerta ?? '',
  })
  const inmuebles = parsearInmueblesDnploc(await bajarCatastroHttp(`${CATASTRO_DIR}?${q.toString()}`))
  return { via: calle, inmuebles }
}
