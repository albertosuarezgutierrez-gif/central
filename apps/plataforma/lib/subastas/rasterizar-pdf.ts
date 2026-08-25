// ────────────────────────────────────────────────────────────────────────────
// RASTERIZADOR de PDF: renderiza las páginas como imágenes cuando el PDF no
// trae ni capa de texto útil ni JPEGs embebidos que rescatar.
//
// El hueco que cierra (documentado el 20/08/2026 con SUB-JA-2026-262310 y
// reconfirmado el 24/08 con la certificación de Siero): los registros escanean
// en CCITT G4/JBIG2 — compresión de fax, sin un solo JPEG dentro — así que
// `localizarJpegs()` devuelve 0 bandas, el lector se queda sin páginas y la
// certificación sale «ilegible» con el PDF delante. La cita del CLAUDE.md:
// «pide rasterizador de PDF, no un umbral».
//
// Cómo: PDFium compilado a WASM (`@hyzyla/pdfium`, MIT, sin binarios nativos —
// funciona en el runtime Node de Vercel) renderiza cada página a bitmap BGRA y
// `sharp` (ya en deps) lo codifica a JPEG. Mismos límites que el camino de
// JPEGs embebidos: `MAX_PAGINAS` del llamador y ~3000 px de alto.
//
// Import PEREZOSO a propósito: el WASM pesa ~5 MB y solo se paga cuando de
// verdad hay que rasterizar (la mayoría de documentos siguen entrando por la
// capa de texto o por los JPEGs embebidos).
// ────────────────────────────────────────────────────────────────────────────
import sharp from 'sharp'
import type { ImageInput } from '@central/core-ai'

/** Alto objetivo de la página renderizada (igual que ALTO_PAGINA del lector). */
const ALTO_OBJETIVO = 3000
/** Calidad JPEG — la misma que las páginas recompuestas de JPEGs embebidos. */
const CALIDAD_JPEG = 82
/**
 * Escala base sobre el tamaño de página en puntos (72 dpi). Una A4 escaneada
 * mide ~842 pt de alto: ×3 ≈ 2526 px, suficiente para texto registral sin
 * disparar el peso del payload; se recorta si el resultado supera el objetivo.
 */
const ESCALA_BASE = 3

/**
 * Renderiza hasta `maxPaginas` páginas del PDF como JPEG en base64, listas
 * para el modelo de visión. `[]` si el documento no se puede abrir — el
 * llamador ya trata «sin páginas» como ilegible, nunca como «finca limpia».
 */
export async function rasterizarPdf(pdf: Buffer, maxPaginas: number): Promise<ImageInput[]> {
  let libreria: Awaited<ReturnType<typeof cargarPdfium>> | null = null
  let documento: any = null
  const paginas: ImageInput[] = []
  try {
    libreria = await cargarPdfium()
    documento = await libreria.loadDocument(pdf)

    for (const page of documento.pages()) {
      if (paginas.length >= maxPaginas) break
      try {
        // El render devuelve el bitmap crudo con sus dimensiones; la
        // codificación la hace sharp, que ya sabemos que corre en Vercel.
        // En GRIS a propósito: una certificación escaneada es B/N, pesa la
        // cuarta parte y evita el baile BGRA↔RGB del bitmap de color.
        const alto = page.getOriginalSize().originalHeight * ESCALA_BASE
        const escala = alto > ALTO_OBJETIVO ? ESCALA_BASE * (ALTO_OBJETIVO / alto) : ESCALA_BASE
        const r = await page.render({ scale: escala, render: 'bitmap', colorSpace: 'Gray' })
        const canales = r.data.length / (r.width * r.height)
        if (canales !== 1 && canales !== 4) throw new Error(`bitmap inesperado: ${canales} canales`)
        const jpg = await sharp(Buffer.from(r.data), { raw: { width: r.width, height: r.height, channels: canales } })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: CALIDAD_JPEG, mozjpeg: true })
          .toBuffer()
        paginas.push({ mediaType: 'image/jpeg', data: jpg.toString('base64') })
      } catch (e) {
        // Una página que no renderiza no invalida el documento: se sigue.
        console.warn('[rasterizar-pdf] página fallida', e)
      }
    }
  } catch (e) {
    console.warn('[rasterizar-pdf] documento no rasterizable', e)
  } finally {
    try {
      documento?.destroy?.()
    } catch {
      /* liberar el WASM es best-effort */
    }
  }
  return paginas
}

async function cargarPdfium() {
  const { PDFiumLibrary } = await import('@hyzyla/pdfium')
  return PDFiumLibrary.init()
}
