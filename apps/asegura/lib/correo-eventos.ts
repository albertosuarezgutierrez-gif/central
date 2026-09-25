// Parte PURA del seguimiento de correos (sin Prisma ni cifrado), para que sus cepos corran con
// `node --test` en el job de CI que no genera el cliente de Prisma. Ver `correo-seguimiento.ts`.

/** Los eventos de Resend que se guardan. Cualquier otro (`contact.*`, `domain.*`) se ignora. */
export const EVENTOS_CORREO = [
  'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.opened', 'email.clicked',
  'email.bounced', 'email.complained', 'email.failed', 'email.suppressed',
] as const
export type TipoEventoCorreo = (typeof EVENTOS_CORREO)[number]

export type EventoCorreo = {
  resendId: string
  tipo: TipoEventoCorreo
  ocurridoEn: Date
  /** Lo que sirve de prueba: enlace pinchado, IP y navegador del clic/apertura, motivo del rebote. Nunca el `to`. */
  detalle: Record<string, string>
}

const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/**
 * Puro: interpreta el payload YA verificado de Resend. `null` = no es un evento de correo que guardemos.
 * La hora es la del EVENTO (`created_at` del payload), no la de recepción: un reintento de Resend
 * horas después no puede mover la hora de la entrega.
 */
export function interpretarEventoCorreo(payload: unknown): EventoCorreo | null {
  if (typeof payload !== 'object' || payload === null) return null
  const o = payload as Record<string, unknown>
  const tipo = o.type
  if (typeof tipo !== 'string' || !(EVENTOS_CORREO as readonly string[]).includes(tipo)) return null
  const data = typeof o.data === 'object' && o.data !== null ? (o.data as Record<string, unknown>) : null
  const resendId = data ? cadena(data.email_id) : null
  if (!data || !resendId) return null
  const cuando = new Date(cadena(o.created_at) ?? cadena(data.created_at) ?? '')
  if (Number.isNaN(cuando.getTime())) return null

  const detalle: Record<string, string> = {}
  const anidado = (k: string) => (typeof data[k] === 'object' && data[k] !== null ? (data[k] as Record<string, unknown>) : null)
  const clic = anidado('click')
  if (clic) {
    const link = cadena(clic.link); if (link) detalle.enlace = link
    const ip = cadena(clic.ipAddress); if (ip) detalle.ip = ip
    const ua = cadena(clic.userAgent); if (ua) detalle.navegador = ua
  }
  const apertura = anidado('open')
  if (apertura) {
    const ip = cadena(apertura.ipAddress); if (ip) detalle.ip = ip
    const ua = cadena(apertura.userAgent); if (ua) detalle.navegador = ua
  }
  const rebote = anidado('bounce')
  if (rebote) {
    const m = cadena(rebote.message); if (m) detalle.motivo = m
    const t = cadena(rebote.type); if (t) detalle.tipoRebote = t
    const s = cadena(rebote.subType); if (s) detalle.subtipoRebote = s
  }
  const fallo = anidado('failed')
  if (fallo) { const m = cadena(fallo.reason); if (m) detalle.motivo = m }
  return { resendId, tipo: tipo as TipoEventoCorreo, ocurridoEn: cuando, detalle }
}

/** Etiqueta válida para Resend (solo letras, números, `_` y `-`). */
export function etiquetaTipo(tipo: string): string {
  return tipo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 256) || 'otro'
}
