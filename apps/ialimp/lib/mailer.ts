import nodemailer from 'nodemailer'

// Remitente único de toda la app (display = nombre de empresa en cada ruta).
export const MAIL_FROM = process.env.MAIL_FROM || 'hola@ialimp.es'

// Timeouts (ms) para fallar rápido si el SMTP no responde: si no, la función
// serverless de Vercel se quedaría colgada hasta su propio timeout.
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 }

// Construye el transporter de correo desde variables de entorno.
// 0) Resend (preferido): RESEND_API_KEY → SMTP de Resend (smtp.resend.com:465).
//    Requiere el dominio (ialimp.es) verificado en Resend para usar MAIL_FROM.
// 1) SMTP genérico (IONOS u otro): SMTP_USER + SMTP_PASSWORD
//    (host/puerto por defecto = IONOS España: smtp.ionos.es:465 SSL).
// 2) Fallback Gmail: GMAIL_USER + GMAIL_APP_PASSWORD.
// Devuelve null si no hay credenciales → la ruta marca el correo como no enviado.
export function getTransporter() {
  if (process.env.RESEND_API_KEY) {
    console.info('[mailer] proveedor: Resend (smtp.resend.com)')
    return nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: process.env.RESEND_API_KEY },
      ...TIMEOUTS,
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
      ...TIMEOUTS,
    })
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    console.info('[mailer] proveedor: Gmail')
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      ...TIMEOUTS,
    })
  }
  console.warn('[mailer] sin proveedor de email configurado (falta RESEND_API_KEY / SMTP_* / GMAIL_*)')
  return null
}
