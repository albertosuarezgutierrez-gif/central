// Correos de «Mi empresa»: mismo proveedor que contabilidad/rrhh (`createMailTransporter` de core-email: RESEND_API_KEY →
// SMTP_* → GMAIL_*), remitente ÚNICO hola@grupoasegura.es (`remitenteCorreo`) y la marca de correo de Grupo ASegura
// (`conMarcaCorreo`), ambos de @central/legal-templates (paquete neutro: esta app NO importa module-seguros).
//
// 🚨 Comunicaciones salientes: el CONTRATO y el RECORDATORIO salen SOLO del clic del operador (`lib/operador.ts`, `envio`
// con `confirmado_por`). Los CÓDIGOS los pide la propia persona. Nada más sale de aquí.
// El correo del contrato NO lleva el documento ni datos de la empresa más allá de su nombre: solo el enlace.
import { createMailTransporter } from '@central/core-email'
import { remitenteCorreo } from '@central/legal-templates/encargado'
import { conMarcaCorreo } from '@central/legal-templates/correo-marca'
import { VALIDEZ_MINUTOS } from '@central/core-identity/codigo-otp'
import type { CanalCodigo, Proposito } from './acceso.ts'

export const URL_PANEL = 'https://empresa.grupoasegura.es'
/** Base pública del panel (la env solo sirve para probar en una preview). */
export const urlPanel = () => (process.env.EMPRESA_PUBLIC_URL?.replace(/\/$/, '') || URL_PANEL)

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export type Correo = { subject: string; text: string; html: string }

export function correoCodigo(codigo: string, proposito: Proposito): Correo {
  const para = proposito === 'firma' ? 'firmar el contrato en Mi empresa' : 'entrar en Mi empresa'
  const pie = `Caduca en ${VALIDEZ_MINUTOS} minutos y solo sirve una vez. Si no lo has pedido tú, ignora este correo.`
  return {
    subject: `${codigo} es tu código para ${para}`,
    text: `Tu código para ${para} es ${codigo}.\n\n${pie}\n`,
    html: conMarcaCorreo(`<div style="max-width:420px"><p>Tu código para <strong>${esc(para)}</strong> es:</p>` +
      `<p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:16px 0">${esc(codigo)}</p>` +
      `<p style="color:#6b7280;font-size:13px">${esc(pie)}</p></div>`),
  }
}

/** Contrato o recordatorio: asunto y cuerpo FIJOS, el nombre de la empresa y el enlace. Ni adjunto ni más datos. */
export function correoContrato(e: { razonSocial: string; tipo: 'contrato' | 'recordatorio'; url: string }): Correo {
  const subject = e.tipo === 'contrato'
    ? `Contrato de encargo de ${e.razonSocial} pendiente de firma`
    : `Recordatorio: contrato de encargo de ${e.razonSocial} pendiente de firma`
  const cuerpo = 'Para poder usar las herramientas de gestión que Grupo ASegura pone a disposición de tu empresa, hace falta que leas y firmes el contrato de encargo del tratamiento (art. 28 RGPD). Se firma en un minuto desde «Mi empresa», con un código que te llegará al correo.'
  return {
    subject,
    text: `${cuerpo}\n\nEntra aquí: ${e.url}\n`,
    html: conMarcaCorreo(`<div style="max-width:480px"><p><strong>${esc(e.razonSocial)}</strong></p><p>${esc(cuerpo)}</p>` +
      `<p style="margin:20px 0"><a href="${esc(e.url)}" style="display:inline-block;background:#3364ee;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Ver y firmar el contrato</a></p>` +
      `<p style="color:#6b7280;font-size:13px">Si no esperabas este correo, contesta y lo revisamos.</p></div>`),
  }
}

export type ResultadoEnvio = { ok: true; id: string | null } | { ok: false; error: string }
export type CanalCorreo = { enviar(to: string, m: Correo): Promise<ResultadoEnvio> }

/** null = no hay proveedor configurado. `enviar` no lanza. */
export function obtenerCanal(): CanalCorreo | null {
  const t = createMailTransporter()
  if (!t) return null
  return {
    async enviar(to, m) {
      try {
        const info = await t.sendMail({ from: remitenteCorreo(process.env.EMPRESA_MAIL_FROM), to, subject: m.subject, text: m.text, html: m.html })
        return { ok: true, id: typeof info?.messageId === 'string' ? info.messageId : null }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : 'desconocido' }
      }
    },
  }
}

export function canalCodigos(): CanalCodigo | null {
  const c = obtenerCanal()
  if (!c) return null
  return {
    conectado: true,
    async enviar({ to, codigo, proposito }) {
      const r = await c.enviar(to, correoCodigo(codigo, proposito))
      if (!r.ok) console.error('[empresa] fallo enviando el código:', r.error)
      return r.ok ? 'enviado' : 'fallido'
    },
  }
}
