// Vista de pantalla por árbol de accesibilidad para el EXPLORADOR (14/10/2026, Fase 4 de TARIFICADOR-OPTIMIZACION-AUDITORIA).
//
// Interruptor `TARIFICADOR_EXPLORADOR_VISTA`: `dom` (defecto; comportamiento de siempre) | `ambas` | `aria`.
// Las ACCIONES siguen usando las refs del inventario propio (`rN`): el validador, el guard de emisión y el anti-TOCTOU
// dependen de sus metadatos. Playwright 1.63 SÍ resuelve `locator('aria-ref=eN')` (también en iframes: `f1e3`), pero una
// ref de aria no lleva tag/id/tipo para revalidar, así que de momento aria es solo CONTEXTO DE LECTURA:
//   · `ambas` y `aria` capturan el snapshot redactado y lo mandan como `vistaAria` (campo opcional; el servidor que no lo
//     conozca lo ignora). `aria` solo se distinguirá de `ambas` cuando el servidor deje de listar el DOM en el prompt.
//   · Si el snapshot falla, tarda o viene vacío, el modo efectivo es `dom` y la exploración sigue igual.
// Reutiliza `capturarAriaRedactado` (valores de campos y datos personales ya redactados, tope y timeout).

import type { Page } from 'playwright'
import { capturarAriaRedactado } from '../aria-snapshot.ts'

export type ModoVista = 'dom' | 'aria' | 'ambas'
export const MODO_VISTA_POR_DEFECTO: ModoVista = 'dom'
/** Tope de la vista que viaja al servidor (más estricto que el de la evidencia: son tokens de LLM). */
export const MAX_BYTES_VISTA_ARIA = 40 * 1024

/** Lee el interruptor. Cualquier valor desconocido → `dom` (fail-safe: nada cambia). */
export function modoVistaExplorador(env: Record<string, string | undefined>): ModoVista {
  const v = (env.TARIFICADOR_EXPLORADOR_VISTA ?? '').trim().toLowerCase()
  return v === 'aria' || v === 'ambas' ? v : MODO_VISTA_POR_DEFECTO
}

export type MetricaVista = {
  /** El modo pedido por el interruptor. */
  modo: ModoVista
  /** Lo que se hizo de verdad: `dom` si no se pidió aria o si el snapshot falló. */
  efectivo: ModoVista
  /** Caracteres del inventario DOM que se manda (JSON). */
  domChars: number
  /** Caracteres de la vista aria que se manda (0 si no hay). */
  ariaChars: number
}

export type VistaPaso = { vistaAria?: string; metrica: MetricaVista }

/**
 * Captura la vista del paso. NUNCA lanza. En modo `dom` no toca la página. `capturar` es inyectable para los tests.
 */
export async function vistaDelPaso(
  page: Page,
  modo: ModoVista,
  domChars: number,
  capturar: (p: Page, o: { maxBytes: number }) => Promise<string | null> = capturarAriaRedactado,
): Promise<VistaPaso> {
  if (modo === 'dom') return { metrica: { modo, efectivo: 'dom', domChars, ariaChars: 0 } }
  let vista: string | null = null
  try {
    vista = await capturar(page, { maxBytes: MAX_BYTES_VISTA_ARIA })
  } catch {
    vista = null
  }
  if (!vista) return { metrica: { modo, efectivo: 'dom', domChars, ariaChars: 0 } }
  return { vistaAria: vista, metrica: { modo, efectivo: modo, domChars, ariaChars: vista.length } }
}
