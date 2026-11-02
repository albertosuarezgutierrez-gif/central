// Mapfre HOGAR v0.3.4 (02/11/2026) · pantalla #/emision-hogar/modalidades (AngularJS): tarjetas por DOM + celdas `directiva-id="cobertura_N_M"` (N = modalidad, M = fila).
// (prima total anual, 1ª cuota, tarifa no aplicable) y de las GARANTÍAS por modalidad (filas × columnas). Diagnóstico del volcado real
// fallo-3189a8f7: 3 tarjetas `div[heading]` dentro de `ng-repeat="modalidades in pchctrl.modalidadesCoberturas"`.
//
// 🚨 SOLO LECTURA: `EXTRAER_MODALIDADES` solo consulta el DOM (textContent/clases); no pulsa nada (ni CERRAR del modal informativo de
//    «controles técnicos», ni Recalcular, ni COMENZAR EMISIÓN). La lógica es PURA (snapshot → ofertas) y se prueba sin navegador.
// 🚨 Nunca se inventa: una fila sin asignación inequívoca no se informa (aviso); «No incluida» solo con el marcador del propio portal.
// Sin datos personales: la pantalla de modalidades no los muestra y los avisos solo llevan recuentos.
import type { Page } from 'playwright'
import type { CoberturaOferta } from '@central/module-tarificacion'
import { importeEsp, valorDeTexto } from './garantias.ts'
import { importeDePrimaHogar, MODALIDADES_HOGAR, type PrimaHogarMapfre } from './hogar.ts'

export type TarjetaSnap = {
  nombre: string
  prima: string
  /** `.tarifa-no-aplicable` VISIBLE (sin ng-hide): la modalidad no se puede contratar. */
  noAplicable: boolean
  /** `.recuadro-cuotas` en orden de documento: `l` = `.label-cuota`, `i` = `.importeCuota`. */
  cuotas: Array<{ k: 'l' | 'i'; t: string }>
  recuadro: string
}
export type CeldaSnap = {
  noContratada: boolean
  noModificable: boolean
  adicional: string
  importes: string[]
  switchOn: boolean | null
  /** `.cobertura-no-modificable` VISIBLE con la imagen `check` del portal: incluida de serie (evidencia propia del portal). */
  conCheck?: boolean
}
/** `celdas: []` = el extractor no pudo asignar la fila de forma inequívoca. */
export type FilaSnap = { titulo: string; celdas: CeldaSnap[] }
/** `detalle` = filas `.titulo-garantia` (desglose plegado) y descuentos: no tienen celda propia por modalidad, no se informan ni cuentan como «sin asignar». */
export type SnapshotModalidades = { tarjetas: TarjetaSnap[]; filas: FilaSnap[]; modales: string[]; detalle?: number }

export const AVISO_CONTROLES_TECNICOS =
  'El portal mostró un aviso informativo de «controles técnicos» al tarificar: la prima podría variar tras esos controles.'

/**
 * Extractor en página (se pasa a `page.evaluate`; AUTOCONTENIDO, solo lee). `textContent` no depende de la visibilidad; la visibilidad solo
 * se mira por la clase `ng-hide`/`hidden`/`d-none` o `display:none` (marcadores de AngularJS/Bootstrap) para los estados.
 */
