import { createMailTransporter } from '@central/core-email'
import type { Canal } from './canal'

export const canalEmail: Canal = {
  tipo: 'email',
  async enviarCodigo(destino, codigo) {
    // `null` = no hay proveedor configurado. Se devuelve false y quien llama lo
    // cuenta como «no se pudo enviar», que es la verdad.
    const transporter = createMailTransporter()
    if (!transporter) return false

    const from = process.env.PORTAL_MAIL_FROM
    if (!from) {
      console.error('[portal] falta PORTAL_MAIL_FROM: no se envía el código')
      return false
    }

    try {
      await transporter.sendMail({
        from,
        to: destino,
        subject: `${codigo} es tu código de acceso`,
        text: `Tu código para entrar en Mis Seguros es ${codigo}. Caduca en 10 minutos.\n\nSi no lo has pedido tú, ignora este correo.`,
      })
      return true
    } catch (e) {
      console.error('[portal] fallo enviando el código por email:', e)
      return false
    }
  },
}
