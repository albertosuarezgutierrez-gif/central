import { createMailTransporter } from '@central/core-email'
import type { Canal } from './canal'
import { enlaceDeAcceso } from './enlace-acceso'

/** Escapa lo que va dentro del HTML del correo. El destino lo escribe el usuario. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

    // El enlace es una comodidad, no el mecanismo: si no hay dominio
    // configurado el correo sale igual con el código, que es lo que de verdad
    // abre la puerta. Nunca al revés.
    const enlace = enlaceDeAcceso(destino, codigo)

    const texto = enlace
      ? `Tu código para entrar en Mis Seguros es ${codigo}. Caduca en 10 minutos.\n\n` +
        `O entra directamente desde aquí:\n${enlace}\n\n` +
        `Si no lo has pedido tú, ignora este correo.`
      : `Tu código para entrar en Mis Seguros es ${codigo}. Caduca en 10 minutos.\n\n` +
        `Si no lo has pedido tú, ignora este correo.`

    const html =
      `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px">` +
      `<p>Tu código para entrar en <strong>Mis Seguros</strong> es:</p>` +
      `<p style="font-size:28px;letter-spacing:4px;font-weight:700;margin:16px 0">${esc(codigo)}</p>` +
      (enlace
        ? `<p><a href="${esc(enlace)}" style="display:inline-block;padding:12px 20px;` +
          `background:#0b5;color:#fff;text-decoration:none;border-radius:8px">Entrar en Mis Seguros</a></p>` +
          `<p style="color:#666;font-size:13px">El botón te lleva a la pantalla con el código ya puesto; ` +
          `solo tienes que pulsar «Entrar».</p>`
        : '') +
      `<p style="color:#666;font-size:13px">Caduca en 10 minutos. Si no lo has pedido tú, ignora este correo.</p>` +
      `</div>`

    try {
      await transporter.sendMail({
        from,
        to: destino,
        subject: `${codigo} es tu código de acceso`,
        text: texto,
        html,
      })
      return true
    } catch (e) {
      console.error('[portal] fallo enviando el código por email:', e)
      return false
    }
  },
}
