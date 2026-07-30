// ────────────────────────────────────────────────────────────────────────────
// Documentos adjuntos a la ficha del BOE: descarga + extracción de señales.
// Aquí va SOLO la red y la BD; el parseo es puro (`@central/module-subastas`).
//
// Qué hace por subasta: baja la pestaña general de la ficha, lista sus
// documentos (`verDocumento.php`), descarga hasta 3, extrae el texto con
// pdf-parse y guarda en `notas_edicto` las señales EXPLÍCITAS (herencia
// yacente, vivienda habitual, «no consta la situación posesoria»).
//
// Los documentos ESCANEADOS (certificaciones registrales, típicamente) no
// tienen capa de texto: se saltan sin error. `notas_edicto = ''` marca
// «procesada sin hallazgos» para no re-descargar cada día.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { datosDeEdicto, enlacesDocumentos, notasDeEdicto } from '@central/module-subastas'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const FICHA = 'https://subastas.boe.es/detalleSubasta.php'
const MAX_DOCS_POR_FICHA = 3
const MAX_BYTES_DOC = 10 * 1024 * 1024
/** Menos texto que esto = PDF escaneado sin capa de texto: no hay nada que leer. */
const MIN_CHARS_TEXTO = 500

async function bajar(url: string, ms = 20000): Promise<Response> {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(ms),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r
}

async function textoDePdf(buf: Buffer): Promise<string> {
  // Import perezoso del implementador interno (patrón de lib/concursos.ts:
  // el índice del paquete arrastra artefactos de test que rompen el build).
  const mod: any = await import('pdf-parse/lib/pdf-parse.js')
  const pdfParse = mod.default ?? mod
  const { text } = await pdfParse(buf)
  return String(text ?? '')
}

export interface DocumentosFicha {
  notas: string[]
  /** La certificación registral adjunta acredita las cargas de procedencia:
   *  las cargas SÍ están publicadas (en el documento, no en el campo de la ficha). */
  cargasPublicadas: boolean
}

/** Procesa los documentos de UNA ficha. Devuelve las notas halladas. */
export async function procesarDocumentosDeFicha(identificador: string): Promise<DocumentosFicha> {
  const html = await (await bajar(`${FICHA}?idSub=${encodeURIComponent(identificador)}`)).text()
  const docs = enlacesDocumentos(html).slice(0, MAX_DOCS_POR_FICHA)

  const notas = new Set<string>()
  let cargasPublicadas = false
  for (const doc of docs) {
    try {
      const r = await bajar(doc.url, 25000)
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > MAX_BYTES_DOC) continue
      const texto = await textoDePdf(buf).catch(() => '')
      if (texto.replace(/\s+/g, ' ').trim().length < MIN_CHARS_TEXTO) continue // escaneado
      const datos = datosDeEdicto(texto)
      if (datos.sinCargasProcedencia) cargasPublicadas = true
      for (const n of notasDeEdicto(datos)) notas.add(n)
    } catch (e) {
      console.warn('[subastas-documentos]', identificador, doc.titulo, e)
    }
  }
  return { notas: [...notas], cargasPublicadas }
}

/**
 * Pasada sobre las subastas vivas del BOE sin documentos procesados.
 * Best-effort: un fallo de descarga deja la fila a NULL y se reintenta mañana.
 */
export async function procesarDocumentos(max = 10): Promise<{ revisadas: number; conHallazgos: number }> {
  const filas = await prisma.$queryRaw<Array<{ dedupe_key: string; identificador: string }>>(Prisma.sql`
    SELECT dedupe_key, identificador FROM subastas
    WHERE fuente = 'boe' AND identificador IS NOT NULL
      AND es_inmueble = true
      AND (fecha_fin IS NULL OR fecha_fin >= now())
      AND notas_edicto IS NULL
    ORDER BY fecha_fin ASC NULLS LAST
    LIMIT ${max}
  `)

  let conHallazgos = 0
  for (const f of filas) {
    try {
      const { notas, cargasPublicadas } = await procesarDocumentosDeFicha(f.identificador)
      await prisma.$executeRaw(Prisma.sql`
        UPDATE subastas SET
          notas_edicto = ${notas.join('\n')},
          -- La certificación adjunta cuenta como publicación de cargas: solo
          -- sube el flag, nunca lo baja (el campo «Cargas» de la ficha suele
          -- venir vacío cuando la info vive en el documento).
          cargas_conocidas = (COALESCE(cargas_conocidas, false) OR ${cargasPublicadas}),
          actualizado_en = now()
        WHERE dedupe_key = ${f.dedupe_key}
      `)
      if (notas.length) conHallazgos++
    } catch (e) {
      console.error('[subastas-documentos]', f.identificador, e)
    }
  }
  return { revisadas: filas.length, conHallazgos }
}
