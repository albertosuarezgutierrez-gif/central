// ────────────────────────────────────────────────────────────────────────────
// Enriquecimiento de una subasta: ficha del Portal del BOE + Catastro.
// Aquí va SOLO la red; el parseo es puro (`@central/module-subastas`).
//
// Notas de campo (probadas contra los servicios reales el 28/07/2026):
//   · Ambos hosts rechazan la conexión sin un User-Agent de navegador.
//   · El endpoint REST `/json/` del Catastro devuelve 400; el que funciona es
//     el `.asmx` que responde XML.
//   · La ficha del BOE son 3 pestañas (`&ver=2` autoridad, `&ver=3` bien); la
//     general no lleva parámetro.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  elegirVia,
  errorCatastro,
  fichaLegible,
  parcelaUnica,
  parsearVias,
  terminoBusquedaVia,
  parsearCatastro,
  parsearCoordenadas,
  parsearFichaBoe,
  parsearInmueblesDnploc,
  refParcela,
  type CoordenadasCatastro,
  type ParamsDnploc,
  type DatosCatastro,
  type FichaBoe,
  mejorPujaDeFicha,
  paresFicha,
  resultadoDeFicha,
} from '@central/module-subastas'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const FICHA = 'https://subastas.boe.es/detalleSubasta.php'
const CATASTRO = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC'
const CATASTRO_COORD = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC'
const CATASTRO_DIR = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPLOC'
const CATASTRO_VIA = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/ConsultaVia'

