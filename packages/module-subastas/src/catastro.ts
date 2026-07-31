// ────────────────────────────────────────────────────────────────────────────
// Parseo PURO de la respuesta del Catastro (servicios web LIBRES de la Sede
// Electrónica, sin registro ni clave).
//
// Endpoint que FUNCIONA (probado el 28/07/2026):
//   https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx
//     /Consulta_DNPRC?Provincia=&Municipio=&RC=<referencia>
// Devuelve XML. Ojo: el endpoint REST `/json/…` de la documentación responde
// 400 y sin User-Agent de navegador la conexión se corta — ambas cosas están
// contempladas en el adaptador de la app.
//
// ⚠️ LO QUE ESTE SERVICIO **NO** DA: el VALOR DE REFERENCIA, que es la base
// imponible del ITP desde 2022. Es dato protegido y exige certificado digital,
// así que el coste sigue estimándose sobre el remate y `costes.ts` deja su
// aviso. No hay forma automática y gratuita de obtenerlo.
// ────────────────────────────────────────────────────────────────────────────

import { decodificarHtml } from './email-boe.ts'
import { norm } from './parsing.ts'

/** Datos catastrales de una finca. Todo opcional: no siempre están publicados. */
export interface DatosCatastro {
  /** Dirección oficial completa («CL VIRGEN MILAGROS 83 Es:1 Pl:02 …»). */
  direccion: string | null
  /** Superficie construida en m², según Catastro. */
  superficie: number | null
  anioConstruccion: number | null
  /** Uso principal: Residencial, Comercial, Industrial… */
  uso: string | null
  /** Coeficiente de participación en la propiedad horizontal, en %. */
  cuotaParticipacion: number | null
  /** `UR` urbana · `RU` rústica. */
  clase: string | null
  provincia: string | null
  municipio: string | null
  codigoPostal: string | null
}

function etiqueta(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  if (!m) return null
  const v = decodificarHtml(m[1].trim())
  return v || null
}

