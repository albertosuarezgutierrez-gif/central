// Descarga del PDF del presupuesto/proyecto GUARDADO en AUTO (26/10/2026): Allianz (0.6.28, guarda desde 0.6.27), Mapfre (0.8.23, guarda desde
// 0.8.22) y Generali (0.2.33, aún no guarda: queda preparado tras el precio). Alberto confirma que todas las compañías dejan descargarlo ANTES de emitir.
//
// Mismo contrato de salida que Comunidades (`descargarProyecto`): `ctx.adjuntarPdf(nombre, bytes)` → `PdfRef` en `oferta.pdf`; asegura lo guarda en
// `seguros.documentos` y pone `respuesta.proyectoDocumentoId` (no se toca asegura). Nunca rompe el trabajo: sin botón / sin PDF en ~30 s / PDF
// inválido → aviso «PDF del proyecto no descargado en X: …» (sin datos personales) y el precio/proyecto se devuelve igual. LO ÚNICO que se relanza
// es una violación del guard de emisión (`EmisionBloqueadaError` de red/fase); un botón o pantalla que el guard no deja pulsar solo da aviso.
//
// El buscador y el clic viven en guard.ts (`buscarBotonDescargaProyecto`, `pulsarDescargaProyectoAuto`): aquí solo se orquesta y se valida el fichero.

import type { Page } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import type { OfertaNormalizada, PdfRef } from '@central/module-tarificacion'
import type { ContextoPortal } from './adaptador.ts'
import { esperarPdf, esPdf } from './descarga-pdf.ts'
import { ErrorFronteraEmision, pulsarEscapeAvisoModal, type CompaniaDescargaProyecto } from './guard.ts'

/** Interruptor por compañía (constante): `false` apaga la descarga SIN tocar nada más. Por defecto, activadas. */
export const DESCARGA_PROYECTO_ACTIVA: Readonly<Record<CompaniaDescargaProyecto, boolean>> = { allianz: true, mapfre: true, generali: true }

/** Espera al PDF tras el clic. */
export const TOPE_DESCARGA_PROYECTO_MS = 20_000
/** v0.6.31: tope TOTAL de la descarga (buscar + abrir menú + clic + PDF): pase lo que pase, el precio sigue y el aviso dice «tiempo agotado». */
export const TOPE_TOTAL_DESCARGA_PROYECTO_MS = 25_000
/** Tamaño razonable de un PDF de presupuesto: más pequeño no es un documento; más grande lo rechazaría asegura (`MAX_BYTES_ADJUNTO`, 4 MiB). */
export const MIN_BYTES_PDF_PROYECTO = 100
export const MAX_BYTES_PDF_PROYECTO = 4 * 1024 * 1024

const NOMBRE_COMPANIA: Record<CompaniaDescargaProyecto, string> = { allianz: 'Allianz', mapfre: 'Mapfre', generali: 'Generali' }

/** ¿Tamaño y cabecera de un PDF aceptables? `null` = bien; texto = motivo. PURA. */
export function motivoPdfInvalido(bytes: Buffer | null | undefined): string | null {
  if (!esPdf(bytes)) return 'el fichero no empieza por %PDF'
  if (bytes.length < MIN_BYTES_PDF_PROYECTO) return `PDF demasiado pequeño (${bytes.length} bytes)`
  if (bytes.length > MAX_BYTES_PDF_PROYECTO) return `PDF demasiado grande (${bytes.length} bytes; tope ${MAX_BYTES_PDF_PROYECTO})`
  return null
}

export type ResultadoDescargaProyecto = { pdf: PdfRef | null; aviso: string | null }

/**
 * Busca y pulsa el botón de descarga del proyecto/presupuesto y captura el PDF (`esperarPdf`: descarga, ventana nueva o respuesta PDF).
 * `guardado`: el proyecto ya está guardado en la compañía (admite «Imprimir»/«Descargar» a secas, salvo Generali).
 */
export async function descargarProyectoAuto(
  page: Page,
  ctx: Partial<Pick<ContextoPortal, 'adjuntarPdf' | 'log' | 'buscarDescargaProyectoAuto' | 'pulsarDescargaProyectoAuto'>>,
  compania: CompaniaDescargaProyecto,
  nombre: string,
  guardado: boolean,
  topeMs = TOPE_DESCARGA_PROYECTO_MS,
  topeTotalMs = TOPE_TOTAL_DESCARGA_PROYECTO_MS,
): Promise<ResultadoDescargaProyecto> {
  // Un diálogo nativo del portal durante la descarga se descarta (nunca se acepta) para que no bloquee la página.
  const alDialogo = (d: { dismiss: () => Promise<void> }) => { d.dismiss().catch(() => {}) }
  try { page.on('dialog', alDialogo) } catch { /* página de prueba sin eventos */ }
  let reloj: ReturnType<typeof setTimeout> | undefined
  try {
    const interna = descargarProyectoAutoInterna(page, ctx, compania, nombre, guardado, topeMs)
    interna.catch(() => {}) // si pierde la carrera, su error tardío no debe quedar sin atender
    const agotado = new Promise<ResultadoDescargaProyecto>((resolver) => {
      reloj = setTimeout(() => {
        const motivo = 'sin PDF (tiempo agotado)'
        ctx.log?.(`pdf: ${NOMBRE_COMPANIA[compania]}: ${motivo}`)
        resolver({ pdf: null, aviso: `PDF del proyecto no descargado en ${NOMBRE_COMPANIA[compania]}: ${motivo}` })
      }, topeTotalMs)
    })
    return await Promise.race([interna, agotado])
  } finally {
    clearTimeout(reloj)
    try { page.off('dialog', alDialogo) } catch { /* idem */ }
  }
}

