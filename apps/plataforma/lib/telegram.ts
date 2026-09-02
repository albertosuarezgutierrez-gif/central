// lib/telegram.ts — re-export del módulo compartido (un solo bot).
// Conserva las firmas legacy (tgAlert/tgAlertButtons) para no romper el código existente.
//
// 🔔 Para un aviso PROACTIVO (cron, vigía, resumen) usa `tgAviso`/`tgAvisoAlerta` en vez de
// `tgSend`/`tgAlert`: pasan por el interruptor del panel /telegram y quedan en la bitácora.
// Las respuestas del bot a un mensaje o botón de Alberto siguen con `tgSend` (no se silencian).
export * from '@central/core-telegram'
import { tgSend, tgSendButtons, escapeHtml, type Boton } from '@central/core-telegram'
import { avisoPermitido, avisoEnviado, tgAvisoBotones as _tgAvisoBotones } from './telegram/avisos'

export { tgAviso, tgAvisoBotones, avisoPermitido, avisoEnviado } from './telegram/avisos'

const EMOJI: Record<string, string> = { critico: '🔴', aviso: '🟡', info: '🔵', resuelto: '✅' }

function envoltura(mensaje: string, nivel: keyof typeof EMOJI): string {
  const hora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  return `${EMOJI[nivel] || '🔵'} <b>SIVRA</b>\n${mensaje}\n<i>${hora}</i>`
}

export async function tgAlert(mensaje: string, nivel: keyof typeof EMOJI = 'info'): Promise<void> {
  await tgSend(envoltura(mensaje, nivel))
}

export async function tgAlertButtons(mensaje: string, nivel: keyof typeof EMOJI, botones: Boton[][]): Promise<number | null> {
  return tgSendButtons(envoltura(mensaje, nivel), botones)
}

/** `tgAlert` con el interruptor del panel /telegram. `id` debe estar en `lib/telegram/catalogo.ts`. */
export async function tgAvisoAlerta(id: string, mensaje: string, nivel: keyof typeof EMOJI = 'info'): Promise<void> {
  if (!(await avisoPermitido(id))) return
  await tgSend(envoltura(mensaje, nivel))
  await avisoEnviado(id)
}

/** `tgAlertButtons` con el interruptor del panel /telegram (misma envoltura SIVRA que `tgAvisoAlerta`). */
export async function tgAvisoAlertaBotones(id: string, mensaje: string, nivel: keyof typeof EMOJI, botones: Boton[][]): Promise<number | null> {
  return _tgAvisoBotones(id, envoltura(mensaje, nivel), botones)
}

export { escapeHtml }
