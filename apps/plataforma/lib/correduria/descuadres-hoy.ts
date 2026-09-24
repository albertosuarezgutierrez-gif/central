// Descuadres de comisiones que suben a «Hoy» como incidencia (Fase 3 de ASegura OS). PURO.
//
// El cuadre entero vive en Comisiones; aquí solo sube lo que pide reclamar:
//  · `descuadra` — dos fuentes del mismo periodo no coinciden;
//  · `liquidado-sin-cobrar` — la compañía lo reconoce y no ha llegado al banco pasado el plazo en que
//    suele llegar (fin del periodo + DIAS_PAGO). Antes de eso es lo normal, no una incidencia.
// `no-comprobado` NO es «todo bien»: se cuenta aparte y hace que el contador diga «no lo sé».

import type { EstadoCuadre } from './cuadre.ts'

export type PeriodoCuadre = { compania: string; inicio: string; fin: string; estado: EstadoCuadre; liqRemesa: number | null }

export type IncidenciaComision = { compania: string; fin: string; estado: 'descuadra' | 'liquidado-sin-cobrar'; remesa: number | null }

export type DescuadresHoy = { incidencias: IncidenciaComision[]; sinComprobar: number }

/** Días tras el fin del periodo en que la remesa suele estar en el banco (la misma ventana que casa el cron). */
export const DIAS_PAGO = 45

function sumarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
}

export function descuadresParaHoy(periodos: readonly PeriodoCuadre[], hoy: string): DescuadresHoy {
  const incidencias: IncidenciaComision[] = []
  let sinComprobar = 0
  for (const p of periodos) {
    if (p.estado === 'no-comprobado') { sinComprobar++; continue }
    if (p.estado === 'descuadra') incidencias.push({ compania: p.compania, fin: p.fin, estado: 'descuadra', remesa: p.liqRemesa })
    else if (p.estado === 'liquidado-sin-cobrar' && sumarDias(p.fin, DIAS_PAGO) < hoy) {
      incidencias.push({ compania: p.compania, fin: p.fin, estado: 'liquidado-sin-cobrar', remesa: p.liqRemesa })
    }
  }
  incidencias.sort((a, b) => a.fin.localeCompare(b.fin))
  return { incidencias, sinComprobar }
}

/** Contador de la pestaña: incidencias; `null` si no hay ninguna pero algún periodo no se pudo comprobar. */
export function contadorDescuadres(d: DescuadresHoy): number | null {
  if (d.incidencias.length > 0) return d.incidencias.length
  return d.sinComprobar > 0 ? null : 0
}
