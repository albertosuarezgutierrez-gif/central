// El AVISO de que hay un presupuesto preparado (spec 2026-09-21, §3.3, PR 3): el
// correo que manda asegura y el texto que Alberto abre en WhatsApp.
//
// 🚨 El aviso NO lleva precio, ni compañía, ni el bien asegurado. Puede caer en un
// buzón compartido o en el móvil de un hogar (740 números compartidos por 1.599
// fichas), y un presupuesto de salud, vida o decesos roza el dato de salud. Lo que
// abre el contenido es el código de un solo uso al correo de la persona, en el
// portal; el aviso solo dice QUE hay algo y DÓNDE mirarlo.
//
// El texto vive aquí, en el módulo puro, para pasar por `revisarCopy()` como el
// resto de mensajes a clientes.

export type DatosAvisoPresupuesto = {
  /** Nombre de pila o completo del tomador; `null` = se saluda sin nombre, nunca con «null». */
  nombre: string | null
  /** El enlace a la carátula del portal (`/presupuesto/<token>`). */
  enlace: string
  /** Hasta cuándo vale. Se pinta en hora de Madrid como fecha, sin hora. */
  venceEl: Date
  /** El correo con el que tiene que entrar: el mismo al que va el código. */
  email: string
  /**
   * Cuántos datos suyos faltan para poder emitir (§4bis). Solo el NÚMERO: el aviso nunca pide el DNI
   * ni la cuenta — un correo que pide datos no se distingue de un phishing. `null`/0 = no se menciona.
   */
  faltanDatos?: number | null
  /**
   * Enlace de ACCESO DIRECTO a la intranet (un solo uso, 24 h, `enlace-directo.ts` del portal). Si
   * viene, el botón entra sin código; el enlace de siempre (`enlace`) queda al pie para cuando ya se
   * haya usado o caducado. Firmar sigue pidiendo su código aparte.
   */
  enlaceDirecto?: string | null
}

/** La línea de «me faltan N datos tuyos», o `null` si no hay que decirla. */
export function lineaDatosQueFaltan(n: number | null | undefined): string | null {
  if (!n || n < 1) return null
  return `Para poder contratarlo me ${n === 1 ? 'falta un dato tuyo' : `faltan ${n} datos tuyos`}: los confirmas dentro, en un minuto. Nunca te los pediré por correo ni por WhatsApp.`
}

