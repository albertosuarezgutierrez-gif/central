// Previsión del saldo de OpenRouter y tope mensual por app (pieza 1-6 de ASegura OS, 23/09/2026).
// PURO: sin BD ni red, para poder probarlo con `node --test`. El cron /api/cron/ia-saldo lee las
// fotos de `ia_saldo_diario` y el gasto de `ai_usos` y decide con estas funciones.
//
// Regla del CLAUDE.md raíz: «no lo sé» no es «0». Sin dos fotos separadas por al menos un día no
// hay gasto medio que calcular → `sin_historico`, nunca «0 $/día» (que se leería como «saldo para
// siempre»).

import { eur } from './dinero.ts'

export type FotoSaldo = { fecha: string; usadoUsd: number }

export type Prevision =
  | { estado: 'sin_historico'; muestraDias: number }
  | { estado: 'sin_gasto'; muestraDias: number; gastoDiarioUsd: 0 }
  | { estado: 'ok'; muestraDias: number; gastoDiarioUsd: number; dias: number }

/** Ventana del gasto medio: los últimos 7 días (menos si aún no hay tanta historia). */
export const VENTANA_DIAS = 7
/** Avisar cuando el saldo alcanza para esta cantidad de días o menos. */
export const UMBRAL_DIAS = 7
/** A partir de qué fracción del tope mensual se avisa (el bloqueo es al 100 %). */
export const AVISO_MENSUAL = 0.8

const DIA_MS = 86_400_000

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS)
}

/**
 * Gasto medio diario y días de saldo restantes a partir de las fotos diarias del uso ACUMULADO.
 * Toma la foto más reciente y la más antigua dentro de la ventana; el gasto es su diferencia
 * dividida por los días que las separan.
 */
export function previsionSaldo(fotos: FotoSaldo[], restanteUsd: number): Prevision {
  const orden = [...fotos]
    .filter(f => Number.isFinite(f.usadoUsd) && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha))
    .sort((x, y) => x.fecha.localeCompare(y.fecha))
  if (orden.length < 2) return { estado: 'sin_historico', muestraDias: 0 }
  const ultima = orden[orden.length - 1]
  const dentro = orden.filter(f => diasEntre(f.fecha, ultima.fecha) <= VENTANA_DIAS)
  const primera = dentro[0]
  const muestraDias = diasEntre(primera.fecha, ultima.fecha)
  if (muestraDias < 1) return { estado: 'sin_historico', muestraDias: 0 }
  const gasto = (ultima.usadoUsd - primera.usadoUsd) / muestraDias
  if (!(gasto > 0)) return { estado: 'sin_gasto', muestraDias, gastoDiarioUsd: 0 }
  return {
    estado: 'ok', muestraDias,
    gastoDiarioUsd: +gasto.toFixed(4),
    dias: +(Math.max(restanteUsd, 0) / gasto).toFixed(1),
  }
}

export type TopeApp = { app: string; gastoEur: number; limiteEur: number | null }
export type AvisoTope = { app: string; gastoEur: number; limiteEur: number; ratio: number; agotado: boolean }

/** Apps que han pasado el 80 % de su tope mensual en €. Sin tope (NULL/0) no se juzga. */
export function avisosTopeMensual(apps: TopeApp[]): AvisoTope[] {
  return apps
    .filter((a): a is TopeApp & { limiteEur: number } => a.limiteEur !== null && a.limiteEur > 0)
    .map(a => ({ app: a.app, gastoEur: a.gastoEur, limiteEur: a.limiteEur, ratio: a.gastoEur / a.limiteEur, agotado: a.gastoEur >= a.limiteEur }))
    .filter(a => a.ratio >= AVISO_MENSUAL)
    .sort((x, y) => y.ratio - x.ratio)
}

function usd(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}$`
}

/**
 * Texto del aviso de Telegram, o `null` si no hay nada que decir. Salta si el saldo alcanza para
 * `UMBRAL_DIAS` o menos, si está por debajo del umbral fijo en $ (red de seguridad mientras no
 * hay histórico) o si alguna app pasa del 80 % de su tope mensual.
 */
export function mensajeAviso(p: {
  restanteUsd: number; umbralUsd: number; prevision: Prevision; topes: AvisoTope[]
}): string | null {
  const lineas: string[] = []
  const porDias = p.prevision.estado === 'ok' && p.prevision.dias <= UMBRAL_DIAS
  const porUmbral = p.restanteUsd < p.umbralUsd
  if (porDias || porUmbral) {
    const cuanto = p.prevision.estado === 'ok'
      ? `al ritmo de los últimos ${p.prevision.muestraDias} días (${usd(p.prevision.gastoDiarioUsd)}/día) da para <b>${p.prevision.dias} días</b>`
      : 'todavía no hay histórico para saber cuántos días da'
    lineas.push(`🔴 <b>Saldo de OpenRouter: ${usd(p.restanteUsd)}</b> — ${cuanto}. Recarga en openrouter.ai; si se agota, la pasarela cae a la cadena gratis.`)
  }
  for (const t of p.topes) {
    lineas.push(t.agotado
      ? `🔴 <b>${t.app}</b> ha agotado su tope mensual de IA: ${eur(t.gastoEur)} de ${eur(t.limiteEur)}. Hasta el día 1 solo usa la cadena gratis.`
      : `🟠 <b>${t.app}</b> lleva ${eur(t.gastoEur)} de ${eur(t.limiteEur)} de su tope mensual de IA (${Math.round(t.ratio * 100)} %).`)
  }
  return lineas.length ? `💳 <b>IA — control de gasto</b>\n${lineas.join('\n')}` : null
}

/**
 * Detalle del latido. Incluye cuánto del gasto real de OpenRouter NO anotó la pasarela: si es
 * mucho, hay llamadas saltándose `ai_usos` (y por tanto los topes). `registradoUsd` null = no se
 * pudo sumar, y se dice.
 */
export function detalleLatido(p: {
  restanteUsd: number; prevision: Prevision; gastoRealUsd: number | null; registradoUsd: number | null
}): string {
  const partes = [`saldo ${usd(p.restanteUsd)}`]
  if (p.prevision.estado === 'ok') partes.push(`${usd(p.prevision.gastoDiarioUsd)}/día · ${p.prevision.dias} días`)
  else if (p.prevision.estado === 'sin_gasto') partes.push(`sin gasto en ${p.prevision.muestraDias} días`)
  else partes.push('sin histórico aún para prever')
  if (p.gastoRealUsd !== null && p.gastoRealUsd > 0) {
    if (p.registradoUsd === null) partes.push('gasto fuera de la pasarela: no se pudo sumar ai_usos')
    else {
      const fuera = Math.max(p.gastoRealUsd - p.registradoUsd, 0)
      partes.push(`fuera de la pasarela ~${Math.round((fuera / p.gastoRealUsd) * 100)} % (${usd(fuera)} de ${usd(p.gastoRealUsd)})`)
    }
  }
  return partes.join(' · ')
}
