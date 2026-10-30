// 0.3.23 (Fidelidade real 30/10/2026, Simualtion.aspx «Datos Cliente - Nombre y régimen»): el trabajo cayó con timeout de 30 s en el
// `click` del radio PROPIETARIO porque un overlay de carga de OutSystems (`Feedback_AjaxWait loading_overlay`, en el pie) interceptaba los
// eventos de puntero todo el rato (el portal es lento). Antes de cada acción del explorador se ESPERA a que no haya un overlay de carga
// visible que tape el control o la pantalla, con un tope (90 s). Si sigue: error REINTENTABLE claro. NUNCA un clic forzado (`force`).
// Solo LEE el DOM (clases, estilos calculados, rectángulos): no pulsa ni escribe nada. Las clases no salen de aquí (solo el recuento).

import type { Frame, Locator } from 'playwright'
import { ErrorTarificador } from './errores.ts'

/** Tope de la espera al overlay de carga antes de cada acción (Fidelidade tarda; 30 s no bastaron). */
export const TOPE_OVERLAY_CARGA_MS = 90_000
/** Cada cuánto se vuelve a mirar. */
export const SONDEO_OVERLAY_CARGA_MS = 500
/** Fracción del viewport a partir de la cual un overlay de carga «cubre la pantalla» aunque no esté justo encima del control. */
export const FRACCION_CUBRE_PANTALLA = 0.5

/** Lo que se lee de cada candidato (sin texto ni valores). `cubre`: fracción del viewport (0..1). */
export type OverlayCarga = { clase: string; visible: boolean; cubre: number; tapaObjetivo: boolean }

/**
 * ¿La clase (atributo `class` entero) es la de un overlay de CARGA? Conservador: algún token que CONTENGA `loading_overlay` o `ajaxwait`
 * (sin mayúsculas). «loading» suelto, «overlay» suelto, `modal-backdrop`… no. PURA.
 */
export function esClaseOverlayCarga(clase: string | null | undefined): boolean {
  if (typeof clase !== 'string') return false
  return clase.split(/\s+/).some((t) => /loading_overlay|ajaxwait/i.test(t))
}

/** ¿Este candidato BLOQUEA la acción? Clase de carga, visible y que tape el control o cubra ≥ la mitad del viewport. PURA. */
export function overlayBloquea(o: OverlayCarga): boolean {
  return esClaseOverlayCarga(o.clase) && o.visible === true && (o.tapaObjetivo === true || (Number.isFinite(o.cubre) && o.cubre >= FRACCION_CUBRE_PANTALLA))
}

/** Decisión de un sondeo: `seguir` (nada bloquea, o no se pudo mirar), `esperar` o `agotado` (bloquea y se pasó el tope). PURA. */
export function decisionOverlay(candidatos: readonly OverlayCarga[] | null, transcurridoMs: number, topeMs: number): 'seguir' | 'esperar' | 'agotado' {
  // `null` = no se pudo leer el DOM (nodo repintado, marco cerrado): se sigue y la acción tiene sus propias esperas y su timeout (sin force).
  if (candidatos === null || !candidatos.some(overlayBloquea)) return 'seguir'
  return transcurridoMs >= topeMs ? 'agotado' : 'esperar'
}

/** Error reintentable (orquestador: `infra` → `error_reintentable`, una vez). Sin datos: solo la acción y el tope. */
export function errorOverlayCarga(accion: string, topeMs: number): ErrorTarificador {
  return new ErrorTarificador('infra', `exploración: un overlay de carga del portal (loading_overlay/AjaxWait) sigue tapando el control tras ${Math.round(topeMs / 1000)} s antes de «${accion}»; no se fuerza el clic (reintentable)`)
}

export type DepsEsperaOverlay = {
  /** Candidatos actuales (`null` = no se pudo leer). */
  sondear: () => Promise<readonly OverlayCarga[] | null>
  dormir: (ms: number) => Promise<void>
  ahora: () => number
  topeMs?: number
  sondeoMs?: number
}

/**
 * Espera a que ningún overlay de carga bloquee. Devuelve cuánto esperó (0 = nada que esperar). Lanza {@link errorOverlayCarga} si se
 * agota el tope. Sin navegador: todo inyectado (testeable).
 */
