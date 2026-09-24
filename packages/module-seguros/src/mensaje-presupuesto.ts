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

export function correoPresupuesto(d: DatosAvisoPresupuesto): CorreoPresupuesto {
  const asunto = 'Tu presupuesto de seguro está listo'
  const lineas = [
    `${saludo(d.nombre)}:`,
    'Te he preparado un presupuesto de seguro. Para verlo, abre este enlace y entra con este mismo correo; te llegará un código de acceso.',
    d.enlace,
    `Es válido hasta el ${fechaEs(d.venceEl)}.`,
    lineaDatosQueFaltan(d.faltanDatos),
    'Si tienes cualquier duda, responde a este correo.',
    'Alberto Suárez · Grupo ASegura',
  ].filter((l): l is string => l !== null)
  const texto = lineas.join('\n\n')
  const html = lineas
    .map((l) => (l === d.enlace ? `<p><a href="${escapar(d.enlace)}">Ver mi presupuesto</a></p>` : `<p>${escapar(l)}</p>`))
    .join('\n')
  return { asunto, texto, html }
}
