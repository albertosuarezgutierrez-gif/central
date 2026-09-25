// El correo de cumpleaños (24/09/2026). Corto y sin nada que vender, a propósito: una felicitación
// con una oferta dentro deja de ser una felicitación y pasa a ser una comunicación comercial
// (art. 21 LSSI), que exige otro consentimiento. Tampoco nombra pólizas, compañías ni importes: el
// buzón puede ser compartido. Lo vigila `felicitaciones.test.ts`.
import { REMITENTE_CORREDURIA, remitenteCorreo } from '@central/module-seguros'

export type DatosFelicitacion = { nombre: string | null; enlace: string }

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Logo en PNG servido por la web pública (apps/asegura-web/public/brand): Gmail y Outlook no pintan
// SVG, y el portal/asegura van tras login. Colores = MARCA_ASEGURA (@central/brand) en hex: en un
// correo no hay oklch ni variables CSS.
export const LOGO_CORREO = 'https://grupoasegura.es/brand/logotipo-asegura-correo.png'
const AZUL = '#3364ee'
const TINTA = '#1b2340'

export function cuerpoFelicitacion(d: DatosFelicitacion): { asunto: string; texto: string; html: string } {
  if (!/^https:\/\//.test(d.enlace)) throw new Error('enlace_no_https')
  const nombre = d.nombre?.trim() || null
  const saludo = nombre ? `¡Feliz cumpleaños, ${nombre}!` : '¡Feliz cumpleaños!'
  const p1 = 'Hoy es tu día y desde Grupo ASegura queríamos acordarnos de ti. Te deseamos un cumpleaños estupendo, rodeado de los tuyos.'
  const p2 = 'Gracias por seguir confiando en nosotros.'
  const baja = 'Si prefieres no recibir estas felicitaciones, contesta a este correo y dejamos de enviarlas.'
  const texto = [saludo, '', p1, '', p2, '', `Tu área de clientes: ${d.enlace}`, '', 'Un abrazo,', 'El equipo de Grupo ASegura', '', `Grupo ASegura · ${REMITENTE_CORREDURIA}`, baja].join('\n')
  const cuerpo = 'font-family:\'Nunito Sans\',system-ui,-apple-system,Segoe UI,Roboto,sans-serif'
  const titular = 'font-family:Quicksand,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-weight:700'
  const html = [
    `<div style="background:#f3f5fc;padding:24px 12px">`,
    `<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e9f5;${cuerpo};color:${TINTA}">`,
    `<div style="padding:28px 32px 20px;border-bottom:4px solid ${AZUL}"><img src="${LOGO_CORREO}" width="220" height="32" alt="Grupo ASegura" style="display:block;width:220px;height:auto;border:0"></div>`,
    `<div style="padding:28px 32px">`,
    `<p style="${titular};font-size:26px;line-height:1.25;color:${AZUL};margin:0 0 14px">${escapar(saludo)} 🎂</p>`,
    `<p style="font-size:16px;line-height:1.6;margin:0 0 14px">${escapar(p1)}</p>`,
    `<p style="font-size:16px;line-height:1.6;margin:0 0 22px">${escapar(p2)}</p>`,
    `<a href="${escapar(d.enlace)}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;${titular};font-size:16px;padding:12px 22px;border-radius:10px">Tu área de clientes</a>`,
    `<p style="font-size:16px;line-height:1.5;margin:26px 0 0">Un abrazo,<br><strong>El equipo de Grupo ASegura</strong></p>`,
    `</div>`,
    `<div style="background:#f3f5fc;padding:16px 32px;font-size:12px;line-height:1.5;color:#5a6280">Grupo ASegura · ${REMITENTE_CORREDURIA}<br>${escapar(baja)}</div>`,
    `</div></div>`,
  ].join('')
  return { asunto: saludo, texto, html }
}

export type ResultadoFelicitacion = 'enviado' | 'sin_proveedor' | 'rechazado'

export async function enviarFelicitacion(destino: string, d: DatosFelicitacion): Promise<ResultadoFelicitacion> {
  // Import dinámico: el cepo del cuerpo corre con `node --test`, que no resuelve `@central/core-email`.
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter) return 'sin_proveedor'
  const from = remitenteCorreo(process.env.ASEGURA_MAIL_FROM)
  const replyTo = process.env.ASEGURA_MAIL_REPLY_TO?.trim() || undefined
  const { asunto, texto, html } = cuerpoFelicitacion(d)
  try {
    await transporter.sendMail({ from, to: destino, ...(replyTo ? { replyTo } : {}), subject: asunto, text: texto, html })
    return 'enviado'
  } catch (e) {
    console.error('[asegura/felicitaciones] fallo enviando:', e instanceof Error ? e.message : e)
    return 'rechazado'
  }
}
