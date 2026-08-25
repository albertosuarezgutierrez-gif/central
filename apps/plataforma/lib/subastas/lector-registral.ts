// ────────────────────────────────────────────────────────────────────────────
// LECTOR REGISTRAL: convierte los documentos de una ficha del BOE en un cuadro
// de cargas estructurado. Aquí va la RED y la IMAGEN; la lógica es pura
// (`@central/module-subastas`).
//
// Tres caminos según lo que traiga el documento:
//   1. PDF con capa de texto  → se lee el texto y lo interpreta la IA de texto.
//   2. PDF escaneado          → se extraen los JPEG embebidos, se recomponen las
//                               bandas en páginas con sharp y las lee un modelo
//                               de VISIÓN.
//   3. Imagen suelta (jpg/png)→ directa al modelo de visión.
//
// Modelo: lo elige el Director por la categoría `registral` del catálogo
// (`elegirPorCategoria`, determinista y sin pagar el hop del decisor). Si el
// catálogo aún no la ofrece, la pasarela sirve su modelo por defecto — degrada,
// no rompe.
//
// Doble lectura: Alberto decidió (30/07/2026) que la IA extraiga las cifras. Para
// que un dígito mal leído no acabe en una puja, cada documento se lee DOS veces y
// `consensoCuadros` anula todo importe en el que las dos lecturas no coincidan.
// ────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp'
import {
  agruparBandas,
  consensoCuadros,
  dimensionesJpeg,
  extraerJson,
  fusionarCargas,
  localizarJpegs,
  normalizarCuadroCargas,
  pareceEscaneado,
  PROMPT_LECTOR_REGISTRAL,
  type BandaAgrupable,
  type CuadroCargas,
} from '@central/module-subastas'
import type { ImageInput } from '@central/core-ai'
import { rasterizarPdf } from '@/lib/subastas/rasterizar-pdf'
import { aiVision } from '@/lib/ai-client'
import { chatConDirector } from '@/lib/pasarela'
import { elegirPorCategoria } from '@/lib/ia-director'

/** Alto máximo de la imagen que se manda al modelo: más y el texto se pierde al reescalar. */
const ALTO_PAGINA = 3000
/** Techo de páginas por documento: una certificación cabe de sobra; evita facturas sorpresa. */
const MAX_PAGINAS = 12
/**
 * 🚨 UNA imagen por llamada. No es una preferencia: `llama-3.2-90b-vision` de
 * NIM —el suplente gratis— rechaza con HTTP 400 cualquier petición con más de
 * una («At most 1 image(s) may be provided in one request»), y con 4 páginas de
 * 3.000 px el payload además se pasaba del tope de 25 MB. Las dos cosas
 * dejaron la validación de producción del 30/07/2026 con CERO cargas, que es
 * justo lo que se lee como «finca limpia».
 */
const IMAGENES_POR_LLAMADA = 1
/**
 * Calidad JPEG de la página. El PNG sin pérdida de una página escaneada ronda
 * los 6-8 MB; en JPEG 82 baja a ~600 KB y el texto registral sigue siendo
 * perfectamente legible para el modelo. Es lo que mantiene el payload lejos del
 * tope del proveedor.
 */
const CALIDAD_JPEG = 82

export interface LecturaDocumento {
  cuadro: CuadroCargas
  /** Cómo se leyó, para poder auditar después. */
  via: 'texto' | 'vision'
  paginas: number
  discrepancias: string[]
  modelo: string | null
}

/**
 * Recompone las páginas de un PDF escaneado. Devuelve JPEG en base64, listos
 * para el modelo de visión. `[]` si el PDF no lleva imágenes aprovechables.
 *
 * Por qué hay que agrupar: los escáneres guardan cada página como decenas de
 * bandas horizontales (263 para 11 páginas en el caso real de Belmonte). Una
 * banda suelta es ilegible, y mandarlas de una en una multiplicaría el coste.
 */
