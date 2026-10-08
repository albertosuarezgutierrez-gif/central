// Captura del PDF que genera un portal (07/10/2026). NO pulsa nada: solo ESCUCHA.
//
// 🚨 Por qué no basta `page.waitForEvent('download')` (trabajo d77f474a, 06/10/2026: precio bueno y «PDF del
// proyecto no obtenido»): en ePAC la pestaña «Proyecto» (`td#MENU`, `sendEventMenuPDFJasper()`) genera el PDF
// por `/drrg18/jsp4pdf/proyecto.jsp`, y ese PDF puede llegar (a) como descarga de la página, (b) en una VENTANA
// NUEVA (popup: su descarga es de la popup, no de `page`) o (c) como respuesta `application/pdf` en un marco.
// Aquí se escucha en TODO el contexto: descargas de cualquier página (las de antes y las que se abran) y
// respuestas PDF. Gana lo primero que empiece por «%PDF». Las ventanas que se abran mientras, se cierran.
// Medido en local (07/10/2026): con `chromium-headless-shell` (el de `chromium.launch({ headless: true })` en la
// imagen de Playwright) un PDF en popup o en marco llega como DESCARGA; con el Chromium completo lo abre su visor y
// el cuerpo de la respuesta es el HTML del visor (por eso se exige «%PDF-» y no basta el content-type).

import type { BrowserContext, Download, Page, Response } from 'playwright'

export type PdfCapturado = { bytes: Buffer; origen: 'descarga' | 'respuesta' }

export type EsperaPdf = {
  /** Resuelve con el PDF o `null` (tiempo agotado / cancelado). Nunca rechaza. */
  promesa: Promise<PdfCapturado | null>
  /** Deja de escuchar y resuelve `null` si aún no había PDF. */
  cancelar: () => void
}

/** ¿Empieza por la cabecera de un PDF? */
export function esPdf(b: Buffer | null | undefined): b is Buffer {
  return !!b && b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-'
}

async function leerDescarga(d: Download): Promise<Buffer | null> {
  try {
    const trozos: Buffer[] = []
    for await (const t of await d.createReadStream()) trozos.push(Buffer.from(t as Uint8Array))
    return Buffer.concat(trozos)
  } catch {
    return null
  }
}

/**
 * Empieza a escuchar YA (antes de pulsar): descargas de cualquier página del contexto de `page` y respuestas
 * cuyo `content-type` es PDF. `tope` en ms. Las páginas NUEVAS que se abran durante la espera se cierran al acabar.
 */
export function esperarPdf(page: Page, tope = 45_000): EsperaPdf {
  const contexto: BrowserContext = page.context()
  const previas = new Set(contexto.pages())
  const nuevas: Page[] = []
  let terminado = false
  let resolver!: (v: PdfCapturado | null) => void
  const promesa = new Promise<PdfCapturado | null>((r) => (resolver = r))

  const fin = (v: PdfCapturado | null) => {
    if (terminado) return
    terminado = true
    clearTimeout(reloj)
    contexto.off('page', alAbrir)
    contexto.off('response', alResponder)
    for (const p of [...previas, ...nuevas]) p.off('download', alDescargar)
    // Se resuelve cuando las ventanas abiertas para el PDF ya están cerradas.
    void Promise.all(nuevas.map((p) => p.close().catch(() => undefined))).then(() => resolver(v))
  }
  const alDescargar = (d: Download) => {
    void leerDescarga(d).then((b) => {
      if (esPdf(b)) fin({ bytes: b, origen: 'descarga' })
    })
  }
  const alAbrir = (p: Page) => {
    if (terminado) return void p.close().catch(() => undefined)
    nuevas.push(p)
    p.on('download', alDescargar)
  }
  const alResponder = (r: Response) => {
    const tipo = (r.headers()['content-type'] ?? '').toLowerCase()
    if (!tipo.includes('pdf')) return
    // El cuerpo de una respuesta que el navegador convierte en descarga no está disponible: la recoge `alDescargar`.
    void r.body().then((b) => (esPdf(b) ? fin({ bytes: b, origen: 'respuesta' }) : undefined), () => undefined)
  }

  for (const p of previas) p.on('download', alDescargar)
  contexto.on('page', alAbrir)
  contexto.on('response', alResponder)
  const reloj = setTimeout(() => fin(null), tope)
  return { promesa, cancelar: () => fin(null) }
}
