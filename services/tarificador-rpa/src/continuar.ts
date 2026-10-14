// «CONTINUAR / SIGUIENTE» entre pantallas — helper COMÚN a todos los bots (pieza 4, 14/10/2026). Allianz, Mapfre, Occident y los
// que vengan lo usan en vez de un selector a mano. Mismo orden que el resto de la capa común (formador.ts):
//   selector FIJO (un botón visible con ese texto ENTERO) → lo APRENDIDO → la IA (acción `continuar` de ACCIONES_PERMITIDAS).
// 🚨 TARIFICAR ≠ EMITIR. Este fichero NO decide si es seguro pulsar: lo pulsa quien se lo pasan (`pulsar` = `ctx.pulsar`, o sea
// `pulsar()` de guard.ts: `comprobarBoton` sobre texto, ids, onclick/ng-click y ancestros, y la ventana de red). Aquí solo se
// añade lo propio de «Continuar»: el texto tiene que ser ENTERO «Continuar»/«Siguiente» (nunca «Continuar a pago», «Grabar y
// continuar», «Contratar»…), fuera de diálogos, y tras el clic la pantalla TIENE que cambiar (si no, error tipado, no cuelgue).
// Mapfre NSEI NO lo usa tal cual: su «Continuar» va por `pulsarContinuarMapfre` (guard.ts: stepper, orden y una vez por paso),
// que solo toma de aquí la localización con respaldo (`localizarContinuarConRespaldo`).

import type { Dialog, Locator, Page } from 'playwright'
import { ErrorTarificador } from './errores.ts'
import { ACCIONES_PERMITIDAS, conRespaldoIA, normalizarTexto, type ContextoFormador } from './formador.ts'

/** Textos (normalizados) que cuentan como «Continuar»: los de la fila `continuar` de la tabla CERRADA del formador. */
export const TEXTOS_CONTINUAR: readonly string[] = ACCIONES_PERMITIDAS.continuar

const SEL_BOTONES = 'button, [role="button"], input[type="button"], input[type="submit"], nx-button'
const SEL_DIALOGO = 'mat-dialog-container, [role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog, .modal, .modal-dialog, .ui-dialog'
const RE_TEXTO = new RegExp(`^\\s*(${TEXTOS_CONTINUAR.join('|')})\\s*$`, 'i')

/** Ventana por defecto para que la pantalla cambie tras el clic. */
export const ESPERA_CAMBIO_MS = 20_000

/**
 * Localiza el botón «Continuar»/«Siguiente»: EXACTAMENTE uno visible con ese texto ENTERO. Si hay 0 o varios lanza un hueco de
 * selector (`ErrorTarificador('portal')`), que es lo que `conRespaldoIA` convierte en «aprendido → IA». NO pulsa.
 */
export async function localizarContinuar(page: Page): Promise<Locator> {
  const porTexto = page.locator(SEL_BOTONES).filter({ hasText: RE_TEXTO })
  const porValor = page.locator('input[type="button"], input[type="submit"]').and(page.locator(TEXTOS_CONTINUAR.map((t) => `[value="${t}" i]`).join(', ')))
  const visibles = porTexto.or(porValor).locator('visible=true')
  const n = await visibles.count()
  if (n !== 1) throw new ErrorTarificador('portal', `continuar: se esperaba EXACTAMENTE un botón «Continuar»/«Siguiente» visible y hay ${n}`)
  return visibles.first()
}

/** El botón resuelto no puede estar dentro de un diálogo (ahí «Continuar» confirma otra cosa). Vale para fijo, aprendido e IA. */
async function exigirFueraDeDialogo(boton: Locator): Promise<void> {
  if (await boton.evaluate((el, sel) => el.closest(sel) !== null, SEL_DIALOGO)) throw new ErrorTarificador('portal', 'continuar: el botón está dentro de un diálogo (no se pulsa)')
}

/** Localiza «Continuar» con el respaldo de la capa común (fijo → aprendido → IA). `confirmar` solo tras comprobar que avanzó. */
export async function localizarContinuarConRespaldo(
  page: Page,
  formador: ContextoFormador | undefined,
  descripcion = 'Botón «Continuar»/«Siguiente» que lleva a la pantalla siguiente del formulario de tarificación (NUNCA emitir, contratar, grabar ni pagar)',
): Promise<{ locator: Locator; origen: 'fijo' | 'conocimiento' | 'ia'; confirmar: () => Promise<void> }> {
  const r = await conRespaldoIA(page, formador, () => localizarContinuar(page), { clave: 'continuar', tipo: 'accion', descripcion })
  await exigirFueraDeDialogo(r.locator)
  await exigirTextoVisibleContinuar(r.locator)
  return r
}

