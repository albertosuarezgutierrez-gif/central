// ────────────────────────────────────────────────────────────────────────────
// Documentos adjuntos a la ficha del BOE: descarga + extracción de señales.
// Aquí va SOLO la red y la BD; el parseo es puro (`@central/module-subastas`).
//
// Qué hace por subasta: baja la pestaña general de la ficha, lista sus
// documentos (`verDocumento.php`), descarga hasta 3, extrae el texto con
// pdf-parse y guarda en `notas_edicto` las señales EXPLÍCITAS (herencia
// yacente, vivienda habitual, «no consta la situación posesoria»).
//
// El LISTADO de documentos se guarda entero en `documentos` (jsonb) aunque no
// se descarguen todos: saber que la subasta tiene una certificación de cargas
// —y poder abrirla— vale por sí mismo, y antes se descartaba.
//
// Los documentos ESCANEADOS (certificaciones registrales, típicamente) no
// tienen capa de texto: se saltan sin error y quedan marcados `legible:false`
// para que la ficha pueda decir «ábrela a mano». `notas_edicto = ''` marca
// «procesada sin hallazgos» para no re-descargar cada día.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { datosDeEdicto, enlacesDocumentos, fichaLegible, notasDeEdicto } from '@central/module-subastas'

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

/** Un documento de la ficha tal y como se guarda en `subastas.documentos`. */
export interface DocumentoAdjunto {
  titulo: string
  url: string
  /** `false` = escaneado o ilegible: no se ha podido leer automáticamente.
   *  `null` = no se intentó (por el tope de descargas por pasada). */
  legible: boolean | null
}

export interface DocumentosFicha {
  notas: string[]
  /** La certificación registral adjunta acredita las cargas de procedencia:
   *  las cargas SÍ están publicadas (en el documento, no en el campo de la ficha). */
  cargasPublicadas: boolean
  /** TODOS los documentos que publica la ficha, no solo los descargados. */
  documentos: DocumentoAdjunto[]
}

/** Procesa los documentos de UNA ficha. Devuelve las notas y el listado. */
export async function procesarDocumentosDeFicha(identificador: string): Promise<DocumentosFicha> {
  const html = await (await bajar(`${FICHA}?idSub=${encodeURIComponent(identificador)}`)).text()
  // 🚨 Antes de creerse un «no hay adjuntos», comprobar que esto ES la ficha.
  // Un 200 que no lo sea daría `[]`, se grabaría como «sin documentos» y la
  // cola no volvería a mirar esta subasta jamás. Lanzando, la fila se queda a
  // NULL («sin revisar») y se reintenta en la pasada siguiente.
  if (!fichaLegible(html, identificador)) {
    throw new Error('la respuesta del Portal no es la ficha de esta subasta')
  }
  // Se listan TODOS (los enlaces son gratis) y se descargan solo los primeros.
  const todos = enlacesDocumentos(html)

  const notas = new Set<string>()
  let cargasPublicadas = false
  const documentos: DocumentoAdjunto[] = todos.map((d) => ({ titulo: d.titulo, url: d.url, legible: null }))

  for (let i = 0; i < Math.min(todos.length, MAX_DOCS_POR_FICHA); i++) {
    const doc = todos[i]
    try {
      const r = await bajar(doc.url, 25000)
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > MAX_BYTES_DOC) continue
      const texto = await textoDePdf(buf).catch(() => '')
      if (texto.replace(/\s+/g, ' ').trim().length < MIN_CHARS_TEXTO) {
        documentos[i].legible = false // escaneado: solo lectura humana
        continue
      }
      documentos[i].legible = true
      const datos = datosDeEdicto(texto)
      if (datos.sinCargasProcedencia) cargasPublicadas = true
      for (const n of notasDeEdicto(datos)) notas.add(n)
    } catch (e) {
      documentos[i].legible = false
      console.warn('[subastas-documentos]', identificador, doc.titulo, e)
    }
  }
  return { notas: [...notas], cargasPublicadas, documentos }
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
      AND (notas_edicto IS NULL OR documentos IS NULL)
    ORDER BY fecha_fin ASC NULLS LAST
    LIMIT ${max}
  `)

  let conHallazgos = 0
  for (const f of filas) {
    try {
      const { notas, cargasPublicadas, documentos } = await procesarDocumentosDeFicha(f.identificador)
      await prisma.$executeRaw(Prisma.sql`
        UPDATE subastas SET
          notas_edicto = ${notas.join('\n')},
          documentos = ${JSON.stringify(documentos)}::jsonb,
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