async function descargarProyectoAutoInterna(
  page: Page,
  ctx: Partial<Pick<ContextoPortal, 'adjuntarPdf' | 'log' | 'buscarDescargaProyectoAuto' | 'pulsarDescargaProyectoAuto'>>,
  compania: CompaniaDescargaProyecto,
  nombre: string,
  guardado: boolean,
  topeMs = TOPE_DESCARGA_PROYECTO_MS,
): Promise<ResultadoDescargaProyecto> {
  const quien = NOMBRE_COMPANIA[compania]
  const sin = (motivo: string): ResultadoDescargaProyecto => {
    ctx.log?.(`pdf: ${quien}: ${motivo}`)
    return { pdf: null, aviso: `PDF del proyecto no descargado en ${quien}: ${motivo}` }
  }
  if (!DESCARGA_PROYECTO_ACTIVA[compania]) return { pdf: null, aviso: null }
  if (!ctx.buscarDescargaProyectoAuto || !ctx.pulsarDescargaProyectoAuto || !ctx.adjuntarPdf) return sin('el runner no trae la puerta guardada de descarga')
  try {
    let b = await ctx.buscarDescargaProyectoAuto(page, compania, guardado)
    if (!('boton' in b) && b.menu) {
      // v0.6.30: disparador de menú «Descargar propuesta»: UN clic (por la misma puerta guardada) solo para ABRIRLO; luego se busca de nuevo y solo vale una
      // opción que pase la lista blanca (rótulo Y atributos sin sms/email/enviar/firma…). Sin opción así: se cierra con Escape y no se pulsa nada más.
      const etiquetaMenu = b.menu.etiqueta.slice(0, 40)
      await ctx.pulsarDescargaProyectoAuto(page, b.menu.boton, compania, guardado)
      await page.waitForTimeout(600)
      const b2 = await ctx.buscarDescargaProyectoAuto(page, compania, guardado)
      if (!('boton' in b2)) {
        await pulsarEscapeAvisoModal(page)
        return sin(`se abrió el menú «${etiquetaMenu}» pero no hay ninguna opción de descarga/PDF/imprimir sin bloqueo (no se pulsó nada más): ${b2.motivo}`)
      }
      b = b2
    }
    if (!('boton' in b)) return sin(b.motivo)
    const espera = esperarPdf(page, topeMs)
    try {
      await ctx.pulsarDescargaProyectoAuto(page, b.boton, compania, guardado)
    } catch (e) {
      espera.cancelar()
      throw e
    }
    const r = await espera.promesa
    if (!r) return sin(`«${b.etiqueta.slice(0, 40)}» no produjo ningún PDF en ${Math.round(topeMs / 1000)} s (ni descarga, ni ventana, ni respuesta PDF)`)
    const malo = motivoPdfInvalido(r.bytes)
    if (malo) return sin(malo)
    ctx.log?.(`pdf: ${quien}: proyecto capturado por ${r.origen} (${r.bytes.length} bytes)`)
    return { pdf: ctx.adjuntarPdf(nombre, r.bytes), aviso: null }
  } catch (e) {
    // Frontera bancaria o botón que el guard no deja pulsar: no se pulsó nada → aviso. Red/fase/url: violación → se relanza (fail-closed).
    if (e instanceof ErrorFronteraEmision) return sin('la pantalla muestra campos de cuenta bancaria (no se pulsa nada)')
    if (e instanceof EmisionBloqueadaError && e.donde === 'boton') return sin('el guard no deja pulsar el control (no se pulsa)')
    if (e instanceof EmisionBloqueadaError) throw e
    return sin(`falló (${e instanceof Error ? e.message.replace(/\s+/g, ' ').slice(0, 120) : 'error'})`)
  }
}

/** Pone el PDF (mismo `PdfRef` en todas: el documento es del proyecto, no de la oferta) y el aviso, si los hay, en cada oferta. PURA. */
export function ofertasConPdfProyecto(ofertas: readonly OfertaNormalizada[], r: ResultadoDescargaProyecto): OfertaNormalizada[] {
  if (!r.pdf && !r.aviso) return [...ofertas]
  return ofertas.map((o) => ({ ...o, pdf: r.pdf ?? o.pdf, avisos: r.aviso ? [...o.avisos, r.aviso] : o.avisos }))
}
