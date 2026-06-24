// Shim de email para los crons de concursos (portados de ialimp). Reusa el
// transporte centralizado de @central/core-email (Resend / SMTP IONOS / Gmail
// según envs). Si no hay credenciales, getTransporter() devuelve null y los crons
// degradan sin romper. Las envs (SMTP_*/RESEND_API_KEY) deben existir en el
// proyecto Vercel `plataforma` para enviar de verdad.
import { createMailTransporter } from '@central/core-email'

export const MAIL_FROM = process.env.MAIL_FROM || 'hola@ialimp.es'

export function getTransporter() {
  return createMailTransporter()
}
