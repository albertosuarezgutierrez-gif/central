// Interpreta y verifica los eventos que manda Resend cuando alguien abre o
// pincha un email de recaptación. La firma es tipo svix (cabeceras
// `svix-id`/`svix-timestamp`/`svix-signature`), verificada con
// `RESEND_WEBHOOK_SECRET` (se obtiene al crear el endpoint en el dashboard de
// Resend — es un secreto NUEVO, distinto de `RESEND_API_KEY`).

import { Webhook } from 'svix'

export type EventoUtilResend = { resendMessageId: string; estado: 'abierto' | 'pinchado' }

/** Puro: no verifica firma, solo interpreta el payload ya autenticado. */
export function interpretarEventoResend(payload: unknown): EventoUtilResend | null {
  if (typeof payload !== 'object' || payload === null) return null
  const o = payload as Record<string, unknown>
  const tipo = o.type
  if (tipo !== 'email.opened' && tipo !== 'email.clicked') return null
  const data = o.data
  if (typeof data !== 'object' || data === null) return null
  const emailId = (data as Record<string, unknown>).email_id
  if (typeof emailId !== 'string' || emailId.trim() === '') return null
  return { resendMessageId: emailId, estado: tipo === 'email.opened' ? 'abierto' : 'pinchado' }
}

export type VerificacionWebhook = { ok: true; payload: unknown } | { ok: false; motivo: 'sin_secreto' | 'firma_invalida' }

/**
 * Verifica la firma con el secreto de Resend antes de fiarse de nada del
 * cuerpo. Sin `RESEND_WEBHOOK_SECRET` el webhook se rechaza siempre — nunca
 * se procesa un evento sin verificar, ni siquiera en desarrollo (mismo
 * criterio que `lib/cron-auth.ts` de esta app).
 */
export function verificarWebhookResend(
  cuerpoCrudo: string,
  cabeceras: { 'svix-id': string; 'svix-timestamp': string; 'svix-signature': string },
): VerificacionWebhook {
  const secreto = process.env.RESEND_WEBHOOK_SECRET?.trim()
  if (!secreto) return { ok: false, motivo: 'sin_secreto' }
  try {
    const wh = new Webhook(secreto)
    const payload = wh.verify(cuerpoCrudo, cabeceras)
    return { ok: true, payload }
  } catch {
    return { ok: false, motivo: 'firma_invalida' }
  }
}