export async function paginasDePdfEscaneado(pdf: Buffer): Promise<ImageInput[]> {
  const jpegs = localizarJpegs(pdf)
  if (!jpegs.length) return []

  // Medir cada JPEG sin decodificarlo (basta su cabecera SOF).
  const bandas: BandaAgrupable[] = []
  for (const [indice, j] of jpegs.entries()) {
    const dim = dimensionesJpeg(pdf.subarray(j.inicio, j.fin))
    if (dim) bandas.push({ indice, ...dim })
  }
  if (!bandas.length) return []

  const grupos = agruparBandas(bandas, ALTO_PAGINA).slice(0, MAX_PAGINAS)
  const paginas: ImageInput[] = []

  for (const grupo of grupos) {
    const ancho = grupo[0].ancho
    const alto = grupo.reduce((s, b) => s + b.alto, 0)
    let y = 0
    const composicion = grupo.map((b) => {
      const j = jpegs[b.indice]
      const item = { input: pdf.subarray(j.inicio, j.fin), top: y, left: 0 }
      y += b.alto
      return item
    })
    try {
      const jpg = await sharp({ create: { width: ancho, height: alto, channels: 3, background: '#ffffff' } })
        .composite(composicion)
        .jpeg({ quality: CALIDAD_JPEG, mozjpeg: true })
        .toBuffer()
      paginas.push({ mediaType: 'image/jpeg', data: jpg.toString('base64') })
    } catch (e) {
      // Una página que no compone no invalida el documento: se sigue con las demás.
      console.warn('[lector-registral] composición fallida', e)
    }
  }
  return paginas
}

/** Modelo de la categoría `registral` del catálogo del Director (o el de la pasarela). */
async function modeloRegistral(): Promise<string | undefined> {
  try {
    const eleccion = await elegirPorCategoria('registral', { app: 'subastas' })
    return eleccion.modo === 'activo' ? eleccion.model : undefined
  } catch {
    return undefined // Sin catálogo: la pasarela pone el suyo.
  }
}

/** Una pasada de lectura sobre texto. */
async function leerTexto(texto: string): Promise<CuadroCargas> {
  // Por `chatConDirector` y no por `aiComplete`: hace falta el modelo de la
  // categoría `registral` del catálogo y subir el techo de salida (un cuadro de
  // cargas con literales no cabe en los 700 tokens por defecto de la pasarela).
  //
  // 🚨 El modelo del catálogo se pide con `categoria`, NUNCA con `modelo`
  // (medido en producción, 24/08/2026): `modelo` es el PIN que salta OpenRouter
  // y se fija también en la cadena clásica, así que el id del catálogo
  // (`google/gemini-2.5-flash`, un id de OpenRouter) acababa en el API de
  // NVIDIA → «NVIDIA HTTP 404» y el lector de texto llevaba muerto desde que
  // el catálogo eligió ese modelo. Con `categoria`, la pasarela lo resuelve
  // DENTRO del camino OpenRouter y conserva sus fallbacks (modelo seguro →
  // cadena clásica sin pin).
  const { text } = await chatConDirector(
    [{ role: 'user', content: `--- DOCUMENTO ---\n${texto.slice(0, 60_000)}` }],
    {
      app: 'plataforma',
      endpoint: 'registral',
      system: PROMPT_LECTOR_REGISTRAL,
      categoria: 'registral',
      maxTokens: 2000,
      timeoutMs: 60_000,
    },
  )
  return normalizarCuadroCargas(extraerJson(text), 'texto_documento')
}

/** Llamadas de visión simultáneas. Con una imagen por llamada, sin esto una
 *  certificación de 10 páginas leída dos veces tardaría minutos y se comería el
 *  `maxDuration` del cron. */
const LLAMADAS_EN_PARALELO = 4

/**
 * Una pasada de lectura sobre imágenes.
 *
 * Camino BUENO: el documento ENTERO en una sola llamada a un modelo multimodal.
 * Es lo único que permite acertar el RANGO de cada carga —anterior, posterior o
 * la que ejecuta—, porque el rango se deduce del ORDEN entre asientos, y ese
 * orden solo se ve mirando el cuadro completo. Leyendo página suelta, el modelo
 * de Belmonte etiquetó como «la que ejecuta» una hipoteca ANTERIOR, se purgó y
 * la finca salió «libre» con 44.850€ encima.
 *
 * Camino de RESPALDO: si no hay modelo multimodal o la llamada falla, se vuelve
 * a página a página con NIM. Peor lectura, pero nunca deja de leer.
 */
