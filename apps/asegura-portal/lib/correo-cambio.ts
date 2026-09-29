// El correo con el código para CONFIRMAR un correo nuevo en la ficha. Aparte de `canal-email.ts`
// a propósito: aquel dice «tu código para entrar» y lleva el enlace de acceso, y este código no
// abre sesión — decirle a alguien «entra con esto» sería mentirle.
import { createMailTransporter } from '@central/core-email'
import { remitenteCorreo } from '@central/module-seguros'

export async function enviarCodigoCambioCorreo(destino: string, codigo: string): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[portal/cambio-correo] código para ${destino}: ${codigo}`)
    return true
  }
  const transporter = createMailTransporter()
  if (!transporter) return false
  const replyTo = process.env.PORTAL_MAIL_REPLY_TO?.trim() || undefined
  const texto =
    `Tu código para confirmar este correo en Mis Seguros es ${codigo}. Caduca en 10 minutos.\n\n` +
    `Si no has pedido cambiar tu correo, ignora este mensaje: no se cambiará nada.`
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px">` +
    `<p>Tu código para confirmar este correo en <strong>Mis Seguros</strong> es:</p>` +
    `<p style="font-size:28px;letter-spacing:4px;font-weight:700;margin:16px 0">${codigo.replace(/\D/g, '')}</p>` +
    `<p style="color:#666;font-size:13px">Caduca en 10 minutos. Si no has pedido cambiar tu correo, ignora este mensaje: no se cambiará nada.</p>` +
    `</div>`
  try {
    await transporter.sendMail({
      from: remitenteCorreo(process.env.PORTAL_MAIL_FROM),
      to: destino,
      ...(replyTo ? { replyTo } : {}),
      subject: `${codigo} es tu código para confirmar tu correo`,
      text: texto,
      html,
    })
    return true
  } catch (e) {
    console.error('[portal/cambio-correo] fallo enviando el código:', e instanceof Error ? e.message : e)
    return false
  }
}

/**
 * El código para confirmar el cambio de la cuenta de los recibos. Lleva la máscara de la cuenta nueva
 * para que la persona reconozca lo que confirma, y dice qué hacer si no lo ha pedido ella.
 */
export async function enviarCodigoCambioCuenta(destino: string, codigo: string, mascara: string): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[portal/cambio-cuenta] código para ${destino}: ${codigo} (${mascara})`)
    return true
  }
  const transporter = createMailTransporter()
  if (!transporter) return false
  const replyTo = process.env.PORTAL_MAIL_REPLY_TO?.trim() || undefined
  const aviso = 'Si no has pedido tú este cambio, no compartas el código con nadie y contesta a este correo: no se cambiará nada.'
  const texto =
    `Tu código para confirmar que los recibos de tus seguros se carguen en la cuenta ${mascara} es ${codigo}. ` +
    `Caduca en 10 minutos.\n\n${aviso}`
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px">` +
    `<p>Tu código para confirmar que los recibos de tus seguros se carguen en la cuenta <strong>${mascara.replace(/[^\d* ]/g, '')}</strong> es:</p>` +
    `<p style="font-size:28px;letter-spacing:4px;font-weight:700;margin:16px 0">${codigo.replace(/\D/g, '')}</p>` +
    `<p style="color:#666;font-size:13px">Caduca en 10 minutos. ${aviso}</p>` +
    `</div>`
  try {
    await transporter.sendMail({
      from: remitenteCorreo(process.env.PORTAL_MAIL_FROM),
      to: destino,
      ...(replyTo ? { replyTo } : {}),
      subject: `${codigo} es tu código para cambiar la cuenta de tus recibos`,
      text: texto,
      html,
    })
    return true
  } catch (e) {
    console.error('[portal/cambio-cuenta] fallo enviando el código:', e instanceof Error ? e.message : e)
    return false
  }
}
