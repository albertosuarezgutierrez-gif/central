// El correo de cumpleaños (24/09/2026). Corto y sin nada que vender, a propósito: una felicitación
// con una oferta dentro deja de ser una felicitación y pasa a ser una comunicación comercial
// (art. 21 LSSI), que exige otro consentimiento. Tampoco nombra pólizas, compañías ni importes: el
// buzón puede ser compartido. Lo vigila `felicitaciones.test.ts`.
import { remitenteCorreo } from '@central/module-seguros'

export type DatosFelicitacion = { nombre: string | null; enlace: string }

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function cuerpoFelicitacion(d: DatosFelicitacion): { asunto: string; texto: string; html: string } {
  if (!/^https:\/\//.test(d.enlace)) throw new Error('enlace_no_https')
  const nombre = d.nombre?.trim() || null
  const saludo = nombre ? `¡Feliz cumpleaños, ${nombre}!` : '¡Feliz cumpleaños!'
  const cuerpo = 'Desde Grupo ASegura te deseamos un día estupendo. Gracias por seguir confiando en nosotros.'
  const baja = 'Si prefieres no recibir estas felicitaciones, contesta a este correo y dejamos de enviarlas.'
  const texto = [saludo, '', cuerpo, '', `Tu área de clientes: ${d.enlace}`, '', 'Un abrazo,', 'Grupo ASegura', '', baja].join('\n')
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111">',
    `<p style="font-size:20px"><strong>${escapar(saludo)}</strong> 🎂</p>`,
    `<p>${escapar(cuerpo)}</p>`,
    `<p><a href="${escapar(d.enlace)}" style="color:#2563eb">Tu área de clientes</a></p>`,
    '<p>Un abrazo,<br>Grupo ASegura</p>',
    `<p style="color:#555;font-size:12px">${escapar(baja)}</p>`,
    '</div>',
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