async function leerImagenes(paginas: ImageInput[], modelo: string | undefined): Promise<CuadroCargas> {
  if (paginas.length > 1) {
    try {
      const texto = await aiVision(
        PROMPT_LECTOR_REGISTRAL,
        paginas,
        `Estas son las ${paginas.length} páginas de la certificación registral, EN ORDEN. ` +
          'Léelas como un solo documento y devuelve el JSON del cuadro de cargas completo. ' +
          'El RANGO de cada carga sale del orden de los asientos respecto a la que motiva la ' +
          'ejecución: lo inscrito ANTES es anterior y lo inscrito DESPUÉS es posterior.',
        { maxTokens: 3000, endpoint: 'registral-vision', multiPagina: true, timeoutMs: 120_000 },
      )
      const cuadro = normalizarCuadroCargas(extraerJson(texto), 'ocr_ia')
      // Una lectura vacía no vale como lectura: mejor reintentar por páginas.
      if (cuadro.cargas.length || cuadro.procedimiento !== 'desconocido') return cuadro
      console.warn('[lector-registral] lectura multipágina vacía, se reintenta por páginas')
    } catch (e) {
      console.warn('[lector-registral] multipágina no disponible, se lee por páginas:', e)
    }
  }
  return leerPaginaAPagina(paginas, modelo)
}

/** Respaldo: una llamada por página, en tandas. Peor contexto, pero siempre lee. */
async function leerPaginaAPagina(paginas: ImageInput[], modelo: string | undefined): Promise<CuadroCargas> {
  const trozos: string[] = []
  for (let i = 0; i < paginas.length; i += LLAMADAS_EN_PARALELO * IMAGENES_POR_LLAMADA) {
    const tanda: Array<Promise<string>> = []
    for (let j = i; j < Math.min(i + LLAMADAS_EN_PARALELO * IMAGENES_POR_LLAMADA, paginas.length); j += IMAGENES_POR_LLAMADA) {
      const lote = paginas.slice(j, j + IMAGENES_POR_LLAMADA)
      const pagina = j + 1
      tanda.push(
        aiVision(
          PROMPT_LECTOR_REGISTRAL,
          lote,
          `Página ${pagina} de ${paginas.length} de la certificación registral. Devuelve el JSON del cuadro ` +
            'de cargas con lo que aparezca EN ESTA PÁGINA; si no aporta cargas, devuelve la lista vacía.',
          { maxTokens: 2000, model: modelo, endpoint: 'registral-vision' },
        ).catch((e) => {
          console.warn('[lector-registral] visión fallida en la página', pagina, e)
          return ''
        }),
      )
    }
    for (const texto of await Promise.all(tanda)) {
      if (texto) trozos.push(texto)
    }
  }
  if (!trozos.length) return normalizarCuadroCargas(null, 'ocr_ia')

  // Un documento puede repartir sus cargas entre varios lotes: se fusionan los
  // cuadros parciales quedándose con la información de cada uno.
  const cuadros = trozos.map((t) => normalizarCuadroCargas(extraerJson(t), 'ocr_ia'))
  const unido = cuadros.reduce((acc, c) => ({
    cargas: [...acc.cargas, ...c.cargas],
    procedimiento: acc.procedimiento !== 'desconocido' ? acc.procedimiento : c.procedimiento,
    sinMasCargas: acc.sinMasCargas || c.sinMasCargas,
    notas: [...new Set([...acc.notas, ...c.notas])],
    fuente: 'ocr_ia',
    confianza: Math.min(acc.confianza, c.confianza),
  }))
  // El mismo asiento puede aparecer en dos lotes de páginas (la anotación se
  // cita en el cuadro y otra vez en las notas al margen): una fila por asiento.
  const { cargas, avisos } = fusionarCargas(unido.cargas)
  return { ...unido, cargas, notas: [...new Set([...unido.notas, ...avisos])] }
}

/**
 * Lee UN documento y devuelve su cuadro de cargas. Hace la doble pasada y aplica
 * el consenso. Nunca lanza: un documento ilegible devuelve un cuadro vacío con
 * confianza 0, y el pipeline sigue con el siguiente.
 */
