// ELEGIR OPCIÓN EN UN DESPLEGABLE (Angular Material `mat-select` / `role=combobox`) — helper COMÚN a todos los bots (pieza 4,
// 14/10/2026). Las opciones NO están en el DOM hasta abrir el panel, y viven en el overlay (`.cdk-overlay-container`), fuera del
// formulario. Orden: abrir → leer `mat-option`/`[role=option]` → elegir por COINCIDENCIA CLARA (sin tildes ni mayúsculas) con el
// valor del formulario → si no la hay, el formador (IA: solo un ÍNDICE de la lista leída, validado aquí) → si tampoco, error
// TIPADO (`ErrorOpcionSinResolver`, pide inventario) para que el runner lo cuente como un hueco de mapa, nunca un timeout.
// 🚨 TARIFICAR ≠ EMITIR: el desplegable y la opción se pulsan por `pulsar` (= `ctx.pulsar`, guard de emisión); una opción con
// palabras de emisión/pago (`opcionPermitida`) no se elige jamás, ni por coincidencia ni por la IA. No se aprende (la opción
// no tiene selector estable): lo que queda es el mapeo explícito de valores del adaptador.

import type { Locator, Page } from 'playwright'
import { ErrorTarificador } from './errores.ts'
import { normalizarTexto, opcionPermitida, sugerirOpcion, type ContextoFormador } from './formador.ts'

/** Hueco: no se pudo elegir la opción. `portal` NO transitorio; `pideInventarioDom` → el runner adjunta el inventario. */
export class ErrorOpcionSinResolver extends ErrorTarificador {
  readonly pideInventarioDom = true
  /** Textos de las opciones leídas (catálogo del portal; ≤20, ≤60 caracteres). Nunca el valor del formulario. */
  readonly opciones: string[]
  constructor(que: string, opciones: readonly string[] = []) {
    super('portal', `mat-select: ${que}${opciones.length ? ` (opciones: ${opciones.slice(0, 20).map((o) => o.slice(0, 60)).join(' | ')})` : ''}`)
    this.name = 'ErrorOpcionSinResolver'
    this.opciones = opciones.slice(0, 20).map((o) => o.slice(0, 60))
  }
}

const SEL_OVERLAY = '.cdk-overlay-container'
const SEL_OPCIONES = 'mat-option, [role="option"]'

export type ResultadoOpcion = { indice: number } | { indice: null; motivo: 'sin_coincidencia' | 'ambigua' }

/**
 * Elige la opción por coincidencia CLARA con alguno de los `buscados` (valor del formulario ya traducido a textos del portal,
 * en orden de preferencia). PURA. Sin tildes/mayúsculas/espacios dobles:
 *   1. igualdad de texto entero con un buscado (si hay UNA sola opción así; dos iguales = ambigua);
 *   2. si no, una sola opción que CONTENGA el buscado como palabras enteras (o al revés).
 * Las opciones con palabras de emisión/pago (`opcionPermitida`) no participan. Varias candidatas = ambigua (no se adivina).
 */
export function coincidenciaOpcion(opciones: readonly string[], buscados: readonly string[]): ResultadoOpcion {
  const ops = opciones.map((t, i) => ({ n: normalizarTexto(t), i })).filter((o) => o.n !== '' && opcionPermitida(opciones[o.i]))
  const bus = buscados.map(normalizarTexto).filter(Boolean)
  if (!bus.length) return { indice: null, motivo: 'sin_coincidencia' }
  for (const b of bus) {
    const iguales = ops.filter((o) => o.n === b)
    if (iguales.length === 1) return { indice: iguales[0]!.i }
    if (iguales.length > 1) return { indice: null, motivo: 'ambigua' }
  }
  // Signos fuera (15/10/2026, compañías de Mapfre: «AXA SEGUROS GENERALES, S.A. …»): la coma no rompe la palabra entera.
  const palabras = (s: string) => ` ${s.replace(/[^a-z0-9ñ]+/g, ' ').trim()} `
  for (const b of bus) {
    const contiene = ops.filter((o) => palabras(o.n).includes(palabras(b)) || palabras(b).includes(palabras(o.n)))
    if (contiene.length === 1) return { indice: contiene[0]!.i }
    if (contiene.length > 1) return { indice: null, motivo: 'ambigua' }
  }
  return { indice: null, motivo: 'sin_coincidencia' }
}

