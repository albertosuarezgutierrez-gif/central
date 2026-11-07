// Canal de correo del código de acceso: mismo proveedor que rrhh y asegura-portal (`createMailTransporter` de core-email:
// RESEND_API_KEY → SMTP_* → GMAIL_*) y misma marca de correo (`conMarcaCorreo`/`remitenteCorreo` de module-seguros).
import { createMailTransporter } from '@central/core-email'
import { conMarcaCorreo, remitenteCorreo } from '@central/module-seguros'
import { VALIDEZ_MINUTOS } from '@central/core-identity/codigo-otp'
import type { CanalCodigo } from './acceso'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** Asunto, texto y HTML del correo del código. Puro para testearlo. */
export function correoCodigoAcceso(codigo: string): { subject: string; text: string; html: string } {
  const pie = `Caduca en ${VALIDEZ_MINUTOS} minutos y solo sirve una vez. Si no lo has pedido tú, ignora este correo: nadie podrá entrar sin el código.`
  return {
    subject: `${codigo} es tu código para entrar en Contabilidad`,
    text: `Tu código para entrar en Contabilidad es ${codigo}.\n\n${pie}\n`,
    html: conMarcaCorreo(
      `<div style="max-width:420px">` +
      `<p>Tu código para entrar en <strong>Contabilidad</strong> es:</p>` +
      `<p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:16px 0">${esc(codigo)}</p>` +
      `<p style="color:#6b7280;font-size:13px">${esc(pie)}</p></div>`,
    ),
  }
}

/** `null` = no hay proveedor de correo configurado (la ruta responde 503). `enviar` no lanza: 'fallido' si el proveedor falla. */
export function obtenerCanalCorreo(): CanalCodigo | null {
  const transporter = createMailTransporter()
  if (!transporter) return null
  return {
    conectado: true,
    async enviar({ to, codigo }) {
      const m = correoCodigoAcceso(codigo)
      try {
        await transporter.sendMail({ from: remitenteCorreo(process.env.CONTABILIDAD_MAIL_FROM), to, subject: m.subject, text: m.text, html: m.html })
        return 'enviado'
      } catch (e) {
        console.error('[contabilidad] fallo enviando el código por correo:', e instanceof Error ? e.message : 'desconocido')
        return 'fallido'
      }
    },
  }
}
