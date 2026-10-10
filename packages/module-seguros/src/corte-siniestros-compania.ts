/**
 * Corte de SINIESTROS POR COMPAÑÍA — la avería que el aviso global no veía.
 *
 * `corteSiniestros` compara tipos sobre el agregado de TODAS las compañías: mientras una
 * sola mande ficheros SIN, el global está en `ok`. Generali (C0072) llevaba sin mandar SIN
 * desde el 22/09/2026 y nadie lo supo porque otras compañías seguían mandando.
 *
 * Una compañía «debe mandar SIN» si cumple las DOS:
 *  - tiene pólizas EN VIGOR en cartera (`esCarteraEnVigor`; aquí llega ya contado, `enVigor`), y
 *  - tiene histórico SIN suficiente para conocer su cadencia (`sinN >= MIN_FICHEROS_SIN`).
 * Los SIN no llegan a diario sino solo cuando hay movimiento (Mapfre ~1 cada 22 días, Allianz ~7,
 * Occident ~3,3), así que el umbral depende de la cadencia de cada compañía:
 *   mediaDias = (ultimoSin - primerSin) / (sinN - 1)
 *   alerta si diasSinSIN > max(DIAS_CORTE_SINIESTROS, FACTOR_CADENCIA_SIN × mediaDias).
 *
 * Tres estados, ninguno «ok» por descarte (regla «null = no se sabe»):
 *  - `ultimoSin` `null`/`undefined`: sin histórico de SIN (o no se pudo leer). NO se alerta
 *    ni se inventa una fecha: no hay referencia de cuándo debió llegar el último.
 *  - `enVigor` `null`/`undefined`/0: no consta cartera viva (o no tiene): nada que vigilar.
 *  - fecha ilegible: se trata como sin dato, jamás como «acaba de llegar».
 *
 * Puro: decide con fechas y números, sin BD ni red.
 */
import { DIAS_CORTE_SINIESTROS } from './corte-siniestros.ts'

/** Veces la cadencia media de SIN de una compañía que ha de pasar sin fichero para alertar. */
export const FACTOR_CADENCIA_SIN = 3
/** Ficheros SIN mínimos para conocer la cadencia; con menos, «histórico insuficiente». */
export const MIN_FICHEROS_SIN = 3

export type EntradaCortePorCompania = {
  /** Código DGS (`C0072`). */
  entidad: string
  /** Nombre común (`Generali`). `null`/ausente = no consta: el aviso sale solo con el código. */
  nombre?: string | null
  /** Pólizas EN VIGOR suyas (`esCarteraEnVigor`). `null`/ausente = no se pudo contar. */
  enVigor?: number | null
  /** `max(cima_ficheros.created_at)` de sus ficheros SIN. `null`/ausente = nunca mandó SIN. */
  ultimoSin?: string | Date | null
  /** Nº de ficheros SIN de la compañía. `null`/ausente = no se sabe. */
  sinN?: number | null
  /** `min(cima_ficheros.created_at)` de sus ficheros SIN. `null`/ausente = no se sabe. */
  primerSin?: string | Date | null
}

export type CompaniaCortada = {
  entidad: string
  nombre: string | null
  enVigor: number
  /** Instante del último SIN (ISO). */
  ultimoSin: string
  /** Días enteros desde el último SIN. */
  dias: number
  /** Cadencia habitual: días medios entre ficheros SIN. */
  mediaDias: number
  /** Umbral aplicado en días: `max(DIAS_CORTE_SINIESTROS, FACTOR_CADENCIA_SIN × mediaDias)`. */
  umbralDias: number
}

export type CortePorCompania = {
  /** Compañías que debían mandar SIN y llevan más de su umbral (según su cadencia) sin hacerlo. */
  alertas: CompaniaCortada[]
  /** Compañías con cartera en vigor de las que no se vigila el SIN por falta de histórico o de fecha legible. */
  sinHistorico: string[]
}

function aFecha(v: string | Date | null | undefined): Date | null {
  if (v === null || v === undefined) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function corteSiniestrosPorCompania(
  entidades: EntradaCortePorCompania[] | null | undefined,
  ahora: Date = new Date(),
): CortePorCompania {
  const alertas: CompaniaCortada[] = []
  const sinHistorico: string[] = []
  for (const e of entidades ?? []) {
    if (typeof e.enVigor !== 'number' || !Number.isFinite(e.enVigor) || e.enVigor <= 0) continue
    const n = e.sinN
    const ultimo = aFecha(e.ultimoSin)
    const primero = aFecha(e.primerSin)
    if (typeof n !== 'number' || !Number.isFinite(n) || n < MIN_FICHEROS_SIN) { sinHistorico.push(e.entidad); continue }
    if (ultimo === null || primero === null) { sinHistorico.push(e.entidad); continue }
    const mediaDias = (ultimo.getTime() - primero.getTime()) / 86_400_000 / (n - 1)
    // Media ilegible o negativa (fechas cruzadas): sin cadencia fiable, no se alerta.
    if (!Number.isFinite(mediaDias) || mediaDias < 0) { sinHistorico.push(e.entidad); continue }
    const umbralDias = Math.max(DIAS_CORTE_SINIESTROS, FACTOR_CADENCIA_SIN * mediaDias)
    const diasExactos = (ahora.getTime() - ultimo.getTime()) / 86_400_000
    if (diasExactos <= umbralDias) continue
    alertas.push({
      entidad: e.entidad,
      nombre: e.nombre?.trim() ? e.nombre.trim() : null,
      enVigor: e.enVigor,
      ultimoSin: ultimo.toISOString(),
      dias: Math.floor(diasExactos),
      mediaDias,
      umbralDias,
    })
  }
  alertas.sort((a, b) => b.dias - a.dias || a.entidad.localeCompare(b.entidad))
  return { alertas, sinHistorico }
}

function fechaEs(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

function num(x: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(x)
}

/** Mensaje de aviso: código y nombre de cada compañía y la fecha de su último SIN. */
export function textoCorteSiniestrosPorCompania(alertas: CompaniaCortada[]): string {
  const lineas = alertas.slice(0, 10).map(a =>
    `• ${a.entidad}${a.nombre ? ` ${a.nombre}` : ''}: último SIN el ${fechaEs(a.ultimoSin)} (${a.dias} días sin SIN; cadencia habitual ${num(a.mediaDias)} días; umbral ${num(a.umbralDias)} días; ${a.enVigor} póliza(s) en vigor)`)
  const resto = alertas.length > 10 ? `\n… y ${alertas.length - 10} más` : ''
  return `⚠️ CIMA: compañías que dejaron de mandar siniestros (más de ${FACTOR_CADENCIA_SIN} veces su cadencia habitual, mínimo ${DIAS_CORTE_SINIESTROS} días, sin un fichero SIN) aunque tienen cartera en vigor:\n` +
    lineas.join('\n') + resto + '\nRevisar con Manuel/Codeoscopic.'
}
