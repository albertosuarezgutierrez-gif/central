/**
 * Cruce correo ↔ CIMA (F1 del agente de correo, 21/10/2026). PURO: interpreta `POST /api/operador/correo/cruce-cima`
 * de asegura y compone los Telegram. El cron `/api/cron/correduria-cruce-cima` manda, y SOLO si salió, marca.
 *
 * 🚨 Tres estados: `ok` (con o sin avisos: comprobado), `sin_migracion` (falta el SQL: se dice) y `error` (no se pudo
 * cruzar: NUNCA «nada que avisar»). Un aviso que no tiene forma se descarta y se CUENTA (`descartados`).
 */
import { escapeHtml } from '@central/core-telegram'
// El vocabulario viene del módulo (el mismo que usa asegura para apuntarlos), nunca una lista a mano.
import { TIPOS_AVISO_CRUCE, type TipoAvisoCruce } from '@central/module-seguros'

export type AvisoCruce = { id: string; tipo: TipoAvisoCruce; texto: string; clienteId: string | null }

export type LecturaCruce =
  | { estado: 'ok'; avisos: AvisoCruce[]; nuevos: number; descartados: number }
  | { estado: 'sin_migracion' }
  | { estado: 'error'; motivo: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function interpretarCruce(status: number, json: unknown): LecturaCruce {
  const o = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : null
  if (o?.estado === 'sin_migracion') return { estado: 'sin_migracion' }
  if (status !== 200 || o?.estado !== 'ok' || !Array.isArray(o.pendientes)) {
    const motivo = o?.estado === 'sin_configurar' ? 'falta conectar el puerto de asegura' : typeof o?.motivo === 'string' ? o.motivo : `respuesta ${status}`
    return { estado: 'error', motivo }
  }
  const avisos: AvisoCruce[] = []
  let descartados = 0
  for (const v of o.pendientes) {
    const a = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
    const tipo = TIPOS_AVISO_CRUCE.find((t) => t === a?.tipo)
    if (!a || typeof a.id !== 'string' || !UUID.test(a.id) || !tipo || typeof a.texto !== 'string' || a.texto.trim() === '') { descartados++; continue }
    avisos.push({ id: a.id, tipo, texto: a.texto.slice(0, 600), clienteId: typeof a.clienteId === 'string' && UUID.test(a.clienteId) ? a.clienteId : null })
  }
  return { estado: 'ok', avisos, nuevos: typeof o.nuevos === 'number' ? o.nuevos : 0, descartados }
}

/** Avisos por mensaje: con más, el Telegram se vuelve ilegible (y se parte en varios). */
export const AVISOS_POR_MENSAJE = 8

/** Los mensajes de Telegram (HTML) y los ids que cubre cada uno: se marca un mensaje entero solo si salió. */
export function componerAvisosCruce(avisos: readonly AvisoCruce[], urlFicha: (id: string) => string): { texto: string; ids: string[] }[] {
  const out: { texto: string; ids: string[] }[] = []
  for (let i = 0; i < avisos.length; i += AVISOS_POR_MENSAJE) {
    const lote = avisos.slice(i, i + AVISOS_POR_MENSAJE)
    const lineas = lote.map((a) => `${escapeHtml(a.texto)}${a.clienteId ? `\n<a href="${escapeHtml(urlFicha(a.clienteId))}">Ver ficha</a>` : ''}`)
    const cab = `🔎 <b>Correo de compañías vs CIMA</b>${avisos.length > AVISOS_POR_MENSAJE ? ` (${Math.floor(i / AVISOS_POR_MENSAJE) + 1}/${Math.ceil(avisos.length / AVISOS_POR_MENSAJE)})` : ''}`
    out.push({ texto: [cab, ...lineas].join('\n\n'), ids: lote.map((a) => a.id) })
  }
  return out
}