export type OpcionesMatSelect = {
  /** `ctx.pulsar`: abre el desplegable y pulsa la opción. Nunca `click()` directo. */
  pulsar: (boton: Locator) => Promise<void>
  formador?: ContextoFormador
  /** Etiqueta humana del campo («uso del vehículo»): mensajes y descripción para la IA. */
  etiqueta: string
  /** Slug para el formador (`^[a-z0-9_]{1,60}$`); por defecto, derivado de la etiqueta. */
  clave?: string
  esperaMs?: number
}

const slug = (t: string) => normalizarTexto(t).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 55) || 'lista'

async function esperarPanel(page: Page, panel: Locator, ms: number): Promise<void> {
  const hasta = Date.now() + ms
  while (Date.now() < hasta) {
    if ((await panel.locator('visible=true').count().catch(() => 0)) > 0) return
    await page.waitForTimeout(100)
  }
}

/**
 * Elige en el `mat-select` (o `role=combobox`) la opción que corresponde a `valores`. Devuelve el texto elegido y su origen.
 * Lanza `ErrorOpcionSinResolver` si el desplegable no está/está deshabilitado/es múltiple, no abre, o ni la coincidencia ni la
 * IA resuelven (el panel se cierra con telón antes). Tras elegir, comprueba que el desplegable enseña la opción.
 */