export const EXTRAER_MODALIDADES = (): SnapshotModalidades => {
  const txt = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const oculto = (e: Element, tope: Element | null) => {
    for (let n: Element | null = e; n && n !== tope?.parentElement; n = n.parentElement) {
      if (n.classList.contains('ng-hide') || n.classList.contains('hidden') || n.classList.contains('d-none')) return true
      if ((n as HTMLElement).style?.display === 'none') return true
    }
    return false
  }
  const vistos = new Set<Element>()
  const tarjetasEl = Array.from(document.querySelectorAll('[ng-repeat*="modalidadesCoberturas"] div[heading], div[heading][ng-repeat*="modalidadesCoberturas"]')).filter((e) => (vistos.has(e) ? false : (vistos.add(e), true)))
  const tarjetas = tarjetasEl.map((c) => {
    const rec = c.querySelector('.recuadro-cuotas')
    const na = c.querySelector('.tarifa-no-aplicable')
    return {
      nombre: txt(c.querySelector('.cabecera-modalidad.texto-modalidad')),
      prima: txt(c.querySelector('.cabecera-modalidad.importe')),
      noAplicable: !!na && !oculto(na, c),
      cuotas: Array.from(rec?.querySelectorAll('.label-cuota, .importeCuota') ?? []).map((e) => ({ k: (e.classList.contains('label-cuota') ? 'l' : 'i') as 'l' | 'i', t: txt(e) })),
      recuadro: txt(rec).slice(0, 200),
    }
  })
  // Estructura REAL: los títulos van en una columna (`.titulo-cobertura` = fila principal; `.titulo-garantia` = desglose plegado SIN celdas) y las celdas
  // en otra, cada una con `directiva-id="cobertura_N_M"` (N = columna de modalidad, M = nº de fila principal). Los descuentos usan `descuento_NK`.
  const anidado = (e: Element) => !!e.parentElement?.closest('.titulo-cobertura, .titulo-garantia')
  const titulosCob = Array.from(document.querySelectorAll('.titulo-cobertura')).filter((e) => !e.classList.contains('titulo-garantia') && !anidado(e))
  const detalle = Array.from(document.querySelectorAll('.titulo-garantia')).filter((e) => !anidado(e)).length
  const cob = new Map<number, Map<number, Element>>()
  let descuentos = 0
  for (const e of Array.from(document.querySelectorAll('[directiva-id]'))) {
    const id = e.getAttribute('directiva-id') ?? ''
    const m = /^cobertura_(\d+)_(\d+)$/.exec(id)
    if (m) {
      const n = Number(m[1]), i = Number(m[2])
      if (!cob.has(n)) cob.set(n, new Map())
      cob.get(n)!.set(i, e)
    } else if (/^descuento_\d+$/.test(id)) descuentos++
  }
  const columnas = Array.from(cob.keys()).sort((x, y) => x - y)
  const nFilas = columnas.length ? cob.get(columnas[0]!)!.size : 0
  const nDesc = columnas.length ? descuentos / columnas.length : 0
  const regular = columnas.length > 0 && columnas.every((n) => cob.get(n)!.size === nFilas && Array.from({ length: nFilas }, (_, i) => cob.get(n)!.has(i)).every(Boolean)) && Number.isInteger(nDesc) && titulosCob.length === nFilas + nDesc
  const celdaDe = (c: Element): CeldaSnap => {
    const vis = (sel: string) => Array.from(c.querySelectorAll(sel)).filter((e) => !oculto(e, c))
    const sw = c.querySelector('input[type=checkbox].switch_checkbox, .switch_checkbox input[type=checkbox]')
    // el checkbox real lleva la clase `hidden` (lo pinta el <label>): se mira la visibilidad de su contenedor, no la suya.
    const marcado = sw instanceof HTMLInputElement && sw.parentElement && !oculto(sw.parentElement, c) ? sw.checked : null
    return {
      noContratada: vis('.cobertura-no-contratada').length > 0,
      noModificable: vis('.cobertura-no-modificable').length > 0,
      conCheck: vis('.cobertura-no-modificable img[src*="check"], .cobertura-no-modificable img[alt="check"]').length > 0,
      adicional: vis('.texto-adicional-cobertura').map(txt).join(' | ').slice(0, 200),
      importes: vis('button.select-importe, .texto-importe').map(txt).filter(Boolean),
      switchOn: marcado,
    }
  }
  const filas: FilaSnap[] = regular
    ? titulosCob.slice(0, nFilas).map((t, i) => ({ titulo: txt(t), celdas: columnas.map((n) => celdaDe(cob.get(n)!.get(i)!)) }))
    : titulosCob.map((t) => ({ titulo: txt(t), celdas: [] }))
  const modales = Array.from(document.querySelectorAll('.modal.in, .modal.show, .modal[style*="display: block"], .modal-dialog')).map((m) => txt(m).slice(0, 300))
  return { tarjetas, filas, modales, detalle }
}

const plano = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim()

/** ¿Hay un modal informativo de «CONTROLES TÉCNICOS» abierto? PURA. */
export function hayControlesTecnicos(s: Pick<SnapshotModalidades, 'modales'>): boolean {
  return s.modales.some((m) => /CONTROLES\s+TECNICOS/.test(plano(m)))
}

/** Un importe de capital «300 €» / «1.000,00 €» → número; ilegible → null. PURA. */
function importeCapital(t: string): number | null {
  return importeEsp(t.replace(/€|eur(?:os?)?/gi, '').replace(/\s+/g, ''))
}

/** Celda (modalidad) de una fila → cobertura, o `null` si la celda no dice NADA aprovechable. PURA. */
export function coberturaDeCelda(titulo: string, c: CeldaSnap): CoberturaOferta | null {
  const literal = titulo.replace(/\s+/g, ' ').trim()
  if (!literal) return null
  const cobertura: CoberturaOferta = { clave: literal, literal, estado: null, capital: null, limite: null, franquicia: null }
  if (c.noContratada) return { ...cobertura, estado: 'excluida' }
  // Interruptor APAGADO: el importe visible es solo el valor seleccionable, no un capital contratado → sin evidencia.
  if (c.switchOn === false) return null
  if (c.conCheck) cobertura.estado = 'incluida'
  const capital = c.importes.map(importeCapital).find((n): n is number => n !== null && n > 0) ?? null
  if (capital !== null) { cobertura.estado = 'incluida'; cobertura.capital = capital }
  if (c.switchOn === true) cobertura.estado = 'incluida'
  const v = c.adicional ? valorDeTexto(c.adicional) : null
  if (v) {
    if (cobertura.estado === null) cobertura.estado = v.estado
    cobertura.limite = v.limite
    cobertura.franquicia = v.franquicia
    if (cobertura.capital === null) cobertura.capital = v.capital
  }
  return cobertura.estado === null && cobertura.capital === null && cobertura.limite === null && cobertura.franquicia === null ? null : cobertura
}

