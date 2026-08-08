import { puntosDiarios } from './precios-stooq'
import { sumarDias } from './backtest-puro'

// Trae el CIERRE de la segunda fuente (Stooq, con respaldo Yahoo) para contrastar los precios que la
// sesión manda a `/analizar` y `/puntuar`. La lógica de comparación es pura y vive en
// `precios-guardia.ts::contrastarFuentes`; aquí solo está el acarreo de red, que es lo que no se puede
// testear sin salir a internet.
//
// Reglas de diseño, todas por la misma razón (un contraste que miente es peor que no tenerlo):
//  · Se coge el último cierre con fecha <= `hoy`. Si el más reciente es MÁS VIEJO que `maxDiasAtras`,
//    NO se devuelve: comparar el precio de hoy contra el cierre de la semana pasada produce
//    divergencias inventadas y acabaría descartando datos buenos.
//  · Presupuesto de tiempo y concurrencia acotada. Los símbolos que no dan tiempo simplemente no
//    aparecen en el mapa → aguas abajo cuentan como «sin contraste», que es un «no lo sé» honesto y
//    deja pasar el precio. Un contraste incompleto NUNCA debe bloquear la pasada.
//  · Todo best-effort: si la fuente entera está caída, el mapa sale vacío y la pasada sigue igual que
//    antes de existir esta comprobación.

export const DIAS_CONTRASTE_MAX = 5     // fin de semana largo + festivo
export const CONCURRENCIA = 8
export const PRESUPUESTO_CONTRASTE_MS = 45_000

export type ResultadoContraste = {
  cierres: Record<string, number>
  consultados: number
  sinDato: string[]        // la fuente no respondió o su último cierre era demasiado viejo
  sinTiempo: string[]      // no se llegó a consultar por presupuesto
}

// Último cierre <= `hoy` y no más viejo que `maxDias`. null si la fuente no da nada utilizable.
async function cierreDeContraste(simbolo: string, hoy: string, maxDias: number): Promise<number | null> {
  const desde = sumarDias(hoy, -(maxDias + 10))   // margen para que el CSV traiga varias sesiones
  const puntos = await puntosDiarios(simbolo, desde, hoy).catch(() => [])
  const limite = sumarDias(hoy, -maxDias)
  let ultimo: { fecha: string; cierre: number } | null = null
  for (const p of puntos) {
    if (p.fecha > hoy) break
    ultimo = p
  }
  if (!ultimo || ultimo.fecha < limite) return null   // sin dato, o tan viejo que no compara nada
  return ultimo.cierre
}

export async function cierresDeContraste(
  simbolos: string[],
  hoy: string,
  opts: { presupuestoMs?: number; concurrencia?: number; maxDias?: number } = {},
): Promise<ResultadoContraste> {
  const t0 = Date.now()
  const presupuestoMs = opts.presupuestoMs ?? PRESUPUESTO_CONTRASTE_MS
  const concurrencia = Math.max(1, opts.concurrencia ?? CONCURRENCIA)
  const maxDias = opts.maxDias ?? DIAS_CONTRASTE_MAX

  const cierres: Record<string, number> = {}
  const sinDato: string[] = []
  const sinTiempo: string[] = []
  const pendientes = [...new Set(simbolos)]
  let i = 0
  let consultados = 0

  const obrero = async () => {
    for (;;) {
      const idx = i++
      if (idx >= pendientes.length) return
      const simbolo = pendientes[idx]
      // Se corta ANTES de empezar, no a media petición: el resto queda como «sin tiempo», que aguas
      // abajo es «sin contraste» y deja pasar el precio.
      if (Date.now() - t0 > presupuestoMs) { sinTiempo.push(simbolo); continue }
      consultados++
      const cierre = await cierreDeContraste(simbolo, hoy, maxDias)
      if (cierre == null) sinDato.push(simbolo)
      else cierres[simbolo] = cierre
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrencia, pendientes.length) }, obrero))
  return { cierres, consultados, sinDato, sinTiempo }
}
