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
  localizarJpegs,
  normalizarCuadroCargas,
  pareceEscaneado,
  PROMPT_LECTOR_REGISTRAL,
  type BandaAgrupable,
  type CuadroCargas,
} from '@central/module-subastas'
import type { ImageInput } from '@central/core-ai'
import { aiVision } from '@/lib/ai-client'
import { chatConDirector } from '@/lib/pasarela'
import { elegirPorCategoria } from '@/lib/ia-director'

/** Alto máximo de la imagen que se manda al modelo: más y el texto se pierde al reescalar. */
const ALTO_PAGINA = 3000
/** Techo de páginas por documento: una certificación cabe de sobra; evita facturas sorpresa. */
const MAX_PAGINAS = 12
/** Techo de imágenes por llamada de visión (los modelos degradan con muchas a la vez). */
const IMAGENES_POR_LLAMADA = 4

export interface LecturaDocumento {
  cuadro: CuadroCargas
  /** Cómo se leyó, para poder auditar después. */
  via: 'texto' | 'vision'
  paginas: number
  discrepancias: string[]
  modelo: string | null
}

/**
 * Recompone las páginas de un PDF escaneado. Devuelve PNG en base64, listos para
 * el modelo de visión. `[]` si el PDF no lleva imágenes aprovechables.
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
      const png = await sharp({ create: { width: ancho, height: alto, channels: 3, background: '#ffffff' } })
        .composite(composicion)
        .png({ compressionLevel: 9 })
        .toBuffer()
      paginas.push({ mediaType: 'image/png', data: png.toString('base64') })
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
async function leerTexto(texto: string, modelo: string | undefined): Promise<CuadroCargas> {
  // Por `chatConDirector` y no por `aiComplete`: hace falta fijar el modelo del
  // catálogo y subir el techo de salida (un cuadro de cargas con literales no
  // cabe en los 700 tokens por defecto de la pasarela).
  const { text } = await chatConDirector(
    [{ role: 'user', content: `--- DOCUMENTO ---\n${texto.slice(0, 60_000)}` }],
    {
      app: 'plataforma',
      endpoint: 'registral',
      system: PROMPT_LECTOR_REGISTRAL,
      modelo,
      maxTokens: 2000,
      timeoutMs: 60_000,
    },
  )
  return normalizarCuadroCargas(extraerJson(text), 'texto_documento')
}

/** Una pasada de lectura sobre imágenes (en lotes, para no saturar al modelo). */
async function leerImagenes(paginas: ImageInput[], modelo: string | undefined): Promise<CuadroCargas> {
  const trozos: string[] = []
  for (let i = 0; i < paginas.length; i += IMAGENES_POR_LLAMADA) {
    const lote = paginas.slice(i, i + IMAGENES_POR_LLAMADA)
    const texto = await aiVision(
      PROMPT_LECTOR_REGISTRAL,
      lote,
      i === 0
        ? 'Lee estas páginas de la certificación registral y devuelve el JSON del cuadro de cargas.'
        : 'Continúan las páginas del mismo documento. Devuelve el JSON con lo que aporten estas páginas.',
      { maxTokens: 2000, model: modelo, endpoint: 'registral-vision' },
    ).catch((e) => {
      console.warn('[lector-registral] visión fallida en el lote', i, e)
      return ''
    })
    if (texto) trozos.push(texto)
  }
  if (!trozos.length) return normalizarCuadroCargas(null, 'ocr_ia')

  // Un documento puede repartir sus cargas entre varios lotes: se fusionan los
  // cuadros parciales quedándose con la información de cada uno.
  const cuadros = trozos.map((t) => normalizarCuadroCargas(extraerJson(t), 'ocr_ia'))
  return cuadros.reduce((acc, c) => ({
    cargas: [...acc.cargas, ...c.cargas],
    procedimiento: acc.procedimiento !== 'desconocido' ? acc.procedimiento : c.procedimiento,
    sinMasCargas: acc.sinMasCargas || c.sinMasCargas,
    notas: [...new Set([...acc.notas, ...c.notas])],
    fuente: 'ocr_ia',
    confianza: Math.min(acc.confianza, c.confianza),
  }))
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
      const a = await leerTexto(contenido.texto, modelo)
      const b = await leerTexto(contenido.texto, modelo)
      const { cuadro, discrepancias } = consensoCuadros(a, b)
      return { cuadro, via: 'texto', paginas: 0, discrepancias, modelo: modelo ?? null }
    }

    // 3. PDF escaneado: rescatar las páginas y leerlas con visión.
    if (contenido.pdf) {
      const paginas = await paginasDePdfEscaneado(contenido.pdf)
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
 * documento haya sabido determinar y deduplica cargas por tipo+rango+importe.
 */
export function fusionarCuadros(lecturas: LecturaDocumento[]): CuadroCargas {
  const conCargas = lecturas.filter((l) => l.cuadro.cargas.length || l.cuadro.procedimiento !== 'desconocido')
  if (!conCargas.length) return normalizarCuadroCargas(null, 'ocr_ia')

  const clave = (c: { tipo: string; rango: string; importe: number | null }) => `${c.tipo}|${c.rango}|${c.importe ?? '?'}`
  const vistas = new Set<string>()
  const cargas = conCargas.flatMap((l) => l.cuadro.cargas).filter((c) => {
    const k = clave(c)
    if (vistas.has(k)) return false
    vistas.add(k)
    return true
  })

  return {
    cargas,
    procedimiento: conCargas.find((l) => l.cuadro.procedimiento !== 'desconocido')?.cuadro.procedimiento ?? 'desconocido',
    sinMasCargas: conCargas.some((l) => l.cuadro.sinMasCargas),
    notas: [...new Set(conCargas.flatMap((l) => l.cuadro.notas))],
    fuente: conCargas.some((l) => l.via === 'vision') ? 'ocr_ia' : 'texto_documento',
    confianza: Math.max(...conCargas.map((l) => l.cuadro.confianza)),
  }
}
