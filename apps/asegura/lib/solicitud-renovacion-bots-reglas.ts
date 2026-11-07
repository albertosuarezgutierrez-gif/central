// BOTS AUTOMÁTICOS TRAS LA RESPUESTA DEL CLIENTE a la solicitud de datos de la renovación (Alberto, 07/11/2026).
// Lo PURO (sin BD ni red), con test. Idea de negocio: tarificar primero con NUESTROS bots (gratis) para gastar menos Avant2
// (Codeoscopic cobra 0,50 € por cotización). Avant2 NO se lanza desde aquí: sigue siendo botón de Alberto.
// TARIFICAR ≠ EMITIR: solo precio. Nada sale al cliente ni a compañías.
import { escapeHtml } from '@central/core-telegram'
import type { Boton } from '@central/core-telegram'

/** `callback_data` del reintento: `cdr_bot:<solicitudId>` (44 bytes, como `cdr_env`). */
export const CALLBACK_REINTENTAR_BOTS = 'cdr_bot'

export type MotivoNoEncolar = 'riesgo_no_leido' | 'datos_incompletos' | 'bot_apagado' | 'sin_bots_activos'

export type DecisionBots =
  | { accion: 'encolar'; companias: readonly string[] }
  | { accion: 'no_encolar'; motivo: MotivoNoEncolar }

/**
 * ¿Se lanzan los bots? Orden: riesgo ilegible → no se afirma nada; aún faltan datos (`faltas` > 0) → no; interruptor
 * `TARIFICADOR_RPA_ACTIVO` apagado → no; ninguna compañía con bot de hogar activo → no. `faltas === null` = no se pudo leer. PURA.
 */
export function decidirLanzamientoBots(e: { faltas: number | null; rpaActivo: boolean; companias: readonly string[] }): DecisionBots {
  if (e.faltas === null) return { accion: 'no_encolar', motivo: 'riesgo_no_leido' }
  if (e.faltas > 0) return { accion: 'no_encolar', motivo: 'datos_incompletos' }
  if (!e.rpaActivo) return { accion: 'no_encolar', motivo: 'bot_apagado' }
  const companias = [...new Set(e.companias.map((c) => c.trim().toLowerCase()).filter(Boolean))].sort()
  if (companias.length === 0) return { accion: 'no_encolar', motivo: 'sin_bots_activos' }
  return { accion: 'encolar', companias }
}

/** Qué pasó con UNA compañía. `ya_en_marcha` = había un trabajo vivo (no se duplica); `ya_con_precio` = precio reciente reutilizado. */
export type ResultadoCompania =
  | { compania: string; tipo: 'encolado' | 'ya_en_marcha' | 'ya_con_precio' }
  | { compania: string; tipo: 'rechazado'; motivo: string }

type RespuestaEncolar =
  | { estado: 'encolado'; duplicado: boolean; estadoPrevio?: string }
  | { estado: 'rechazado'; motivo: string }

/** Traduce el resultado de `encolarTrabajo` (que ya deduplica por riesgo vivo). Motivo recortado: nunca valores. PURA. */
export function resultadoDeEncolar(compania: string, r: RespuestaEncolar): ResultadoCompania {
  if (r.estado === 'rechazado') return { compania, tipo: 'rechazado', motivo: r.motivo.split(':')[0].slice(0, 60) }
  if (!r.duplicado) return { compania, tipo: 'encolado' }
  return { compania, tipo: r.estadoPrevio === 'ok' ? 'ya_con_precio' : 'ya_en_marcha' }
}

const NOMBRE_MOTIVO: Readonly<Record<MotivoNoEncolar, string>> = Object.freeze({
  riesgo_no_leido: 'no he podido releer el riesgo',
  datos_incompletos: 'aún faltan datos para los bots',
  bot_apagado: 'el tarificador RPA está apagado (TARIFICADOR_RPA_ACTIVO)',
  sin_bots_activos: 'no hay ningún bot de hogar activo',
})

export function textoMotivoNoEncolar(m: MotivoNoEncolar): string {
  return NOMBRE_MOTIVO[m]
}

/** Telegram a Alberto tras el intento. Solo compañías, estados y motivos cortos (sin datos personales). PURA. */
export function textoBotsRenovacion(e: { decision: DecisionBots; resultados: readonly ResultadoCompania[]; faltasTexto?: string | null; fallo?: string | null }): string {
  const d = e.decision
  if (d.accion === 'no_encolar') {
    const extra = d.motivo === 'datos_incompletos' && e.faltasTexto ? `: ${escapeHtml(e.faltasTexto)}` : ''
    return `🔁 Renovación de hogar: bots no lanzados: ${escapeHtml(textoMotivoNoEncolar(d.motivo))}${extra}. Tienes «Probar» como respaldo.`
  }
  if (e.fallo) return `🔁 Renovación de hogar: bots no lanzados: ${escapeHtml(e.fallo.slice(0, 80))}. Tienes «Probar» como respaldo.`
  if (!algunaEnMarcha(e.resultados)) {
    const motivos = e.resultados.map((r) => (r.tipo === 'rechazado' ? `${escapeHtml(r.compania)}: ${escapeHtml(r.motivo)}` : '')).filter(Boolean).join(' · ')
    return `🔁 Renovación de hogar: bots no lanzados${motivos ? `: ${motivos}` : ''}. Tienes «Probar» como respaldo.`
  }
  const por = (t: ResultadoCompania['tipo']) => e.resultados.filter((r) => r.tipo === t).map((r) => escapeHtml(r.compania))
  const lineas = ['🤖 Renovación de hogar: con los datos del cliente, <b>los bots ya están en marcha</b> (gratis; Avant2 no se ha tocado).']
  if (por('encolado').length) lineas.push(`▶️ Lanzados: ${por('encolado').join(', ')}`)
  if (por('ya_en_marcha').length) lineas.push(`⏳ Ya había un trabajo en marcha (no se duplica): ${por('ya_en_marcha').join(', ')}`)
  if (por('ya_con_precio').length) lineas.push(`💶 Ya tenían un precio reciente: ${por('ya_con_precio').join(', ')}`)
  for (const r of e.resultados) if (r.tipo === 'rechazado') lineas.push(`⚠️ ${escapeHtml(r.compania)}: no encolado (${escapeHtml(r.motivo)})`)
  lineas.push('Cuando terminen te llega el aviso del presupuesto en borrador. Nada sale al cliente.')
  return lineas.join('\n')
}

/** ¿Alguna compañía quedó realmente en marcha o con precio? (si no, el mensaje no puede decir «en marcha»). PURA. */
export function algunaEnMarcha(rs: readonly ResultadoCompania[]): boolean {
  return rs.some((r) => r.tipo !== 'rechazado')
}

/** Botón de reintento: siempre; el de «Probar» queda en plataforma. */
export function botonesBotsRenovacion(solicitudId: string): Boton[][] {
  return [[{ texto: '🔁 Reintentar bots', callback: `${CALLBACK_REINTENTAR_BOTS}:${solicitudId}` }]]
}