export async function esperarSinOverlayCarga(accion: string, d: DepsEsperaOverlay): Promise<number> {
  const tope = d.topeMs ?? TOPE_OVERLAY_CARGA_MS
  const inicio = d.ahora()
  for (;;) {
    const que = decisionOverlay(await d.sondear().catch(() => null), d.ahora() - inicio, tope)
    if (que === 'seguir') return d.ahora() - inicio
    if (que === 'agotado') throw errorOverlayCarga(accion, tope)
    await d.dormir(d.sondeoMs ?? SONDEO_OVERLAY_CARGA_MS)
  }
}

/** Selector de candidatos (atributo `class` que contiene las marcas; el filtro fino lo hace `esClaseOverlayCarga`). */
const SELECTOR_CANDIDATOS = '[class*="loading_overlay" i], [class*="ajaxwait" i]'
/** Tope de candidatos leídos por documento. */
const MAX_CANDIDATOS = 20

/**
 * Lee los candidatos del documento del CONTROL (con «¿tapa el centro del control?» por `elementFromPoint`) y de los documentos de sus
 * marcos ANTECESORES (solo cobertura: un overlay del padre tapa el iframe entero). `null` si no se pudo leer. Solo lectura.
 */
export async function sondearOverlaysCarga(loc: Locator, marco: Frame | null): Promise<OverlayCarga[] | null> {
  try {
    const propios = await loc.evaluate((el: Element, [sel, max]: [string, number]) => {
      const doc = el.ownerDocument
      const win = doc.defaultView
      if (!win) return []
      const vw = win.innerWidth
      const vh = win.innerHeight
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const arriba = cx >= 0 && cy >= 0 && cx < vw && cy < vh ? doc.elementFromPoint(cx, cy) : null
      const out: { clase: string; visible: boolean; cubre: number; tapaObjetivo: boolean }[] = []
      for (const o of Array.from(doc.querySelectorAll(sel))) {
        if (out.length >= max) break
        if (o.contains(el)) continue // el control vive DENTRO (un modal con esa clase): no lo tapa
        const cs = win.getComputedStyle(o)
        const b = o.getBoundingClientRect()
        const chk = (o as Element & { checkVisibility?: (x: object) => boolean }).checkVisibility
        const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && Number.parseFloat(cs.opacity || '1') > 0 && cs.pointerEvents !== 'none' && b.width > 0 && b.height > 0 && (typeof chk !== 'function' || chk.call(o, { opacityProperty: true, visibilityProperty: true }))
        const iw = Math.max(0, Math.min(b.right, vw) - Math.max(b.left, 0))
        const ih = Math.max(0, Math.min(b.bottom, vh) - Math.max(b.top, 0))
        out.push({ clase: String(o.getAttribute('class') ?? '').slice(0, 300), visible, cubre: vw * vh > 0 ? (iw * ih) / (vw * vh) : 0, tapaObjetivo: arriba !== null && o.contains(arriba) })
      }
      return out
    }, [SELECTOR_CANDIDATOS, MAX_CANDIDATOS] as [string, number])
    const ancestros: OverlayCarga[] = []
    for (let f = marco?.parentFrame() ?? null; f; f = f.parentFrame()) {
      const r = await f.evaluate(([sel, max]: [string, number]) => {
        const vw = window.innerWidth
        const vh = window.innerHeight
        return Array.from(document.querySelectorAll(sel)).slice(0, max).map((o) => {
          const cs = window.getComputedStyle(o)
          const b = o.getBoundingClientRect()
          const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && Number.parseFloat(cs.opacity || '1') > 0 && cs.pointerEvents !== 'none' && b.width > 0 && b.height > 0
          const iw = Math.max(0, Math.min(b.right, vw) - Math.max(b.left, 0))
          const ih = Math.max(0, Math.min(b.bottom, vh) - Math.max(b.top, 0))
          return { clase: String(o.getAttribute('class') ?? '').slice(0, 300), visible, cubre: vw * vh > 0 ? (iw * ih) / (vw * vh) : 0, tapaObjetivo: false }
        })
      }, [SELECTOR_CANDIDATOS, MAX_CANDIDATOS] as [string, number])
      ancestros.push(...r)
    }
    return [...propios, ...ancestros]
  } catch {
    return null
  }
}
