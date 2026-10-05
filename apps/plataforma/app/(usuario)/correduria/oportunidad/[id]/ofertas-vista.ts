// Piezas puras de la pestaña «Ofertas» (F3): formato de celdas, estado de lectura, avisos y la regla
// de «Generar presupuesto». Sin React ni red. REGLA: `null` = «No figura», nunca 0.

import type { CeldaMatriz, ValorGarantia } from '@central/module-seguros'
import type { OfertaVista } from '../../../../../lib/correduria/ofertas-asegura.ts'
import { eur } from '../../../../../lib/dinero.ts'

export const NO_FIGURA = 'No figura'

/** Importe en euros o «No figura». `null`/`undefined`/no finito nunca salen como 0,00€. */
export function importeOFalta(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? eur(n) : NO_FIGURA
}

export type MarcaVista = { clave: 'peor' | 'mejor' | 'hueco'; texto: string }

/** Marca de una celda frente a la póliza actual. Un hueco gana a lo demás (no hay dato que comparar). */
export function marcaDeCelda(c: Pick<CeldaMatriz, 'peorQueActual' | 'mejorQueActual' | 'hueco'>): MarcaVista | null {
  if (c.hueco) return { clave: 'hueco', texto: 'Hueco' }
  if (c.peorQueActual) return { clave: 'peor', texto: 'Peor que la actual' }
  if (c.mejorQueActual) return { clave: 'mejor', texto: 'Mejor que la actual' }
  return null
}

/** Líneas de una celda: estado, capital, límite, franquicia. Lo que no consta se dice «No figura». */
export function lineasDeValor(v: ValorGarantia | null | undefined): string[] {
  if (!v) return [NO_FIGURA]
  const l: string[] = []
  if (v.estado === 'excluida') l.push('Excluida')
  else if (v.estado === 'incluida') l.push('Incluida')
  if (v.capital !== null && v.capital !== undefined) l.push(`Capital ${importeOFalta(v.capital)}`)
  if (v.limite !== null && v.limite !== undefined) l.push(`Límite ${importeOFalta(v.limite)}`)
  if (v.franquicia !== null && v.franquicia !== undefined) l.push(v.franquicia === 0 ? 'Sin franquicia' : `Franquicia ${importeOFalta(v.franquicia)}`)
  return l.length > 0 ? l : [NO_FIGURA]
}

/** «1.234,56» / «1234,5» / «1234.5» → número. Vacío → `null` (no figura). Basura → 'invalido'. */
export function parsearImporteEs(t: string): number | null | 'invalido' {
  const s = t.replace(/[€\s]/g, '')
  if (s === '') return null
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s
  if (!/^\d+(\.\d+)?$/.test(norm)) return 'invalido'
  const n = Number(norm)
  return Number.isFinite(n) ? n : 'invalido'
}

/** Importe → texto para un input editable (coma decimal, sin puntos de miles ni €). `null` → ''. */
export function importeParaInput(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? String(n).replace('.', ',') : ''
}

export type CampoGarantia = 'estado' | 'capital' | 'limite' | 'franquicia'

/** Nuevo mapa de garantías con UN campo cambiado (la pantalla manda el cuadro entero al PATCH). */
export function conGarantiaEditada(
  garantias: Record<string, ValorGarantia>,
  clave: string,
  campo: CampoGarantia,
  valor: number | 'incluida' | 'excluida' | null,
): Record<string, ValorGarantia> {
  const previa: ValorGarantia = garantias[clave] ?? { estado: null, capital: null, limite: null, franquicia: null, evidencia: null }
  const nueva = { ...previa, [campo]: valor } as ValorGarantia
  return { ...garantias, [clave]: nueva }
}

export type LecturaVista = { clave: 'ok' | 'fallo' | 'sin_lectura'; texto: string }