async function bajar(url: string, ms = 20000): Promise<string> {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml' },
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
 * Descarga y parsea las tres pestañas de la ficha de una subasta.
 *
 * 🚨 Un HTTP 200 que NO sea la ficha (mantenimiento del Portal, muro de un WAF,
 * página de error) es lo más peligroso que puede pasar aquí: `parsearFichaBoe`
 * nunca lanza —devuelve todos los campos a `null`— y quien llama no distingue
 * «la subasta no publica tipo» de «no he podido leer la ficha». El cron
 * escribiría esos nulls encima de las cifras buenas del corpus y marcaría
 * `enriquecida_at`, así que el estropicio duraría 24 h sin que nada lo notase.
 * Por eso se valida ANTES de parsear y se lanza: la fila queda intacta y vuelve
 * a la cola en la pasada siguiente. Misma guarda que `documentos.ts`.
 */
export async function bajarFicha(identificador: string): Promise<FichaBoe> {
  const base = `${FICHA}?idSub=${encodeURIComponent(identificador)}`
  // Las pestañas secundarias son un extra: si fallan, la general ya trae las
  // cifras, que es lo que desbloquea el scoring.
  const [general, bien, autoridad] = await Promise.all([
    bajar(base),
    bajar(`${base}&ver=3`).catch(() => ''),
    bajar(`${base}&ver=2`).catch(() => ''),
  ])
  if (!fichaLegible(general, identificador)) {
    throw new Error('la respuesta del Portal no es la ficha de esta subasta')
  }
  return parsearFichaBoe(general, bien, autoridad)
}

/**
 * Mejor puja EN VIVO de una subasta abierta: solo la pestaña general (una
 * llamada, no tres — esto se consulta a diario para cada seguida cerca del
 * cierre). Lanza si la respuesta no es la ficha, igual que `bajarFicha`;
 * `null` = la ficha no publica la puja, que NO es «sin pujas».
 */
export async function mejorPujaViva(identificador: string): Promise<number | null> {
  const general = await bajar(`${FICHA}?idSub=${encodeURIComponent(identificador)}`)
  if (!fichaLegible(general, identificador)) {
    throw new Error('la respuesta del Portal no es la ficha de esta subasta')
  }
  return mejorPujaDeFicha(paresFicha(general))
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
    console.warn('[subastas/catastro]', refCatastral, err)
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
  // inmueble; con varios no se sabe cuál se subasta y el dato sería inventado.
  return { refParcela: parcela, refCompleta: inmuebles.length === 1 ? inmuebles[0].refCompleta : null }
}

/**
 * Nominatim exige **≤1 petición/segundo** y lo hace cumplir BLOQUEANDO LA IP —
 * y la IP sería la de Vercel, compartida por todo lo demás. No basta con que el
 * cron vaya en serie: las filas que solo se geocodifican (fuentes sin ficha en
 * el BOE) no pagan ninguna otra latencia, así que saldrían seguidas. Este
 * cerrojo de módulo serializa y espacia TODAS las llamadas del proceso.
 */
const ESPERA_NOMINATIM_MS = 1100
let ultimaNominatim = 0
async function esperarTurnoNominatim(): Promise<void> {
  const ahora = Date.now()
  const espera = Math.max(0, ultimaNominatim + ESPERA_NOMINATIM_MS - ahora)
  // Se reserva el turno ANTES de esperar: dos llamadas concurrentes se ponen en
  // cola una detrás de otra en vez de dormir lo mismo y salir a la vez.
  ultimaNominatim = ahora + espera
  if (espera > 0) await new Promise((r) => setTimeout(r, espera))
}

/**
 * Centro del municipio por Nominatim (OSM, gratis). Es el escalón APROXIMADO
 * para las subastas sin referencia catastral (la mayoría del corpus): mejor un
 * pin honesto en el centro del pueblo que un mapa con el 15% de los inmuebles.
 * Quien lo pinte debe declarar la imprecisión (columna `geo_precision`).
 *
 * Verificado el 30/07/2026: el servicio responde 200 desde infraestructura
 * cloud (probado con `pg_net` desde Supabase). Respeta el límite de 1 req/s.
 */
export async function geocodificarMunicipio(
  municipio: string,
  provincia?: string | null,
): Promise<CoordenadasCatastro | null> {
  const q = [municipio.trim(), provincia?.trim(), 'España'].filter(Boolean).join(', ')
  await esperarTurnoNominatim()
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=es&q=${encodeURIComponent(q)}`,
    { headers: { 'User-Agent': 'central-subastas/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(15000), cache: 'no-store' },
  )
  if (!r.ok) return null
  const j = (await r.json().catch(() => null)) as Array<{ lat?: string; lon?: string }> | null
  const lat = Number(j?.[0]?.lat)
  const lon = Number(j?.[0]?.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null
  return { lat, lon }
}

// ── Captura del RESULTADO tras la conclusión ─────────────────────────────────

/**
 * Revisa las subastas recién concluidas y captura el resultado (adjudicada /
 * desierta / cancelada) y la mejor puja si la ficha la publica. Con meses de
 * esto se calibra el scoring con realidad: a qué % del valor de subasta se
 * adjudica de verdad en cada zona.
 *
 * OJO: la ficha de una subasta ABIERTA no publica estado (verificado 28/07);
 * el marcado de una CONCLUIDA aún no se ha podido ver, así que el parser
 * (`resultadoDeFicha`) es defensivo — si no reconoce nada deja la fila
 * pendiente y aquí se loguean las claves vistas para ajustar el parser con la
 * primera conclusión real (03/08/2026, El Puerto).
 */
export async function capturarResultados(max = 20): Promise<{ revisadas: number; capturadas: number }> {
  const filas = await prisma.$queryRaw<Array<{ dedupe_key: string; identificador: string }>>(Prisma.sql`
    SELECT dedupe_key, identificador FROM subastas
    WHERE es_inmueble = true
      AND resultado IS NULL
      AND fecha_fin IS NOT NULL
      AND fecha_fin < now() - interval '6 hours'
      AND fecha_fin > now() - interval '60 days'
    ORDER BY fecha_fin DESC
    LIMIT ${max}
  `)

  let capturadas = 0
  for (const f of filas) {
    try {
      const html = await bajar(`${FICHA}?idSub=${encodeURIComponent(f.identificador)}`)
      // Misma cautela que en `bajarFicha`: sin esto, una página de error del
      // Portal daría `pares` vacío y se registraría como «sin estado
      // reconocible», ensuciando el log que sirve para ajustar el parser.
      if (!fichaLegible(html, f.identificador)) throw new Error('la respuesta del Portal no es la ficha')
      const pares = paresFicha(html)
      const res = resultadoDeFicha(pares)
      if (!res) {
        // La materia prima para ajustar el parser con la primera real.
        console.log('[subastas-resultado] sin estado reconocible en', f.identificador, 'claves:', [...pares.keys()].slice(0, 20).join(' | '))
        continue
      }
      await prisma.$executeRaw(Prisma.sql`
        UPDATE subastas SET resultado = ${res.resultado},
          importe_adjudicacion = ${res.importe}, actualizado_en = now()
        WHERE dedupe_key = ${f.dedupe_key}
      `)
      capturadas++
    } catch (e) {
      console.error('[subastas-resultado]', f.identificador, e)
    }
  }
  return { revisadas: filas.length, capturadas }
}
