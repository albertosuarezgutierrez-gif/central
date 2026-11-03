// Mapfre wmediadores — AVISOS MODALES del portal sobre la home (21/10/2026, bot auto 0.8.12, dos veces en producción):
// tras el login se abre un modal AngularJS UI-Bootstrap (`div[role=dialog].modal.in`, p. ej. una noticia) que INTERCEPTA los
// clics y «Nueva producción» da timeout. Antes de pulsar la pestaña se cierra, SOLO con acciones que no comprometen nada:
//   1) Escape (teclado); 2) un control de cierre del propio modal («×», Cerrar, Entendido…) por `ctx.pulsar` (guard),
//   y solo si el texto del modal no sugiere un compromiso (emitir, contratar, firmar, pagar…); 3) si sigue abierto: ErrorTarificador('portal').
// El título del modal (≤120 caracteres, dígitos enmascarados) va al log para saber qué es. No es precio ni supuesto.
import type { Locator, Page } from 'playwright'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { pulsarEscapeAvisoModal } from '../../guard.ts'

export const SEL_MODAL_ABIERTO = 'div[role=dialog].modal.in, div[role=dialog][modal-window]'
/** Texto/nombre accesible de los controles de cierre admitidos (exacto). */
export const PATRON_CIERRE_AVISO = /^(×|x|cerrar|close|entendido|ok|continuar)$/i
/** Si el modal habla de esto, NO se pulsa nada: puede ser un compromiso. */
export const PATRON_COMPROMISO_AVISO = /emitir|contratar|firmar|pagar|grabar|confirmar la p(ó|o)liza/i
const ESPERA_CIERRE_MS = 2_000

export type CtxAvisosMapfre = Pick<ContextoPortal, 'pulsar' | 'pausa'> & { log?: (m: string, d?: Record<string, unknown>) => void }

const limpiar = (t: string) => t.replace(/\s+/g, ' ').trim()

function abiertos(page: Page): Locator {
  return page.locator(SEL_MODAL_ABIERTO).filter({ visible: true })
}

async function esperarCerrado(page: Page, ms = ESPERA_CIERRE_MS): Promise<boolean> {
  const fin = Date.now() + ms
  for (;;) {
    if ((await abiertos(page).count().catch(() => 0)) === 0) return true
    if (Date.now() >= fin) return false
    await page.waitForTimeout(100).catch(() => undefined)
  }
}

async function tituloDe(modal: Locator): Promise<string> {
  const t = await modal.locator('.modal-title, h1, h2, h3, h4, [class*=title]').first().innerText({ timeout: 500 }).catch(() => '')
  const texto = limpiar(t) || limpiar(await modal.innerText({ timeout: 500 }).catch(() => ''))
  return texto.replace(/\d/g, '#').slice(0, 120)
}

/** Cierra los avisos modales abiertos antes de navegar por los menús. Sin modal: no hace nada. */
export async function cerrarAvisosModales(page: Page, ctx: CtxAvisosMapfre): Promise<void> {
  const modal = abiertos(page).first()
  if ((await abiertos(page).count().catch(() => 0)) === 0) return
  const titulo = await tituloDe(modal)
  const texto = limpiar(await modal.innerText({ timeout: 1_000 }).catch(() => ''))
  ctx.log?.('aviso_modal_portal', { titulo })
  await pulsarEscapeAvisoModal(page)
  if (await esperarCerrado(page)) return
  if (!PATRON_COMPROMISO_AVISO.test(texto)) {
    const controles = modal.locator('button, a, [role=button], [ng-click], .close').filter({ visible: true })
    const n = Math.min(await controles.count().catch(() => 0), 20)
    for (let i = 0; i < n; i++) {
      const c = controles.nth(i)
      const nombre = limpiar((await c.innerText({ timeout: 500 }).catch(() => '')) || (await c.getAttribute('aria-label').catch(() => null)) || '')
      if (!PATRON_CIERRE_AVISO.test(nombre)) continue
      await ctx.pulsar(c)
      await ctx.pausa()
      if (await esperarCerrado(page)) return
      break
    }
  }
  throw new ErrorTarificador('portal', `mapfre: un aviso modal del portal tapa la pantalla de inicio y no se pudo cerrar: «${texto.slice(0, 200)}»`)
}