function numero(xml: string, tag: string): number | null {
  const v = etiqueta(xml, tag)
  if (v == null) return null
  // El Catastro usa coma decimal («3,080000»).
  const n = Number(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Convierte el XML de `Consulta_DNPRC` en datos utilizables. */
export function parsearCatastro(xml: string): DatosCatastro {
  if (!xml) return vacio()
  // El bloque <bico> es el del bien concreto; si no está, se lee el documento.
  const b = xml.match(/<bico>[\s\S]*?<\/bico>/i)?.[0] ?? xml

  const cuota = numero(b, 'cpt')
  return {
    direccion: etiqueta(b, 'ldt'),
    superficie: numero(b, 'sfc'),
    anioConstruccion: (() => {
      const n = numero(b, 'ant')
      // Un año fuera de rango es dato corrupto, no una finca medieval.
      return n != null && n >= 1000 && n <= 2100 ? Math.trunc(n) : null
    })(),
    uso: etiqueta(b, 'luso'),
    // 100 % = finca completa, no una cuota de propiedad horizontal.
    cuotaParticipacion: cuota != null && cuota < 100 ? Math.round(cuota * 100) / 100 : null,
    clase: etiqueta(b, 'cn'),
    provincia: etiqueta(b, 'np'),
    municipio: etiqueta(b, 'nm'),
    codigoPostal: etiqueta(b, 'dp'),
  }
}

function vacio(): DatosCatastro {
  return {
    direccion: null, superficie: null, anioConstruccion: null, uso: null,
    cuotaParticipacion: null, clase: null, provincia: null, municipio: null,
    codigoPostal: null,
  }
}

/** ¿La respuesta indica error del servicio (referencia inexistente, etc.)? */
export function errorCatastro(xml: string): string | null {
  const des = xml.match(/<des>([\s\S]*?)<\/des>/i)?.[1]?.trim()
  return des ? decodificarHtml(des) : null
}

// ── Coordenadas por referencia catastral (Consulta_CPMRC) ───────────────────
// Servicio hermano del de arriba, mismo host y también libre:
//   …/OVCCoordenadas.asmx/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:4326&RC=<rc14>
// Con SRS=EPSG:4326, <xcen> es la LONGITUD y <ycen> la LATITUD (en ese orden,
// que es el que despista). Acepta la referencia de la PARCELA (14 caracteres);
// el recorte de los 20 a 14 lo hace el adaptador de la app.

export interface CoordenadasCatastro {
  lat: number
  lon: number
}

/**
 * Referencia catastral de PARCELA: los 14 primeros caracteres. Es la que acepta
 * `Consulta_CPMRC` (con los 20 del bien concreto responde «LA REFERENCIA
 * CATASTRAL DEBE SER DE 14 POSICIONES», comprobado el 30/07/2026) y la que
 * ubica el EDIFICIO, que es lo que se pinta en el mapa.
 */
export function refParcela(rc?: string | null): string | null {
  const limpia = (rc ?? '').replace(/[\s-]/g, '').toUpperCase()
  return limpia.length >= 14 ? limpia.slice(0, 14) : null
}

/** Dirección postal del Catastro, ya separada en piezas utilizables. */
export interface DireccionCatastro {
  /** Lista para buscar en un mapa: «AV PEDRO ROMERO 2, 41007 SEVILLA». */
  postal: string
  escalera: string | null
  planta: string | null
  puerta: string | null
}

/**
 * Convierte el `ldt` del Catastro en algo que un humano y un buscador de mapas
 * entiendan. El formato de origen es denso y con ruido:
 *   «AV PEDRO ROMERO (DE) 2 Es:1 Pl:07 Pt:B 41007 SEVILLA»
 * y de ahí sale `postal` = «AV PEDRO ROMERO 2, 41007 SEVILLA» (Google resuelve
 * el PORTAL y ofrece Street View; con lat/lon crudas solo pone un pin anónimo
 * en mitad de la manzana — la queja de Alberto del 30/07/2026).
 *
 * El `(DE)` y compañía son artículos que el Catastro intercala en el nombre de
 * la vía y que ningún buscador reconoce; se quitan.
 */
export function direccionCatastro(ldt?: string | null): DireccionCatastro | null {
  const t = (ldt ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return null

  const trozo = (re: RegExp): string | null => {
    const m = t.match(re)
    const v = m?.[1]?.trim()
    return v ? v : null
  }
  const escalera = trozo(/\bEs:\s*([^\s]+)/i)
  const planta = trozo(/\bPl:\s*([^\s]+)/i)
  const puerta = trozo(/\bPt:\s*([^\s]+)/i)

  // La parte de calle+número es todo lo anterior a Es:/Pl:/Pt:; el CP y el
  // municipio van al final y se conservan (ayudan a desambiguar la vía).
  const sinInterior = t.replace(/\b(Es|Pl|Pt|Bq):\s*[^\s]+/gi, ' ').replace(/\s+/g, ' ').trim()
  const postal = sinInterior
    // Artículos que el Catastro mete entre paréntesis dentro del nombre de la vía.
    .replace(/\((?:DE|DEL|DE LA|DE LOS|DE LAS|LA|EL|LOS|LAS)\)/gi, ' ')
    // El municipio duplicado entre paréntesis al final: «SEVILLA (SEVILLA)».
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Coma antes del código postal, para que el buscador separe vía de localidad.
    .replace(/\s(\d{5})\s/, ', $1 ')

  return postal ? { postal, escalera, planta, puerta } : null
}

/** Un inmueble devuelto por `Consulta_DNPLOC` (búsqueda por dirección). */
export interface InmuebleCatastro {
  /** Referencia completa de 20 caracteres del bien concreto. */
  refCompleta: string
  /** Referencia de parcela (14) — la que ubica el edificio. */
  refParcela: string
  planta: string | null
  puerta: string | null
  codigoPostal: string | null
}

/**
 * Parsea `Consulta_DNPLOC` — el servicio LIBRE que resuelve DIRECCIÓN →
 * referencia catastral. Es lo que permite ubicar con exactitud las subastas que
 * el BOE publica con dirección pero SIN referencia catastral (la mayoría del
 * corpus: 29 de 34 el 30/07/2026).
 *
 * Un portal suele devolver VARIOS inmuebles (10 en «CL PACO GANDIA 26»): todos
 * comparten la parcela, así que el punto del mapa es el mismo y no hace falta
 * acertar el piso exacto para ubicar el edificio.
 */
export function parsearInmueblesDnploc(xml: string): InmuebleCatastro[] {
  if (!xml || errorCatastro(xml)) return []
  const bloques = xml.match(/<rcdnp>[\s\S]*?<\/rcdnp>/gi) ?? []
  const salida: InmuebleCatastro[] = []
  for (const b of bloques) {
    const pc1 = etiqueta(b, 'pc1')
    const pc2 = etiqueta(b, 'pc2')
    if (!pc1 || !pc2) continue
    const car = etiqueta(b, 'car') ?? ''
    const cc1 = etiqueta(b, 'cc1') ?? ''
    const cc2 = etiqueta(b, 'cc2') ?? ''
    const parcela = `${pc1}${pc2}`
    if (parcela.length !== 14) continue
    salida.push({
      refCompleta: `${parcela}${car}${cc1}${cc2}`,
      refParcela: parcela,
      // `pt` 00 = planta baja en la codificación del Catastro; se deja tal cual.
      planta: etiqueta(b, 'pt'),
      puerta: etiqueta(b, 'pu'),
      codigoPostal: etiqueta(b, 'dp'),
    })
  }
  return salida
}

/**
 * Parcela común a todos los inmuebles de una respuesta DNPLOC. `null` si la
 * respuesta mezcla parcelas (dirección ambigua): en ese caso NO se elige una a
 * dedo, porque ubicaría el inmueble en el edificio equivocado.
 */
export function parcelaUnica(inmuebles: InmuebleCatastro[]): string | null {
  const parcelas = new Set(inmuebles.map((i) => i.refParcela))
  return parcelas.size === 1 ? [...parcelas][0] : null
}

/**
 * Tipo de vía → sigla del Catastro. El servicio DNPLOC no entiende «AVENIDA»,
 * quiere «AV». Sin sigla reconocida no se consulta (mejor no ubicar que ubicar
 * en la calle equivocada de otro municipio).
 */
const SIGLAS: Array<[RegExp, string]> = [
  [/^(av|avd|avda|avenida)\b/i, 'AV'],
  [/^(c|c\/|cl|calle)\b/i, 'CL'],
  [/^(pz|pza|plaza)\b/i, 'PZ'],
  [/^(ps|paseo)\b/i, 'PS'],
  [/^(cr|ctra|carretera)\b/i, 'CR'],
  [/^(cm|camino)\b/i, 'CM'],
  [/^(tr|travesia)\b/i, 'TR'],
  [/^(rd|ronda)\b/i, 'RD'],
  [/^(gl|glorieta)\b/i, 'GL'],
  [/^(ur|urb|urbanizacion)\b/i, 'UR'],
  [/^(pg|pol|poligono)\b/i, 'PG'],
  [/^(bo|barrio)\b/i, 'BO'],
  [/^(lg|lugar)\b/i, 'LG'],
]

/** Parámetros de `Consulta_DNPLOC` deducidos de una dirección en texto libre. */
export interface ParamsDnploc {
  sigla: string
  calle: string
  numero: string
  /** Datos de interior, cuando el anuncio los publica. Acotan al PISO exacto. */
  bloque?: string | null
  escalera?: string | null
  planta?: string | null
  puerta?: string | null
}

/**
 * Normaliza CONSERVANDO LA Ñ. `norm()` la convierte en «N» y eso rompe la
 * búsqueda en el callejero del Catastro: verificado el 31/07/2026 que
 * `NombreVia=CAÑAL` encuentra «CARLOS CAÑAL» y `NombreVia=CANAL` **no devuelve
 * nada**. La Ñ solo se pierde al COMPARAR (ahí conviene, para tolerar las dos
 * grafías), nunca al preguntar.
 */
export function normVia(s: string): string {
  // La ñ se aparta ANTES de barrer los diacríticos y se repone después: en NFD
  // una ñ es «n + tilde combinante», así que el barrido se la llevaría.
  const RESGUARDO = '\u0001'
  return s
    .replace(/[ñÑ]/g, RESGUARDO)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(new RegExp(RESGUARDO, 'g'), 'Ñ')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Palabras que no distinguen una vía de otra. */
const VACIAS = new Set(['DE', 'DEL', 'D', 'LA', 'LAS', 'EL', 'LOS', 'Y', 'A', 'EN'])

/** Tokens con los que se compara un nombre de vía (sin artículos ni Ñ). */
export function tokensVia(nombre: string): string[] {
  return norm(nombre)
    .toUpperCase()
    .split(/[^A-Z0-9Ñ]+/i)
    .filter((t) => t && !VACIAS.has(t))
}

/**
 * Término con el que preguntar al callejero. **El servicio busca por SUBCADENA**
 * (verificado: `OLIVA` encuentra «NUESTRA SEÑORA D LA OLIVA»), así que se manda
 * UNA palabra distintiva en vez del nombre entero: el Catastro abrevia por su
 * cuenta —«DE» → «D»— y cualquier comparación literal del nombre completo falla.
 * Se elige la palabra más larga que no sea artículo, con la Ñ intacta.
 */
export function terminoBusquedaVia(calle: string): string {
  const palabras = normVia(calle)
    .split(/[^A-ZÑ0-9]+/i)
    .filter((p) => p.length > 1 && !VACIAS.has(norm(p).toUpperCase()))
  if (!palabras.length) return normVia(calle)
  return palabras.reduce((mejor, p) => (p.length > mejor.length ? p : mejor), palabras[0])
}

/**
 * Nombres de vía del callejero oficial (`ConsultaVia`), que busca por SUBCADENA.
 * Hace falta porque `Consulta_DNPLOC` exige el nombre EXACTO como lo guarda el
 * Catastro, y ese formato es impredecible: mueve los artículos al final
 * («Avenida de Madrid» → **«MADRID DE»**) y además ABREVIA por su cuenta
 * («Ronda de Nuestra Señora de la Oliva» → **«NUESTRA SEÑORA D LA OLIVA»**, con
 * «DE» reducido a «D» — visto el 31/07/2026). Por eso nunca se compara el nombre
 * completo: se pregunta por una palabra distintiva y se elige por tokens.
 */
export function parsearVias(xml: string): Array<{ tipo: string; nombre: string }> {
  if (!xml || errorCatastro(xml)) return []
  const bloques = xml.match(/<calle>[\s\S]*?<\/calle>/gi) ?? xml.match(/<dir>[\s\S]*?<\/dir>/gi) ?? []
  const vias: Array<{ tipo: string; nombre: string }> = []
  for (const b of bloques) {
    const nombre = etiqueta(b, 'nv')?.replace(/\s+/g, ' ').trim()
    const tipo = etiqueta(b, 'tv')?.trim()
    if (nombre) vias.push({ tipo: tipo ?? '', nombre })
  }
  return vias
}

/**
 * Elige el nombre OFICIAL entre los candidatos del callejero comparando TOKENS,
 * no cadenas: es la única forma de casar «PACO GANDÍA» con «PACO GANDIA» y
 * «Nuestra Señora de la Oliva» con «NUESTRA SEÑORA D LA OLIVA» a la vez.
 *
 * Gana la vía que contiene TODOS los tokens significativos de la buscada (los
 * artículos y la Ñ se ignoran al comparar). Si empatan varias —«GANDIA» devuelve
 * «CIUDAD DE GANDIA» y «PACO GANDIA»— desempata la que menos palabras sobrantes
 * tenga; si ni así hay una ganadora clara, `null`: ubicar en la calle equivocada
 * es peor que no ubicar.
 */
export function elegirVia(vias: Array<{ tipo: string; nombre: string }>, buscada: string): string | null {
  if (!vias.length) return null
  const objetivo = tokensVia(buscada)
  if (!objetivo.length) return vias.length === 1 ? vias[0].nombre : null

  const candidatas = vias
    .map((v) => ({ nombre: v.nombre, tokens: tokensVia(v.nombre) }))
    .filter((v) => objetivo.every((t) => v.tokens.includes(t)))
  if (!candidatas.length) return null

  candidatas.sort((a, b) => a.tokens.length - b.tokens.length)
  // Dos candidatas igual de ajustadas = ambigüedad real, no se elige a dedo.
  if (candidatas.length > 1 && candidatas[0].tokens.length === candidatas[1].tokens.length) return null
  return candidatas[0].nombre
}

/**
 * Traduce la dirección tal como la publica el BOE a los parámetros de
 * `Consulta_DNPLOC`. Ejemplos reales del corpus:
 *   «AVENIDA PEDRO ROMERO Nº 2, planta séptima de la casa número…»
 *      → { sigla:'AV', calle:'PEDRO ROMERO', numero:'2' }
 *   «C/ PACO GANDÍA 26» → { sigla:'CL', calle:'PACO GANDIA', numero:'26' }
 *
 * Conserva la Ñ (`normVia`) porque el callejero la exige, y corta la coleta
 * descriptiva que el registro añade tras el número. `null` cuando no hay sigla o
 * número reconocibles: sin ambos la consulta devolvería cualquier cosa.
 *
 * Extrae además el INTERIOR (escalera/planta/puerta) cuando el anuncio lo
 * publica. No es un adorno: acota la consulta al PISO exacto y con ello se
 * obtiene la referencia de 20 —y por tanto los m², año y uso del bien— en vez de
 * la de parcela. En «CL. CHAROLISTAS, 4, ESC.1 PLANTA 4, PUERTA B» el portal
 * tiene 21 inmuebles repartidos en VARIAS parcelas, así que sin el interior no
 * se podía ni ubicar (comprobado el 31/07/2026).
 */
export function paramsDnploc(direccion?: string | null): ParamsDnploc | null {
  const bruto = (direccion ?? '').trim()
  if (!bruto) return null

  // ⚠️ NO se corta por la primera coma: en español el número del portal va
  // justo DETRÁS de ella («CALLE ALPECHÍN, 41», «AVDA. PABLO IGLESIAS, 24»), y
  // cortar ahí dejaba la dirección sin número y sin consulta posible (fallaba en
  // 10 de 16 direcciones reales del corpus, 30/07/2026).
  const cabeza = normVia(bruto)
    // «Nº 2» / «núm. 2» / «numero 2» → el número queda suelto. Se usa lookahead
    // porque `º` no es carácter de palabra y un `\b` detrás nunca casaría.
    .replace(/\bN(?:[º°O]|UM(?:ERO)?)\.?(?=\s|\d|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cabeza) return null

  let sigla: string | null = null
  let resto = cabeza
  for (const [re, s] of SIGLAS) {
    const m = resto.match(re)
    if (m) {
      sigla = s
      resto = resto.slice(m[0].length).replace(/^[\s.,/]+/, '')
      break
    }
  }
  if (!sigla) return null

  // El nombre de la vía acaba en la primera coma o en el primer número, lo que
  // llegue antes: «CASTILLO DE LA SERREZUELA 12» (sin coma) y «PACO GANDÍA, 26»
  // (con ella) tienen que funcionar igual.
  const finNombre = resto.search(/[,;(]|\d/)
  if (finNombre <= 0) return null
  const calle = resto.slice(0, finNombre).replace(/[^A-ZÑ0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim()
  if (!calle) return null

  // El número del portal: el primer entero tras el nombre.
  const mNum = resto.slice(finNombre).match(/\b(\d{1,4})\b/)
  if (!mNum) return null

  // Interior: «ESC.1 PLANTA 4, PUERTA B», «Es:1 Pl:07 Pt:B», «2º IZQUIERDA»…
  const cola = resto.slice(finNombre)
  const uno = (re: RegExp): string | null => cola.match(re)?.[1]?.trim() || null
  // ⚠️ Las abreviaturas de DOS letras (ES/PL/PT) exigen separador explícito
  // («Es:1», «Pl.07»). Sin él, `ES` casa con el verbo «es» —el texto va en
  // mayúsculas— y «…QUE ES DE LA FINCA…» daba `escalera='DE'`: no ubica mal
  // (el Catastro devuelve vacío) pero quema una consulta de más por fila, que
  // es justo lo que aprieta el presupuesto de la pasada.
  const puerta = uno(/\b(?:PUERTA|PTA)[:.\s]*([A-ZÑ0-9]{1,4})\b/)
    ?? uno(/\bPT[:.]\s*([A-ZÑ0-9]{1,4})\b/)
    ?? (/\bIZQ(?:UIERDA|DA)?\b/.test(cola) ? 'IZ' : /\bD(?:E)?R(?:ECHA|CHA)?\b/.test(cola) ? 'DR' : null)

  return {
    sigla,
    calle: calle.toUpperCase(),
    numero: mNum[1],
    bloque: uno(/\b(?:BLOQUE|BLQ)[:.\s]*([A-ZÑ0-9]{1,4})\b/) ?? uno(/\bBQ[:.]\s*([A-ZÑ0-9]{1,4})\b/),
    escalera: uno(/\b(?:ESCALERA|ESC)[:.\s]*([A-ZÑ0-9]{1,4})\b/) ?? uno(/\bES[:.]\s*([A-ZÑ0-9]{1,4})\b/),
    planta: uno(/\bPLANTA[:.\s]*([A-ZÑ0-9]{1,3})\b/) ?? uno(/\bPL[:.]\s*([A-ZÑ0-9]{1,3})\b/) ?? uno(/\b(\d{1,2})[º°]\s/),
    puerta,
  }
}

/**
 * Convierte el XML de `Consulta_CPMRC` en coordenadas WGS84. `null` si el
 * servicio no las da (error, referencia inexistente o respuesta corrupta) —
 * nunca devuelve un punto inventado.
 */
export function parsearCoordenadas(xml: string): CoordenadasCatastro | null {
  if (!xml || errorCatastro(xml)) return null
  // A diferencia de <sfc>/<cpt>, aquí el decimal viene con PUNTO («-6.2334177»):
  // el `numero()` de arriba (que quita puntos de millar) lo destrozaría.
  const lon = Number(xml.match(/<xcen>([\s\S]*?)<\/xcen>/i)?.[1]?.trim())
  const lat = Number(xml.match(/<ycen>([\s\S]*?)<\/ycen>/i)?.[1]?.trim())
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  // Un (0,0) o un valor fuera de rango es dato corrupto, no una finca en el golfo de Guinea.
  if (lat === 0 && lon === 0) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  // 🚨 Y tiene que caer en ESPAÑA. El Catastro solo cataloga fincas españolas,
  // así que un punto fuera de la caja (incluidas Canarias, Ceuta y Melilla) es
  // basura — y el modo típico de equivocarse aquí es CRUZAR los ejes (`xcen` es
  // la LONGITUD), que da coordenadas perfectamente válidas… en Rusia. Sin este
  // filtro ese punto se guardaría con `geo_precision='catastro'` y se enseñaría
  // como «ubicación exacta».
  if (lat < 27 || lat > 44 || lon < -19 || lon > 5) return null
  return { lat, lon }
}

/**
 * Superficie con la que valorar el inmueble: la del CATASTRO manda sobre la que
 * publica el anuncio.
 *
 * POR QUÉ el Catastro primero: es la oficial y es la que usa el cálculo del
 * €/m² de mercado. Si el scoring usara la registral y la referencia la
 * catastral, el valor estimado saldría con dos superficies distintas (El Puerto
 * de Santa María: 115,66 m² en el registro, 112 m² en el Catastro).
 *
 * Un 0 cuenta como AUSENTE — el Catastro devuelve 0 en fincas sin construcción,
 * y valorar un piso a 0 m² daría 0 € de valor, que es peor que no valorar.
 */
export function superficieUtil(catastro?: number | null, anuncio?: number | null): number | null {
  for (const v of [catastro, anuncio]) {
    if (v != null && Number.isFinite(v) && v > 0) return v
  }
  return null
}
