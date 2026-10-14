// Marcos (iframes) de ePAC — capa de intranet de Allianz, común a todos los ramos. Movido de comunidades.ts y entrada.ts
// (14/10/2026, Fase 2 de docs/TARIFICADOR-OPTIMIZACION-AUDITORIA.md: un bot por compañía).

import type { Frame, Locator, Page } from 'playwright'
import { ErrorTarificador } from '../../../errores.ts'

/** Lo que el adaptador necesita de una raíz de búsqueda: vale `Page` o `Frame`. */
export type Raiz = Pick<Frame, 'locator' | 'getByText'>

/** Marco preferente donde ePAC carga la aplicación. Solo orienta el orden de búsqueda. */
export const NOMBRE_MARCO_APP = 'appArea'

/**
 * Primer marco (los hijos antes que la carcasa; `appArea` el primero) en el que `sonda` encuentra al
 * menos un elemento. Sondea hasta `timeoutMs`; si no aparece en ninguno → `ErrorTarificador('portal')`.
 */
export async function marcoCon(page: Page, sonda: (r: Raiz) => Locator, que: string, timeoutMs = 30_000): Promise<Frame> {
  const fin = Date.now() + timeoutMs
  for (;;) {
    const marcos = page.frames().slice().sort((a, b) => peso(b, page) - peso(a, page))
    for (const f of marcos) {
      if (f.isDetached()) continue
      if ((await sonda(f).count().catch(() => 0)) > 0) return f
    }
    if (Date.now() >= fin) {
      throw new ErrorTarificador('portal', `allianz/intranet: «${que}» no aparece en ningún marco de la página (${marcos.length} marcos)`)
    }
    await page.waitForTimeout(500)
  }
}

function peso(f: Frame, page: Page): number {
  if (f === page.mainFrame()) return 0
  return f.name() === NOMBRE_MARCO_APP ? 2 : 1
}

/** Un control de formulario VISIBLE: señal de que la aplicación del producto ya pintó algo dentro del marco. */
const SEL_CONTROL_APP = 'input:not([type=hidden]):visible, select:visible, textarea:visible'

/**
 * Tras pulsar el tile de `abrirNuevaAlta`, espera a que el iframe `appArea` exista y muestre al menos un control de
 * formulario visible (un `appArea` en blanco o «Cargando…» no cuenta). Es la espera que los adaptadores reales hacen con su propia sonda
 * (`marcoCon`/`marcoFormulario`, 30 s), pero GENÉRICA: el explorador no sabe aún qué etiquetas tiene el producto.
 * Solo lectura (cuenta nodos; no pulsa ni escribe). Si no carga en `timeoutMs` → `ErrorTarificador('portal')`.
 *
 * 13/10/2026 (exploración de «Allianz HOGAR»): sin esta espera el paso 1 se inventarió con el modal de «Nueva Alta» aún
 * abierto y UN solo marco (la carcasa `/private/home`), sin `appArea`; la IA no tenía formulario que ver.
 */
export async function esperarMarcoApp(page: Pick<Page, 'frames' | 'waitForTimeout'>, timeoutMs = 30_000): Promise<Frame> {
  const fin = Date.now() + timeoutMs
  for (;;) {
    for (const f of page.frames()) {
      if (f.isDetached() || f.name() !== NOMBRE_MARCO_APP) continue
      if ((await f.locator(SEL_CONTROL_APP).count().catch(() => 0)) > 0) return f
    }
    if (Date.now() >= fin) {
      throw new ErrorTarificador('portal', `allianz: el formulario del producto no cargó en el marco «${NOMBRE_MARCO_APP}» en ${Math.round(timeoutMs / 1000)} s`)
    }
    await page.waitForTimeout(500)
  }
}