export async function leerDocumento(
  contenido: { texto: string | null; pdf: Buffer | null; imagen: ImageInput | null },
): Promise<LecturaDocumento> {
  const modelo = await modeloRegistral()
  const vacio = (via: 'texto' | 'vision', paginas = 0): LecturaDocumento => ({
    cuadro: { ...normalizarCuadroCargas(null, via === 'texto' ? 'texto_documento' : 'ocr_ia'), confianza: 0 },
    via,
    paginas,
    discrepancias: [],
    modelo: modelo ?? null,
  })

  try {
    // 1. Imagen suelta.
    if (contenido.imagen) {
      const a = await leerImagenes([contenido.imagen], modelo)
      const b = await leerImagenes([contenido.imagen], modelo)
      const { cuadro, discrepancias } = consensoCuadros(a, b)
      return { cuadro, via: 'vision', paginas: 1, discrepancias, modelo: modelo ?? null }
    }

    // 2. PDF con capa de texto.
    if (contenido.texto && !pareceEscaneado(contenido.texto)) {
      const a = await leerTexto(contenido.texto)
      const b = await leerTexto(contenido.texto)
      const { cuadro, discrepancias } = consensoCuadros(a, b)
      return { cuadro, via: 'texto', paginas: 0, discrepancias, modelo: modelo ?? null }
    }

    // 3. PDF escaneado: rescatar las páginas y leerlas con visión.
    if (contenido.pdf) {
      let paginas = await paginasDePdfEscaneado(contenido.pdf)
      // 🚨 Los registros escanean en CCITT G4/JBIG2 (compresión de fax, sin un
      // solo JPEG dentro): ahí `localizarJpegs` devuelve 0 bandas y la
      // certificación salía «ilegible» con el PDF delante (SUB-JA-2026-262310,
      // 26 páginas; la de Siero, 24/08). El respaldo renderiza las páginas con
      // PDFium/WASM — más caro, por eso solo cuando no hay JPEGs que rescatar.
      if (!paginas.length) paginas = await rasterizarPdf(contenido.pdf, MAX_PAGINAS)
      if (!paginas.length) return vacio('vision')
      const a = await leerImagenes(paginas, modelo)
      const b = await leerImagenes(paginas, modelo)
      const { cuadro, discrepancias } = consensoCuadros(a, b)
      return { cuadro, via: 'vision', paginas: paginas.length, discrepancias, modelo: modelo ?? null }
    }
  } catch (e) {
    console.error('[lector-registral] lectura fallida', e)
  }
  return vacio(contenido.pdf ? 'vision' : 'texto')
}

/**
 * Fusiona los cuadros de varios documentos de la MISMA ficha (edicto +
 * certificación + cesión…). Se queda con la vía del procedimiento que algún
 * documento haya sabido determinar y deduplica cargas por IDENTIDAD REGISTRAL
 * (la letra de la anotación, la fecha…), nunca por importe: cada documento cita
 * una parte distinta de la misma deuda —el informe de valoración el principal,
 * la certificación la responsabilidad total— y deduplicar por importe dejaba el
 * mismo embargo contado dos veces. Ver `fusionarCargas` en el módulo.
 */
export function fusionarCuadros(lecturas: LecturaDocumento[]): CuadroCargas {
  const conCargas = lecturas.filter((l) => l.cuadro.cargas.length || l.cuadro.procedimiento !== 'desconocido')
  if (!conCargas.length) return normalizarCuadroCargas(null, 'ocr_ia')

  const { cargas, avisos } = fusionarCargas(conCargas.flatMap((l) => l.cuadro.cargas))

  return {
    cargas,
    procedimiento: conCargas.find((l) => l.cuadro.procedimiento !== 'desconocido')?.cuadro.procedimiento ?? 'desconocido',
    sinMasCargas: conCargas.some((l) => l.cuadro.sinMasCargas),
    notas: [...new Set([...conCargas.flatMap((l) => l.cuadro.notas), ...avisos])],
    fuente: conCargas.some((l) => l.via === 'vision') ? 'ocr_ia' : 'texto_documento',
    confianza: Math.max(...conCargas.map((l) => l.cuadro.confianza)),
  }
}
