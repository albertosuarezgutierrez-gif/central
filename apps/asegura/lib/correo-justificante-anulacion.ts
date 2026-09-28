// El cuerpo del correo con la baja firmada (28/09/2026), PURO y en su propio fichero para que su cepo
// lo EJECUTE sin cargar la BD. Quién lo manda y cuándo: `justificante-anulacion.ts`.
import { REMITENTE_CORREDURIA } from '@central/module-seguros'
import { LOGO_CORREO } from './correo-felicitacion.ts'

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const AZUL = '#3364ee'
const TINTA = '#1b2340'
const SUAVE = '#f3f5fc'

function fechaEs(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export type DatosCorreoJustificante = {
  /** `null` = sin nombre legible: se saluda sin nombre. */
  nombre: string | null
  /** `null` = no consta: se dice «tu seguro», nunca un nombre supuesto. */
  compania: string | null
  tipo: 'no_renovacion' | 'inmediata' | 'sustitucion'
  fechaEfecto: string
  /** Fecha (YYYY-MM-DD) en que firmó. */
  firmadaEl: string
  /** `true` = ya salió hacia la compañía; `false` = sale después (espera la emisión o el OK del corredor). */
  comunicada: boolean
  enlace: string
  /** `false` = no se pudo montar el PDF: sale solo el texto firmado y el correo no promete un PDF. */
  conPdf: boolean
  /** `false` = no consta archivado en su póliza: el correo no promete que esté en el área de clientes. */
  enPortal: boolean
}

/**
 * El cuerpo, PURO. No lleva número de póliza ni datos de la ficha en el texto (van en el PDF adjunto,
 * como en el resto de correos al cliente); sí la compañía y la fecha, que es lo que la persona reconoce.
 */
export function cuerpoCorreoJustificante(d: DatosCorreoJustificante): { asunto: string; texto: string; html: string } {
  if (!/^https:\/\//.test(d.enlace)) throw new Error('enlace_no_https')
  const nombre = d.nombre?.replace(/[\r\n]+/g, ' ').trim() || null
  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:'
  const seguro = d.compania?.trim() ? `tu seguro de ${d.compania.trim()}` : 'tu seguro'
  const que = d.tipo === 'no_renovacion'
    ? `la no renovación de ${seguro} (efecto al vencimiento, el ${fechaEs(d.fechaEfecto)})`
    : `la baja de ${seguro} con efecto el ${fechaEs(d.fechaEfecto)}`
  const asunto = d.tipo === 'no_renovacion' ? 'Tu carta de no renovación, firmada' : 'Tu baja firmada: aquí tienes el justificante'
  const adjunto = d.conPdf
    ? 'Te adjuntamos el documento firmado con su justificante de firma electrónica: guárdalo.'
    : 'Te adjuntamos el texto exacto que firmaste: guárdalo.'
  const p1 = `Hemos recibido tu firma del ${fechaEs(d.firmadaEl)} de ${que}. ${adjunto}`
  const p2 = d.comunicada
    ? 'Ya se lo hemos enviado a la compañía. Te avisamos en cuanto nos confirme la baja.'
    : 'Nosotros se lo comunicamos a la compañía y te avisamos en cuanto nos confirme la baja.'
  const p3 = d.enPortal
    ? 'También lo tienes siempre en tu área de clientes, en la ficha de esa póliza.'
    : 'Puedes consultar el estado de tus seguros en tu área de clientes.'
  const cierre = 'Si algo no cuadra, responde a este correo y lo vemos contigo.'
  const texto = [saludo, '', p1, '', p2, '', p3, `Tu área de clientes: ${d.enlace}`, '', cierre, '', 'El equipo de Grupo ASegura', `Grupo ASegura · ${REMITENTE_CORREDURIA}`].join('\n')
  const cuerpo = "font-family:'Nunito Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
  const titular = 'font-family:Quicksand,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-weight:700'
  const parrafo = (t: string, abajo = 14) => `<p style="font-size:16px;line-height:1.6;margin:0 0 ${abajo}px">${escapar(t)}</p>`
  const html = [
    `<div style="background:${SUAVE};padding:24px 12px">`,
    `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e9f5;${cuerpo};color:${TINTA}">`,
    `<div style="padding:26px 32px 18px;border-bottom:4px solid ${AZUL}"><img src="${LOGO_CORREO}" width="220" height="32" alt="Grupo ASegura" style="display:block;width:220px;height:auto;border:0"></div>`,
    `<div style="padding:28px 32px">`,
    `<p style="${titular};font-size:24px;line-height:1.25;color:${TINTA};margin:0 0 14px">${escapar(asunto)}</p>`,
    parrafo(saludo, 6), parrafo(p1), parrafo(p2), parrafo(p3, 20),
    `<p style="margin:0 0 20px"><a href="${escapar(d.enlace)}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;${titular};font-size:16px;padding:13px 22px;border-radius:10px">Entrar en mi área de clientes</a></p>`,
    `<p style="font-size:15px;line-height:1.6;margin:0">${escapar(cierre)}</p>`,
    `<p style="font-size:15px;line-height:1.5;margin:18px 0 0"><strong>El equipo de Grupo ASegura</strong></p>`,
    `</div>`,
    `<div style="background:${SUAVE};padding:16px 32px;font-size:12px;line-height:1.5;color:#5a6280">Grupo ASegura · ${REMITENTE_CORREDURIA}</div>`,
    `</div></div>`,
  ].join('')
  return { asunto, texto, html }
}
