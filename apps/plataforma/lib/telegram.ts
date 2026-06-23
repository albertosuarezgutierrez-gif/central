// lib/telegram.ts — re-export del módulo compartido (un solo bot).
// Conserva las firmas legacy (tgAlert/tgAlertButtons) para no romper el código existente.
export * from '@central/core-telegram'
import { tgSend, tgSendButtons, escapeHtml, type Boton } from '@central/core-telegram'

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

export { escapeHtml }
