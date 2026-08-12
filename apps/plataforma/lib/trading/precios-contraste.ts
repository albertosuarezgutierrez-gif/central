import { puntosDiarios } from './precios-stooq'
import { sumarDias } from './backtest-puro'
import { juzgarPuntos, type Desfasado, type PuntoContraste } from './precios-guardia'

// Trae el CIERRE de la segunda fuente (Stooq, con respaldo Yahoo) para contrastar los precios que la
// sesión manda a `/analizar` y `/puntuar`. Aquí solo está el acarreo de red, que es lo que no se puede
// testear sin salir a internet; las dos decisiones —«¿este cierre es de la misma sesión?» y «¿cuadra
// con el precio?»— son puras y viven en `precios-guardia.ts` (`juzgarPuntos`, `contrastarFuentes`).
//
// Reglas de diseño, todas por la misma razón (un contraste que miente es peor que no tenerlo):
//  · Solo vale el cierre de LA MISMA sesión. Si la fuente aún publica el de ayer sale en `desfasados`
//    y no veta a nadie. El porqué, con el caso real del 10/08/2026, está en `juzgarPuntos`.
//  · Presupuesto de tiempo y concurrencia acotada. Los símbolos que no dan tiempo simplemente no
//    aparecen en el mapa → aguas abajo cuentan como «sin contraste», que es un «no lo sé» honesto y
//    deja pasar el precio. Un contraste incompleto NUNCA debe bloquear la pasada.
//  · Todo best-effort: si la fuente entera está caída, el mapa sale vacío y la pasada sigue igual que
//    antes de existir esta comprobación.

export const VENTANA_CONSULTA_DIAS = 15   // margen para que el CSV traiga varias sesiones
export const CONCURRENCIA = 8
export const PRESUPUESTO_CONTRASTE_MS = 45_000

export type ResultadoContraste = {
  cierres: Record<string, number>
  // Las últimas sesiones que la fuente SÍ ha publicado (<= hoy), tal cual. Es lo que alimenta el
  // contraste DIFERIDO: viene gratis con la misma petición que el cierre de hoy, así que pedirla no
  // cuesta ni una llamada más. Sin ella habría que volver a salir a internet para juzgar el ayer.
  series: Record<string, PuntoContraste[]>
  consultados: number
  sinDato: string[]           // la fuente no respondió, o no tiene ninguna sesión <= hoy
  desfasados: Desfasado[]     // respondió, pero su cierre más reciente es de una sesión ANTERIOR
  sinTiempo: string[]         // no se llegó a consultar por presupuesto
}

export async function cierresDeContraste(
  simbolos: string[],
  hoy: string,
  opts: { presupuestoMs?: number; concurrencia?: number; ventanaDias?: number } = {},
): Promise<ResultadoContraste> {
  const t0 = Date.now()
  const presupuestoMs = opts.presupuestoMs ?? PRESUPUESTO_CONTRASTE_MS
  const concurrencia = Math.max(1, opts.concurrencia ?? CONCURRENCIA)
  const ventanaDias = opts.ventanaDias ?? VENTANA_CONSULTA_DIAS
  const desde = sumarDias(hoy, -ventanaDias)

  const cierres: Record<string, number> = {}
  const series: Record<string, PuntoContraste[]> = {}
  const sinDato: string[] = []
  const desfasados: Desfasado[] = []
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
      const puntos = await puntosDiarios(simbolo, desde, hoy).catch(() => [])
      const publicadas = puntos.filter(p => p.fecha <= hoy)
      if (publicadas.length > 0) series[simbolo] = publicadas
      const v = juzgarPuntos(puntos, hoy)
      if (v.estado === 'vale') cierres[simbolo] = v.cierre
      else if (v.estado === 'desfasado') desfasados.push({ simbolo, fecha: v.fecha, cierre: v.cierre })
      else sinDato.push(simbolo)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrencia, pendientes.length) }, obrero))
  return { cierres, series, consultados, sinDato, desfasados, sinTiempo }
}