function fechaEs(d: Date): string {
  return d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function saludo(nombre: string | null): string {
  const n = nombre?.trim()
  return n ? `Hola, ${n.split(/\s+/)[0]}` : 'Hola'
}

export function mensajePresupuestoWhatsapp(d: DatosAvisoPresupuesto): string {
  return [
    `${saludo(d.nombre)}. Soy Alberto, de Grupo ASegura.`,
    `Te he preparado un presupuesto de seguro. Lo puedes ver aquí: ${d.enlace}`,
    `Para abrirlo entra con tu correo ${d.email}: te llegará un código.`,
    `Es válido hasta el ${fechaEs(d.venceEl)}. Cualquier duda, me dices.`,
    lineaDatosQueFaltan(d.faltanDatos),
  ].filter((l): l is string => l !== null).join('\n\n')
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export type CorreoPresupuesto = { asunto: string; texto: string; html: string }

// Mismo lenguaje que el correo de cumpleaños (apps/asegura/lib/correo-felicitacion.ts): logo PNG
// (Gmail y Outlook no pintan SVG), azul de marca en hex (en un correo no hay oklch) y botón grande.
const LOGO_CORREO = 'https://grupoasegura.es/brand/logotipo-asegura-correo.png'
const AZUL = '#3364ee'
const TINTA = '#1b2340'

export function correoPresupuesto(d: DatosAvisoPresupuesto): CorreoPresupuesto {
  const asunto = 'Tu presupuesto de seguro está listo'
  const vence = `Es válido hasta el ${fechaEs(d.venceEl)}.`
  const faltan = lineaDatosQueFaltan(d.faltanDatos)
  const directo = d.enlaceDirecto?.trim() || null
  const lineas = [
    `${saludo(d.nombre)}:`,
    directo
      ? 'Te he preparado un presupuesto de seguro. Entra en tu área de clientes con este enlace (vale una vez, durante 24 horas):'
      : 'Te he preparado un presupuesto de seguro. Para verlo, abre este enlace y entra con este mismo correo; te llegará un código de acceso.',
    directo ?? d.enlace,
    ...(directo ? [`Si ese enlace ya no abre, entra aquí con tu correo y te llegará un código: ${d.enlace}`] : []),
    vence,
    faltan,
    'Si tienes cualquier duda, responde a este correo.',
    'Alberto Suárez · Grupo ASegura',
  ].filter((l): l is string => l !== null)
  const texto = lineas.join('\n\n')

  const cuerpo = "font-family:'Nunito Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
  const titular = 'font-family:Quicksand,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-weight:700'
  const p = (t: string, extra = '') => `<p style="font-size:16px;line-height:1.6;margin:0 0 14px${extra}">${escapar(t)}</p>`
  const paso = (n: number, t: string) =>
    `<tr><td style="width:28px;vertical-align:top;padding:0 0 10px"><span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:11px;background:${AZUL};color:#fff;text-align:center;font-size:12px;${titular}">${n}</span></td>` +
    `<td style="font-size:15px;line-height:1.5;padding:0 0 10px">${escapar(t)}</td></tr>`
  const html = [
    `<div style="background:#f3f5fc;padding:24px 12px">`,
    `<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e9f5;${cuerpo};color:${TINTA}">`,
    `<div style="padding:28px 32px 20px;border-bottom:4px solid ${AZUL}"><img src="${LOGO_CORREO}" width="220" height="32" alt="Grupo ASegura" style="display:block;width:220px;height:auto;border:0"></div>`,
    `<div style="padding:28px 32px">`,
    `<p style="${titular};font-size:24px;line-height:1.25;color:${AZUL};margin:0 0 14px">${escapar(saludo(d.nombre))}, tu presupuesto está listo</p>`,
    p('Te he preparado un presupuesto de seguro para que elijas la opción que mejor te encaje.'),
    `<div style="text-align:center;margin:22px 0"><a href="${escapar(directo ?? d.enlace)}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;${titular};font-size:17px;padding:14px 28px;border-radius:10px">Ver mi presupuesto</a></div>`,
    `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#f3f5fc;border-radius:10px;margin:0 0 18px"><tr><td style="padding:16px 18px"><table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse">`,
    paso(1, 'Pulsa «Ver mi presupuesto».'),
    paso(2, directo ? 'Pulsa «Entrar»: accedes directamente a tu área de clientes.' : 'Entra con este mismo correo: te llegará un código de acceso.'),
    paso(3, 'Elige la opción que prefieras y fírmala con el código que te llegará al correo.'),
    `</table></td></tr></table>`,
    p(vence, ';font-weight:700'),
    faltan ? p(faltan) : '',
    p('Si tienes cualquier duda, responde a este correo.'),
    `<p style="font-size:16px;line-height:1.5;margin:22px 0 0">Un saludo,<br><strong>Alberto Suárez</strong><br>Grupo ASegura</p>`,
    `</div>`,
    `<div style="background:#f3f5fc;padding:14px 32px;font-size:12px;line-height:1.5;color:#5a6280">${directo ? 'El botón vale una sola vez y durante 24 horas. Si ya no abre, entra aquí con tu correo y te llegará un código:' : 'Si el botón no funciona, copia este enlace en el navegador:'}<br><a href="${escapar(d.enlace)}" style="color:${AZUL};word-break:break-all">${escapar(d.enlace)}</a></div>`,
    `</div></div>`,
  ].join('')
  return { asunto, texto, html }
}
