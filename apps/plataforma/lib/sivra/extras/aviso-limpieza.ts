// lib/sivra/extras/aviso-limpieza.ts — el email a la empresa de limpieza cuando el extra se paga.
//
// Destinatario: Si que Brilla (`limpiezascruzz@gmail.com`, confirmado por Alberto el 28/08/2026).
// Remitente `hola@ialimp.es` por el transporte que plataforma ya tiene montado, con Reply-To a su
// Gmail para que la respuesta de la limpieza le llegue a él y no a un buzón que nadie mira.
//
// 🚨 SI EL EMAIL FALLA, SE OYE. El extra ya está cobrado: un `catch` mudo aquí dejaría a un huésped
// pagando por una cuna que nadie va a montar, y a nadie enterado. El fallo se guarda en la fila y
// salta un aviso por Telegram.
import { getTransporter, MAIL_FROM } from '@/lib/mailer'
import { escapeHtml, tgAviso } from '@/lib/telegram'
import { eur } from '@/lib/dinero'

export const DESTINO_LIMPIEZA = process.env.SIVRA_EXTRAS_EMAIL_LIMPIEZA || 'limpiezascruzz@gmail.com'
export const COPIA_ALBERTO = process.env.SIVRA_EXTRAS_EMAIL_COPIA || 'alberto.suarez.gutierrez@gmail.com'

/** dd/mm/aaaa desde un ISO/date; deja igual lo que no reconozca. */
function fmt(f: string): string {
  const m = (f || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (f || '?')
}

export interface DatosAviso {
  piso: string
  direccion?: string
  checkIn: string
  checkOut: string
  extra: string
  instruccion: string
  precioCents: number
  huesped?: string
}

/** Asunto y cuerpo del aviso. Puro y testeable: es lo que lee una persona, no puede salir a medias. */
export function componerAviso(d: DatosAviso): { asunto: string; texto: string } {
  const asunto = `${d.piso} · ${fmt(d.checkIn)} · ${d.extra.toLowerCase()}`
  const texto = [
    `Hola:`,
    ``,
    `Un huésped ha contratado y PAGADO un extra para esta estancia:`,
    ``,
    `  Piso:     ${d.piso}${d.direccion ? ` (${d.direccion})` : ''}`,
    `  Entrada:  ${fmt(d.checkIn)}`,
    `  Salida:   ${fmt(d.checkOut)}`,
    d.huesped ? `  Huésped:  ${d.huesped}` : '',
    `  Extra:    ${d.extra} (${eur(d.precioCents / 100)}, ya cobrado)`,
    ``,
    `Qué hay que hacer:`,
    `  ${d.instruccion}`,
    ``,
    `Gracias.`,
  ].filter(Boolean).join('\n')
  return { asunto, texto }
}

/** Manda el aviso. Devuelve el desenlace — nunca lanza, pero tampoco lo esconde. */
export async function avisarLimpieza(d: DatosAviso): Promise<{ ok: boolean; error?: string }> {
  const { asunto, texto } = componerAviso(d)
  const transporter = getTransporter()
  if (!transporter) {
    const error = 'sin proveedor de email configurado (faltan SMTP_*/RESEND_API_KEY/GMAIL_*)'
    await avisarFallo(d, error)
    return { ok: false, error }
  }
  try {
    await transporter.sendMail({
      from: MAIL_FROM,
      to: DESTINO_LIMPIEZA,
      cc: COPIA_ALBERTO,
      replyTo: COPIA_ALBERTO,
      subject: asunto,
      text: texto,
    })
    return { ok: true }
  } catch (e: unknown) {
    const error = (e as Error)?.message || 'error desconocido al enviar'
    await avisarFallo(d, error)
    return { ok: false, error }
  }
}

/** El extra está cobrado y la limpieza NO se ha enterado: eso se dice, no se traga. */
async function avisarFallo(d: DatosAviso, error: string): Promise<void> {
  await tgAviso('pisos.extras-limpieza', 
    `🛑 <b>Extra pagado y la limpieza SIN avisar</b>\n` +
    `${escapeHtml(d.piso)} · entrada ${fmt(d.checkIn)} · ${escapeHtml(d.extra)}\n\n` +
    `El email a ${escapeHtml(DESTINO_LIMPIEZA)} no salió: <i>${escapeHtml(error)}</i>\n` +
    `Avísales tú y luego lo miramos.`,
  ).catch(() => {})
}