/**
 * Filas × columnas → coberturas por columna (la columna k es la modalidad k, en el orden de las tarjetas). Una fila con nº de celdas distinto
 * del de modalidades (o sin asignar) se cuenta en `sinAsignar` y NO se informa; una celda muda tampoco. PURA.
 */
export function coberturasPorModalidad(filas: readonly FilaSnap[], nModalidades: number): { porColumna: CoberturaOferta[][]; sinAsignar: number } {
  const porColumna: CoberturaOferta[][] = Array.from({ length: nModalidades }, () => [])
  let sinAsignar = 0
  for (const f of filas) {
    if (f.celdas.length !== nModalidades || !f.titulo.trim()) { sinAsignar++; continue }
    f.celdas.forEach((c, k) => { const cb = coberturaDeCelda(f.titulo, c); if (cb) porColumna[k]!.push(cb) })
  }
  return { porColumna, sinAsignar }
}

/** Primer recibo = importe que sigue a la etiqueta «1ª CUOTA»; solo si la periodicidad del recuadro es anual (o no dice otra). PURA. */
export function primerReciboDe(t: Pick<TarjetaSnap, 'cuotas' | 'recuadro'>): number | null {
  if (/SEMESTRAL|TRIMESTRAL|MENSUAL/.test(plano(t.recuadro)) && !/\bANUAL\b/.test(plano(t.recuadro))) return null
  for (let i = 0; i < t.cuotas.length; i++) {
    const c = t.cuotas[i]!
    if (c.k !== 'l' || !/^1\s*[ªAº°]?\s*CUOTA/.test(plano(c.t))) continue
    const sig = t.cuotas[i + 1]
    return sig && sig.k === 'i' ? importeDePrimaHogar(sig.t) : null
  }
  return null
}

/**
 * ¿La pantalla terminó de calcular? Cada tarjeta es «no aplicable» o tiene prima válida y su 1ª cuota (o una periodicidad no anual, que no
 * da primer recibo). Antes de eso Angular va rellenando las modalidades una a una: leer en ese momento devuelve solo las ya calculadas. PURA.
 */
export function modalidadesAsentadas(s: Pick<SnapshotModalidades, 'tarjetas'>): boolean {
  return s.tarjetas.length > 0 && s.tarjetas.every((t) => t.noAplicable || (importeDePrimaHogar(t.prima) !== null && (primerReciboDe(t) !== null || /SEMESTRAL|TRIMESTRAL|MENSUAL/.test(plano(t.recuadro)))))
}

/**
 * Snapshot del DOM → primas por modalidad (con garantías y avisos). Omite tarjetas con tarifa no aplicable visible y las de nombre/prima
 * no reconocidos (validan con `MODALIDADES_HOGAR` / `importeDePrimaHogar`). Sin ninguna tarjeta válida → `[]`. PURA.
 */
export function primasDesdeSnapshot(s: SnapshotModalidades): PrimaHogarMapfre[] {
  const { porColumna, sinAsignar } = coberturasPorModalidad(s.filas, s.tarjetas.length)
  const controles = hayControlesTecnicos(s)
  const vistas = new Set<string>()
  const res: PrimaHogarMapfre[] = []
  s.tarjetas.forEach((t, k) => {
    if (t.noAplicable) return
    const modalidad = MODALIDADES_HOGAR.find((m) => plano(m) === plano(t.nombre))
    const prima = importeDePrimaHogar(t.prima)
    if (!modalidad || prima === null || vistas.has(modalidad)) return
    vistas.add(modalidad)
    const avisos: string[] = []
    if (controles) avisos.push(AVISO_CONTROLES_TECNICOS)
    const coberturas = porColumna[k] ?? []
    if (sinAsignar > 0) avisos.push(`Garantías posiblemente incompletas: ${sinAsignar} fila(s) de la pantalla de modalidades no se pudieron asignar a este producto.`)
    res.push({ modalidad, primaAnualEur: prima, primerReciboEur: primerReciboDe(t), coberturas, avisos })
  })
  return res
}

/**
 * `page.evaluate` de una función AUTOCONTENIDA. tsx/esbuild (keepNames) envuelve las funciones internas en `__name(...)`, que no existe en
 * la página («ReferenceError: __name is not defined»): se serializa la función con un `__name` neutro definido antes. SOLO lectura.
 */
export function evaluarEnPagina<T>(page: Page, fn: () => T): Promise<T> {
  return page.evaluate(`(() => { globalThis.__name = globalThis.__name || ((f) => f); return (${fn.toString()})() })()`) as Promise<T>
}

/** Lee la pantalla (SOLO LECTURA). Si el `evaluate` falla devuelve el error (para registrarlo), nunca lo traga. */
export async function leerModalidadesDom(page: Page): Promise<{ primas: PrimaHogarMapfre[]; error: string | null; asentada: boolean; tarjetas: number }> {
  try {
    const snap = await evaluarEnPagina(page, EXTRAER_MODALIDADES)
    return { primas: primasDesdeSnapshot(snap), error: null, asentada: modalidadesAsentadas(snap), tarjetas: snap.tarjetas.length }
  } catch (e) {
    return { primas: [], error: (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 200), asentada: false, tarjetas: 0 }
  }
}
