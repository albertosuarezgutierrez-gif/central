import nodemailer, { type Transporter } from 'nodemailer'

// Timeouts (ms) para fallar rápido si el SMTP no responde: si no, la función
// serverless de Vercel se quedaría colgada hasta su propio timeout.
export const MAIL_TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 }

/**
 * Transporter de Gmail explícito (`GMAIL_USER` + `GMAIL_APP_PASSWORD`). Devuelve
 * null si faltan las credenciales. Útil para verticales que SOLO usan Gmail y no
 * quieren la selección multi-proveedor.
 */
export function gmailTransporter(): Transporter | null {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      ...MAIL_TIMEOUTS,
    })
  }
  return null
}

/**
 * Transporter multi-proveedor por orden de preferencia desde variables de entorno:
 *   0) Resend  — `RESEND_API_KEY` → SMTP de Resend (smtp.resend.com:465 SSL).
 *   1) SMTP    — `SMTP_USER` + `SMTP_PASSWORD` (host/puerto por defecto IONOS ES).
 *   2) Gmail   — `GMAIL_USER` + `GMAIL_APP_PASSWORD`.
 * Devuelve null si no hay credenciales → el llamante marca el correo como no enviado.
 * El remitente (`from`) lo pone cada vertical al enviar.
 */
export function createMailTransporter(): Transporter | null {
  if (process.env.RESEND_API_KEY) {
    console.info('[mailer] proveedor: Resend (smtp.resend.com)')
    return nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: process.env.RESEND_API_KEY },
      ...MAIL_TIMEOUTS,
    })
  }
  if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    const host = process.env.SMTP_HOST || 'smtp.ionos.es'
    const port = Number(process.env.SMTP_PORT || 465)
    console.info(`[mailer] proveedor: SMTP (${host}:${port})`)
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = SSL; 587 = STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      ...MAIL_TIMEOUTS,
    })
  }
  const gmail = gmailTransporter()
  if (gmail) {
    console.info('[mailer] proveedor: Gmail')
    return gmail
  }
  console.warn('[mailer] sin proveedor de email configurado (falta RESEND_API_KEY / SMTP_* / GMAIL_*)')
  return null
}