/** Estado de la lectura del PDF. Un fallo (escaneo, cifrado…) se dice tal cual, sin esconderlo. */
export function estadoLectura(o: Pick<OfertaVista, 'datosExtra'>): LecturaVista {
  const l = o.datosExtra.lectura
  if (typeof l !== 'object' || l === null) return { clave: 'sin_lectura', texto: 'Sin lectura automática: rellénala a mano.' }
  const r = l as Record<string, unknown>
  if (r.ok === true) return { clave: 'ok', texto: typeof r.paginas === 'number' ? `Leída (${r.paginas} pág.)` : 'Leída' }
  const motivo = typeof r.motivo === 'string' && r.motivo.trim() !== '' ? r.motivo : 'no se ha podido leer'
  return { clave: 'fallo', texto: `No se ha podido leer: ${motivo}` }
}

/** Avisos de una oferta: citas y cifras que NO aparecen en el PDF (el corredor las mira con lupa). */
export function avisosDeOferta(o: Pick<OfertaVista, 'datosExtra'>): string[] {
  const lista = (k: string) => (Array.isArray(o.datosExtra[k]) ? (o.datosExtra[k] as unknown[]).filter((x): x is string => typeof x === 'string') : [])
  const literales = typeof o.datosExtra.literales === 'object' && o.datosExtra.literales !== null ? (o.datosExtra.literales as Record<string, unknown>) : {}
  const nombre = (c: string) => (typeof literales[c] === 'string' ? (literales[c] as string) : c)
  const out: string[] = []
  for (const c of lista('evidenciaNoEncontrada')) out.push(`La cita de «${nombre(c)}» no se ha encontrado en el PDF.`)
  for (const c of lista('cifrasNoEncontradas')) out.push(`La cifra de «${nombre(c.split('.')[0] ?? c)}» no aparece escrita en el PDF${c.includes('.') ? ` (${c.split('.').slice(1).join('.')})` : ''}.`)
  const n = o.datosExtra.descartadasSinNombre
  if (typeof n === 'number' && n > 0) out.push(`${n} garantía${n === 1 ? '' : 's'} sin nombre no se ${n === 1 ? 'ha' : 'han'} podido revisar.`)
  return out
}

/** ¿Esta clave de garantía tiene la cita sin encontrar en esta oferta? */
export function citaNoEncontrada(o: Pick<OfertaVista, 'datosExtra'>, clave: string): boolean {
  const l = o.datosExtra.evidenciaNoEncontrada
  return Array.isArray(l) && l.includes(clave)
}

export type PuedeGenerar = { ok: true } | { ok: false; motivo: string }

/**
 * «Generar presupuesto»: hay al menos una oferta elegida, todas las elegidas están REVISADAS y con prima
 * total, y la póliza actual viva (si la hay) también revisada (el puerto lo exige).
 */
export function puedeGenerarPresupuesto(ofertas: readonly OfertaVista[], elegidas: ReadonlySet<string>): PuedeGenerar {
  const vivas = ofertas.filter((o) => o.estado !== 'descartada')
  const lista = vivas.filter((o) => o.rol === 'oferta' && elegidas.has(o.id))
  if (lista.length === 0) return { ok: false, motivo: 'Elige al menos una oferta.' }
  const sinRevisar = lista.filter((o) => o.estado !== 'revisada')
  if (sinRevisar.length > 0) return { ok: false, motivo: `Falta revisar: ${sinRevisar.map((o) => o.compania ?? 'sin compañía').join(', ')}.` }
  const sinPrima = lista.filter((o) => o.primaTotal === null)
  if (sinPrima.length > 0) return { ok: false, motivo: `Falta la prima total de: ${sinPrima.map((o) => o.compania ?? 'sin compañía').join(', ')}.` }
  const actual = vivas.find((o) => o.rol === 'actual')
  if (actual && actual.estado !== 'revisada') return { ok: false, motivo: 'Falta revisar la póliza actual.' }
  return { ok: true }
}

/** Ofertas elegidas por defecto: todas las ofertas vivas (no la póliza actual). */
export function elegidasPorDefecto(ofertas: readonly OfertaVista[]): Set<string> {
  return new Set(ofertas.filter((o) => o.rol === 'oferta' && o.estado !== 'descartada').map((o) => o.id))
}

export function rotuloEstadoOferta(e: OfertaVista['estado']): string {
  return e === 'revisada' ? 'Revisada' : e === 'descartada' ? 'Descartada' : 'Por revisar'
}
