import { createMailTransporter } from '@central/core-email'

// Remitente único de toda la app (display = nombre de empresa en cada ruta).
export const MAIL_FROM = process.env.MAIL_FROM || 'hola@ialimp.es'

// Construye el transporter de correo desde variables de entorno (multi-proveedor:
// Resend → SMTP/IONOS → Gmail), vía el núcleo compartido @central/core-email.
// Devuelve null si no hay credenciales → la ruta marca el correo como no enviado.
export function getTransporter() {
  return createMailTransporter()
}