/**
 * Sea cual sea el ORIGEN (fijo, aprendido o IA), lo que el usuario VE en el botón (innerText, o `value` si es un input) tiene que
 * ser «Continuar»/«Siguiente»: un `aria-label`/`title` no basta (`<button aria-label="Siguiente">Confirmar</button>` no se pulsa).
 */
async function exigirTextoVisibleContinuar(boton: Locator): Promise<void> {
  const visible = await boton
    .evaluate((el) => {
      const h = el as HTMLElement
      const esInput = h.tagName === 'INPUT'
      return esInput ? ((h as HTMLInputElement).value ?? '') : (h.innerText || '')
    })
    .catch(() => '')
  if (!esTextoContinuar(visible)) throw new ErrorTarificador('portal', 'continuar: el texto visible del botón no es «Continuar»/«Siguiente» (no se pulsa)')
}

/** Huella barata de la pantalla: URL + título + texto visible. Cambia al navegar y al cambiar de paso en una SPA. */
export async function huellaPantalla(page: Page): Promise<string> {
  return (await huellaOpcional(page)) ?? 'navegando'
}

/** Como `huellaPantalla`, pero `null` si no se pudo leer (navegación en curso): NO cuenta como «la pantalla cambió». */
async function huellaOpcional(page: Page): Promise<string | null> {
  return page
    .evaluate(() => `${location.href}\u0000${document.title}\u0000${(document.body?.innerText ?? '').replace(/\s+/g, ' ').trim()}`)
    .catch(() => null)
}

/** Tope duro de la espera de cambio de pantalla, pida lo que pida el llamador. */
export const ESPERA_CAMBIO_MAX_MS = 120_000

export type OpcionesContinuar = {
  /** `ctx.pulsar`: el ÚNICO modo de pulsar (guard de emisión). Nunca `locator.click()`. */
  pulsar: (boton: Locator) => Promise<void>
  formador?: ContextoFormador
  /** Sustituye la comparación de huellas (p. ej. «el paso activo del stepper es X»). `true` = ya avanzó. */
  llegado?: (page: Page) => Promise<boolean>
  esperaMs?: number
  /** Qué pantalla es, para el mensaje de error (sin datos del cliente). */
  desde?: string
}

/**
 * Pulsa «Continuar»/«Siguiente» de forma segura y espera a que cambie la pantalla.
 *   1. localiza (fijo → aprendido → IA); si nadie lo resuelve: error ORIGINAL + checkpoint de atasco (F2), no cuelgue;
 *   2. lo pulsa por `pulsar` (guard): un «Continuar» falso (id/onclick/ancestro de contratar, grabar póliza, pagar…) lanza
 *      `EmisionBloqueadaError` ANTES del clic;
 *   3. un diálogo nativo se descarta (cancelar) y el paso falla; sin cambio de pantalla en `esperaMs` → error tipado.
 * Solo tras ver el cambio se confirma lo aprendido.
 */
export async function pulsarContinuarSeguro(page: Page, o: OpcionesContinuar): Promise<{ origen: 'fijo' | 'conocimiento' | 'ia' }> {
  const donde = o.desde ? ` desde «${o.desde}»` : ''
  const r = await localizarContinuarConRespaldo(page, o.formador)
  const antes = await huellaOpcional(page)
  let dialogoNativo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogoNativo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  try {
    await o.pulsar(r.locator)
    const hasta = Date.now() + Math.min(Math.max(o.esperaMs ?? ESPERA_CAMBIO_MS, 1_000), ESPERA_CAMBIO_MAX_MS)
    for (;;) {
      if (dialogoNativo) throw new ErrorTarificador('portal', `continuar${donde}: el portal abrió un diálogo («${dialogoNativo}») y el robot no confirma`)
      let avanzo: boolean
      if (o.llegado) avanzo = await o.llegado(page).catch(() => false)
      else {
        const ahora = await huellaOpcional(page)
        // Sin lectura (navegando) no hay información: se espera a `load` en vez de darlo por avanzado.
        if (ahora === null) await page.waitForLoadState('load', { timeout: 2_000 }).catch(() => undefined)
        avanzo = ahora !== null && (antes === null || ahora !== antes)
      }
      if (avanzo) break
      if (Date.now() >= hasta) throw new ErrorTarificador('portal', `continuar${donde}: tras pulsarlo la pantalla no cambió (¿un campo obligatorio sin rellenar o un aviso?)`)
      await page.waitForTimeout(250)
    }
  } finally {
    page.off('dialog', alDialogo)
  }
  await r.confirmar().catch(() => undefined)
  return { origen: r.origen }
}

/** ¿Este texto de botón es «Continuar»/«Siguiente»? (para pruebas y validaciones de otros módulos). PURA. */
export const esTextoContinuar = (t: string | null | undefined): boolean => TEXTOS_CONTINUAR.includes(normalizarTexto(t))
