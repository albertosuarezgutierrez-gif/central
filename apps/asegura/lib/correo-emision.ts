// El correo al cliente justo después de EMITIR su póliza (26/09/2026, dictado de Alberto: «enviar
// automáticamente mail con diseño moderno» y, en el mismo correo, el enlace para firmar la baja de la
// póliza anterior). El OK de este envío concreto es la pulsación de «Emitir».
//
// 🚨 No nombra NADA de la cartera — ni compañía, ni número, ni matrícula, ni prima — por lo mismo que
// la invitación al portal: la dirección la tecleó alguien y puede ser un buzón compartido. Los datos se
// ven DENTRO del portal, cuando la persona ha probado que es ella con el código. Por eso la función ni
// siquiera los RECIBE: no se puede colar lo que no entra. Lo vigila `correo-emision.test.ts` con la
// misma lista que la invitación (`CAMPOS_PROHIBIDOS_EN_INVITACION`).
import { REMITENTE_CORREDURIA } from '@central/module-seguros'
import { LOGO_CORREO } from './correo-felicitacion.ts'

export type DatosCorreoEmision = {
  /** `null` = la ficha no tiene un nombre legible: se saluda sin nombre, nunca «Estimado cliente». */
  nombre: string | null
  /** El portal (`enlacePortal()`): https o no se envía. */
  enlace: string
  /** `true` = hay una póliza anterior con su carta de baja esperando la firma del cliente. */
  conBaja: boolean
}

export type CuerpoCorreoEmision = { asunto: string; texto: string; html: string }

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const AZUL = '#3364ee'
const TINTA = '#1b2340'
const SUAVE = '#f3f5fc'

export function cuerpoCorreoEmision(d: DatosCorreoEmision): CuerpoCorreoEmision {
  if (!/^https:\/\//.test(d.enlace)) throw new Error('enlace_no_https')
  const nombre = d.nombre?.replace(/[\r\n]+/g, ' ').trim() || null
  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:'
  const asunto = 'Tu nuevo seguro ya está emitido'
  const p1 = 'Tu nuevo seguro ya está emitido y en vigor desde la fecha de efecto que acordamos. En tu área de clientes lo tienes todo: los datos del seguro y la póliza en PDF en cuanto nos llegue.'
  const bajaTitulo = 'Falta un paso: firma la baja de tu seguro anterior'
  const bajaTexto = 'Para que tu seguro anterior no se renueve y no pagues dos, hay que comunicar que no continúas. Tienes la carta preparada en tu área de clientes: revísala y fírmala con un código que te llega a este correo. Nosotros la enviamos por ti.'
  const acceso = 'Entras con este mismo correo: te mandamos un código de un solo uso, sin contraseñas.'
  const boton = d.conBaja ? 'Revisar y firmar la carta' : 'Entrar en mi área de clientes'
  const cierre = 'Si algo no cuadra, responde a este correo y lo vemos contigo.'

  const texto = [
    saludo, '', p1, '',
    ...(d.conBaja ? [bajaTitulo.toUpperCase(), bajaTexto, ''] : []),
    `${boton}: ${d.enlace}`, acceso, '', cierre, '',
    'El equipo de Grupo ASegura', `Grupo ASegura · ${REMITENTE_CORREDURIA}`,
  ].join('\n')

  const cuerpo = "font-family:'Nunito Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
  const titular = 'font-family:Quicksand,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-weight:700'
  const botonHtml = `<a href="${escapar(d.enlace)}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;${titular};font-size:16px;padding:13px 22px;border-radius:10px">${escapar(boton)}</a>`
  const html = [
    `<div style="background:${SUAVE};padding:24px 12px">`,
    `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e9f5;${cuerpo};color:${TINTA}">`,
    `<div style="padding:26px 32px 18px;border-bottom:4px solid ${AZUL}"><img src="${LOGO_CORREO}" width="220" height="32" alt="Grupo ASegura" style="display:block;width:220px;height:auto;border:0"></div>`,
    `<div style="padding:28px 32px">`,
    `<p style="${titular};font-size:24px;line-height:1.25;color:${TINTA};margin:0 0 14px">Tu nuevo seguro ya está emitido</p>`,
    `<p style="font-size:16px;line-height:1.6;margin:0 0 6px">${escapar(saludo)}</p>`,
    `<p style="font-size:16px;line-height:1.6;margin:0 0 20px">${escapar(p1)}</p>`,
    d.conBaja
      ? `<div style="border:2px solid ${AZUL};border-radius:14px;padding:18px 20px;background:#f3f6ff;margin:0 0 20px">` +
        `<p style="${titular};font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${AZUL};margin:0 0 8px">Falta un paso</p>` +
        `<p style="${titular};font-size:18px;line-height:1.3;margin:0 0 8px">Firma la baja de tu seguro anterior</p>` +
        `<p style="font-size:15px;line-height:1.6;margin:0 0 16px">${escapar(bajaTexto)}</p>${botonHtml}` +
        `<p style="font-size:13px;line-height:1.5;color:#5a6280;margin:12px 0 0">Tarda un minuto. ${escapar(acceso)}</p></div>`
      : `<p style="margin:0 0 12px">${botonHtml}</p><p style="font-size:13px;line-height:1.5;color:#5a6280;margin:0 0 20px">${escapar(acceso)}</p>`,
    `<p style="font-size:15px;line-height:1.6;margin:0">${escapar(cierre)}</p>`,
    `<p style="font-size:15px;line-height:1.5;margin:18px 0 0"><strong>El equipo de Grupo ASegura</strong></p>`,
    `</div>`,
    `<div style="background:${SUAVE};padding:16px 32px;font-size:12px;line-height:1.5;color:#5a6280">Grupo ASegura · ${REMITENTE_CORREDURIA}</div>`,
    `</div></div>`,
  ].join('')
  return { asunto, texto, html }
}
