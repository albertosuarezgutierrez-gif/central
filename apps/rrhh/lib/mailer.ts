import { createMailTransporter } from '@central/core-email'

// Remitente de iarrhh. Reusamos el dominio verificado en Resend de ia.rest
// (`iarest.es`) con DISPLAY 'iarrhh' para que el empleado vea la marca correcta.
// Requiere `RESEND_API_KEY` en el proyecto Vercel central-rrhh (mismo valor que ia-rest).
export const MAIL_FROM = process.env.MAIL_FROM || 'iarrhh <hola@iarest.es>'

// Transporter multi-proveedor (Resend → SMTP → Gmail) vía el núcleo compartido.
// Devuelve null si no hay credenciales → el llamante marca el correo como no enviado.
export function getTransporter() {
  return createMailTransporter()
}
