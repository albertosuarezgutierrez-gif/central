// Interpreta y verifica los eventos que manda Resend cuando alguien abre o
// pincha un email de recaptación. La firma es tipo svix (cabeceras
// `svix-id`/`svix-timestamp`/`svix-signature`), verificada con
// `RESEND_WEBHOOK_SECRET` (se obtiene al crear el endpoint en el dashboard de
// Resend — es un secreto NUEVO, distinto de `RESEND_API_KEY`).

import { Webhook } from 'svix'

export type EventoUtilResend = {
  resendMessageId: string
  estado: 'abierto' | 'pinchado' | 'rebotado' | 'queja'
}

/**
 * Puro: no verifica firma, solo interpreta el payload ya autenticado.
 *
 * `email.bounced`/`email.complained` (14/09/2026): hasta hoy solo se
 * escuchaba apertura/clic, así que una dirección MUERTA o una queja de spam
 * se reintentaba cada 14 días para siempre — indistinguible de un lead que
 * simplemente no abre. Los dos son estados TERMINALES: aplican opt-out (ver
 * `aplicarBajaPorRebote` en `cartera-recaptacion.ts`), no compiten con la
 * progresión enviado→abierto→pinchado.
 */
export function interpretarEventoResend(payload: unknown): EventoUtilResend | null {
  if (typeof payload !== 'object' || payload === null) return null
  const o = payload as Record<string, unknown>
  const tipo = o.type
  const ESTADOS: Record<string, EventoUtilResend['estado']> = {
    'email.opened': 'abierto',
    'email.clicked': 'pinchado',
    'email.bounced': 'rebotado',
    'email.complained': 'queja',
  }
  if (typeof tipo !== 'string' || !(tipo in ESTADOS)) return null
  const data = o.data
  if (typeof data !== 'object' || data === null) return null
  const emailId = (data as Record<string, unknown>).email_id
  if (typeof emailId !== 'string' || emailId.trim() === '') return null
  return { resendMessageId: emailId, estado: ESTADOS[tipo] }
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
    // svix ≥2.5 solo VERIFICA (devuelve void): el cuerpo hay que parsearlo aparte. Tomar su
    // retorno como payload dejó el webhook respondiendo «ignorado» a todo evento (25/09/2026).
    wh.verify(cuerpoCrudo, cabeceras)
  } catch {
    return { ok: false, motivo: 'firma_invalida' }
  }
  try {
    return { ok: true, payload: JSON.parse(cuerpoCrudo) as unknown }
  } catch {
    return { ok: false, motivo: 'firma_invalida' }
  }
}