export async function elegirOpcionMatSelect(select: Locator, valores: string | readonly string[], o: OpcionesMatSelect): Promise<{ texto: string; origen: 'coincidencia' | 'ia' }> {
  const page = select.page()
  const buscados = typeof valores === 'string' ? [valores] : [...valores]
  const n = await select.locator('visible=true').count().catch(() => 0)
  if (n !== 1) throw new ErrorOpcionSinResolver(`el desplegable «${o.etiqueta}» no aparece (o hay ${n} visibles)`)
  const [dis, multi, ctrl] = await select.evaluate((el) => [el.getAttribute('aria-disabled'), el.getAttribute('aria-multiselectable'), el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns')] as const)
  if (dis === 'true') throw new ErrorOpcionSinResolver(`el desplegable «${o.etiqueta}» está deshabilitado`)
  if (multi === 'true') throw new ErrorOpcionSinResolver(`el desplegable «${o.etiqueta}» es de selección múltiple (sin mapa)`)
  await o.pulsar(select)
  const overlay = page.locator(SEL_OVERLAY)
  const porId = ctrl ? page.locator(`[id="${ctrl.replace(/"/g, '')}"]`) : null
  const ambito = porId && (await porId.count().catch(() => 0)) > 0 ? porId : overlay
  const filas = ambito.locator(SEL_OPCIONES).locator('visible=true')
  await esperarPanel(page, ambito.locator(SEL_OPCIONES), o.esperaMs ?? 5_000)
  const total = await filas.count()
  const textos = (await filas.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
  // Cerrar el panel SIN teclado (el guardián de la puerta de atrás prohíbe `keyboard.*`): clic en su telón (`cdk-overlay-backdrop`)
  // por el guard. Sin telón, el panel se cierra al elegir/navegar; no se fuerza.
  const cerrar = async () => {
    const telon = overlay.locator('.cdk-overlay-backdrop').locator('visible=true')
    if ((await telon.count().catch(() => 0)) > 0) await o.pulsar(telon.first()).catch(() => undefined)
  }
  if (total === 0) {
    await cerrar()
    throw new ErrorOpcionSinResolver(`el desplegable «${o.etiqueta}» no mostró opciones al abrirlo`)
  }
  let elegida: number | null = null
  let origen: 'coincidencia' | 'ia' = 'coincidencia'
  const c = coincidenciaOpcion(textos, buscados)
  const motivo = c.indice === null ? c.motivo : null
  if (c.indice !== null) elegida = c.indice
  else {
    const i = await sugerirOpcion(o.formador, {
      clave: o.clave ?? slug(o.etiqueta),
      // El valor buscado (textos de catálogo del mapeo del adaptador, nunca datos personales) VA PRIMERO: `descripcion` se recorta a
      // 300 y el servidor la mete tal cual en el prompt. Sin él la IA elegiría a ciegas.
      descripcion: `Valor buscado: ${buscados.slice(0, 3).map((b) => `«${b.replace(/\s+/g, ' ').trim().slice(0, 60)}»`).join(' | ')}. Lista desplegable «${o.etiqueta.slice(0, 60)}»: elige la OPCIÓN que corresponde a ese valor (coincidencia ${motivo === 'ambigua' ? 'ambigua' : 'no clara'}).`,
      opciones: textos,
    }).catch(() => null)
    if (i !== null && opcionPermitida(textos[i])) {
      elegida = i
      origen = 'ia'
    }
  }
  if (elegida === null) {
    await cerrar()
    throw new ErrorOpcionSinResolver(`sin opción clara para «${o.etiqueta}» (${motivo === 'ambigua' ? 'varias coinciden' : 'ninguna coincide'} y la IA no resolvió)`, textos)
  }
  const texto = textos[elegida]!
  // La fila se verifica JUSTO antes de pulsar: si el panel se re-renderizó y `nth(i)` ya es otra opción, no se pulsa.
  const fila = filas.nth(elegida)
  const filaAhora = (await fila.innerText({ timeout: 2_000 }).catch(() => '')).replace(/\s+/g, ' ').trim()
  if (filaAhora !== texto) {
    await cerrar()
    throw new ErrorOpcionSinResolver(`la lista de «${o.etiqueta}» cambió mientras se leía (la opción elegida ya no está en su sitio)`, textos)
  }
  await o.pulsar(fila)
  // Comprobación: el desplegable enseña lo elegido (valor del control, no el panel).
  const hasta = Date.now() + 3_000
  for (;;) {
    const visto = normalizarTexto(await select.innerText().catch(() => ''))
    if (visto === normalizarTexto(texto)) break
    if (Date.now() >= hasta) throw new ErrorTarificador('portal', `mat-select: el portal no dejó fijada la opción de «${o.etiqueta}»`)
    await page.waitForTimeout(100)
  }
  return { texto, origen }
}

/**
 * v0.8.28 · Solo LEE las opciones de un `mat-select` (diagnóstico de huecos): lo abre con `pulsar` (guard), espera el panel, lee los textos de
 * las opciones visibles y lo cierra con el telón. NUNCA elige. `null` si no está/ está deshabilitado/ es múltiple/ no hay panel. No lanza.
 */
export async function leerOpcionesMatSelect(select: Locator, o: Pick<OpcionesMatSelect, 'pulsar' | 'esperaMs'>): Promise<string[] | null> {
  try {
    const page = select.page()
    if ((await select.locator('visible=true').count().catch(() => 0)) !== 1) return null
    const [dis, multi, ctrl] = await select.evaluate((el) => [el.getAttribute('aria-disabled'), el.getAttribute('aria-multiselectable'), el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns')] as const)
    if (dis === 'true' || multi === 'true') return null
    await o.pulsar(select)
    const overlay = page.locator(SEL_OVERLAY)
    const porId = ctrl ? page.locator(`[id="${ctrl.replace(/"/g, '')}"]`) : null
    const ambito = porId && (await porId.count().catch(() => 0)) > 0 ? porId : overlay
    await esperarPanel(page, ambito.locator(SEL_OPCIONES), o.esperaMs ?? 3_000)
    const textos = (await ambito.locator(SEL_OPCIONES).locator('visible=true').allInnerTexts().catch(() => [] as string[])).map((t) => t.replace(/\s+/g, ' ').trim())
    const telon = overlay.locator('.cdk-overlay-backdrop').locator('visible=true')
    if ((await telon.count().catch(() => 0)) > 0) await o.pulsar(telon.first()).catch(() => undefined)
    return textos
  } catch {
    return null
  }
}
