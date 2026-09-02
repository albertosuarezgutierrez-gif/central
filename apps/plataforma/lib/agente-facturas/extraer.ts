// Extracción de factura desde un buffer (PDF o imagen), reutilizable por el
// agente (scan/backfill) sin pasar por el endpoint HTTP. Replica el pipeline de
// app/api/expenses/parse-invoice/route.ts.
//
// 02/09/2026 — un PDF SIN capa de texto dejó de ser un callejón sin salida. Antes, si `pdf-parse`
// no sacaba ni un carácter, esto devolvía `source: 'none'` a secas y el chat contestaba «prueba con
// una foto más nítida o un PDF que tenga texto»: un consejo inútil (el PDF ya estaba nítido) que
// además NO decía si el documento se había llegado a mirar. Ahora hay dos cosas:
//   1. `motivo` — POR QUÉ no se ha leído, para poder decirlo en cristiano (ver MotivoSinLectura).
//   2. `opts.ocr` — respaldo por VISIÓN sobre las páginas rasterizadas, el mismo escalón que ya
//      usan `lib/sivra/factura-limpieza-lectura.ts` y el lector registral (JPEG embebidos → PDFium).
import { aiExtractInvoice, aiExtractInvoiceDetallado } from '@/lib/ai-client'
import type { ImageInput } from '@central/core-ai'
import type { MotivoSinLectura } from '@/lib/contable/documentos-tipos'

export interface FacturaExtraida {
  fecha?: string | null
  proveedor?: string | null
  nif_proveedor?: string | null
  /** Destinatario de la factura: sirve para descartar las que son de terceros (ver receptor.ts). */
  cliente?: string | null
  nif_cliente?: string | null
  concepto?: string | null
  numero_factura?: string | null
  /** Cuándo se COBRA (domiciliación/vencimiento), distinto de `fecha` (emisión). */
  fecha_cargo?: string | null
  /** La factura se cobra por domiciliación/adeudo SEPA (y por tanto debe aparecer en cuenta). */
  domiciliado?: boolean | null
  base_imponible?: number | null
  iva_porcentaje?: number | null
  iva?: number | null
  irpf_porcentaje?: number | null
  irpf?: number | null
  total?: number | null
  categoria?: string | null
}

export interface Extraccion {
  data: FacturaExtraida
  source: 'text' | 'vision' | 'none'
  texto?: string
  /** Solo con `source: 'none'`: por qué no se ha podido leer. */
  motivo?: MotivoSinLectura
}

/** Páginas que se mandan a visión cuando el PDF va escaneado. Mismo tope que el lector de facturas
 *  de limpieza: una factura entra de sobra y evita pagar un escaneo de 40 páginas. */
const MAX_PAGINAS_OCR = 4

/**
 * Texto y nº de páginas de un PDF.
 *
 * Import PEREZOSO y apuntando al implementador interno (`lib/pdf-parse.js`) en vez de a la raíz del
 * paquete: es el patrón que usan los otros NUEVE lectores de PDF del repo (concursos, subastas,
 * nota simple, extracto de tarjeta, factura de limpieza…) precisamente para esquivar el índice del
 * paquete. Esta función era la única que quedaba con `require('pdf-parse')`.
 */
async function leerPdf(buffer: Buffer): Promise<{ texto: string; paginas: number }> {
  const mod: any = await import('pdf-parse/lib/pdf-parse.js')
  const pdfParse = mod.default ?? mod
  const r = await pdfParse(buffer)
  return { texto: String(r?.text ?? ''), paginas: Number(r?.numpages) || 0 }
}

/**
 * Páginas de un PDF escaneado como imagen, listas para visión. Primero los JPEG embebidos (gratis,
 * el escáner ya los trae) y, si el escaneo va en CCITT/JBIG2 y no hay ni uno, el rasterizador
 * PDFium. Los dos módulos se importan en perezoso: el WASM pesa ~5 MB y la inmensa mayoría de los
 * documentos que sube Alberto entran por la capa de texto sin tocar nada de esto.
 */
async function paginasEscaneadas(pdf: Buffer): Promise<ImageInput[]> {
  const { paginasDePdfEscaneado } = await import('@/lib/subastas/lector-registral')
  const embebidas = await paginasDePdfEscaneado(pdf).catch(() => [] as ImageInput[])
  if (embebidas.length) return embebidas.slice(0, MAX_PAGINAS_OCR)

  const { rasterizarPdf } = await import('@/lib/subastas/rasterizar-pdf')
  return await rasterizarPdf(pdf, MAX_PAGINAS_OCR).catch(() => [] as ImageInput[])
}

export async function extraerDesdeBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName = '',
  /** `ocr: true` = si el PDF no trae texto, se rasterizan sus páginas y se leen por visión. Cuesta
   *  una llamada multimodal, así que lo pide explícitamente quien tiene a alguien esperando
   *  respuesta (el chat contable), no los barridos por lotes. */
  opts: { ocr?: boolean } = {},
): Promise<Extraccion> {
  const esPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

  if (esPdf) {
    let leido: { texto: string; paginas: number }
    try {
      leido = await leerPdf(buffer)
    } catch (e) {
      // Que NO se pueda abrir el PDF es un desenlace distinto de que no ponga nada dentro, y hay
      // que poder decirlo: si aquí se pierde el error, aguas abajo solo queda «no lo he leído».
      const detalle = (e instanceof Error ? e.message : String(e)).slice(0, 200)
      console.warn('[extraer] pdf-parse error:', e)
      return { data: {}, source: 'none', motivo: { clase: 'pdf_ilegible', detalle } }
    }

    if (leido.texto.trim()) {
      const data = (await aiExtractInvoice({ text: leido.texto })) as FacturaExtraida
      return { data, source: 'text', texto: leido.texto }
    }

    // Sin capa de texto = escaneado. Sin OCR no se ha MIRADO el documento, y así hay que decirlo.
    const sinTexto = (ocr: 'no_intentado' | 'sin_paginas' | 'sin_datos' | 'error'): Extraccion =>
      ({ data: {}, source: 'none', motivo: { clase: 'pdf_sin_texto', paginas: leido.paginas, ocr } })

    if (!opts.ocr) return sinTexto('no_intentado')

    const paginas = await paginasEscaneadas(buffer)
    if (!paginas.length) return sinTexto('sin_paginas')

    try {
      const { datos, fallo } = await aiExtractInvoiceDetallado({ images: paginas })
      if (!fallo) return { data: datos as FacturaExtraida, source: 'vision' }
      // 'tecnico' = ningún modelo respondió (NO se ha mirado); 'sin_datos' = se miró y no había.
      return sinTexto(fallo === 'tecnico' ? 'error' : 'sin_datos')
    } catch (e) {
      console.warn('[extraer] visión sobre PDF escaneado falló:', e)
      return sinTexto('error')
    }
  }

  if (mimeType.startsWith('image/')) {
    const imageBase64 = buffer.toString('base64')
    const data = (await aiExtractInvoice({ imageBase64, mimeType })) as FacturaExtraida
    return { data, source: 'vision' }
  }

  return { data: {}, source: 'none', motivo: { clase: 'formato_no_soportado', mimeType } }
}
