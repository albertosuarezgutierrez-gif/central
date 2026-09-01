// lib/sivra/mensajes-prog/plantillas.ts — los 7 mensajes del ciclo de una reserva, DETERMINISTAS.
//
// Sustituyen a las plantillas automáticas de Smoobu (inventario medido el 31/08/2026 sobre 8 hilos
// reales). Reglas de diseño, decididas con Alberto:
//  - TEXTO PLANO PRIMERO: lo crítico (dirección, pasos, códigos) va escrito en el mensaje — el hilo
//    del portal y el email funcionan sin nuestro servidor, sin internet en la puerta, y el operador
//    del canal puede leérselo al huésped por teléfono fuera de nuestro horario.
//  - Ningún dato sale de la IA: todo viene de acceso.ts, sivra_codigos_acceso, horarios/salida/
//    parking ya existentes. La IA solo traduce (traducir.ts), con guarda de datos.
//  - CÓDIGOS EN DOS TIEMPOS: el mensaje de los 7 días lleva el proceso SIN códigos; los códigos
//    llegan en la víspera (reduce la exposición ante cancelaciones tardías).
//  - Cada mensaje termina con LA pregunta de su fase: la respuesta del huésped entra por el
//    webhook/sondeo y la absorbe el agente existente (hora de llegada → early check-in; cuna →
//    catálogo de extras; etc.).
//  - El parking fantasma de San Juan de la Palma NO existe: solo parkings públicos (parking.ts).
//
// Todo puro: testeable con node --test sin BD ni red.

import { PARKINGS_CERCANOS } from '../agente-huesped/parking.ts'
import { SALIDA_FLEX_HASTA, llavesAlSalir } from '../agente-huesped/salida.ts'
import { bloqueAcceso, type CodigosAcceso } from '../acceso.ts'

export type TipoMensaje =
  | 'confirmacion'
  | 'acceso'
  | 'vispera_llegada'
  | 'bienvenida'
  | 'estancia'
  | 'vispera_salida'
  | 'post_salida'

export const TIPOS_MENSAJE: TipoMensaje[] = [
  'confirmacion', 'acceso', 'vispera_llegada', 'bienvenida', 'estancia', 'vispera_salida', 'post_salida',
]

export type DatosPlantilla = {
  guestName: string
  property: string
  propertyId: string
  checkIn: string          // YYYY-MM-DD
  checkOut: string         // YYYY-MM-DD
  horaCheckIn: string      // '15:00'
  horaCheckOut: string     // '11:00'
  noches: number
  codigos: CodigosAcceso
  chekinUrl?: string       // enlace Chekin POR RESERVA (se extrae de su guest app)
  guestAppUrl?: string     // sitio personalizado de Smoobu (complemento, nunca único soporte)
  llegadaHoy?: boolean     // la víspera colapsada de una reserva de última hora ("hoy", no "mañana")
  /** true = verificado libre · false = verificado ocupado · null = NO verificado → NO se ofrece. */
  lateOfertaOk: boolean | null
}

function fmtFecha(f: string): string {
  const m = (f || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (f || '?')
}

function nombre(d: DatosPlantilla): string {
  // El nombre de Smoobu suele venir "Apellido Apellido Nombre" o entero; usamos la primera palabra
  // con forma de nombre solo si es corta, si no el nombre completo (mejor formal que equivocado).
  const n = (d.guestName || '').trim()
  return n || 'viajero/a'
}

const HORARIO_ASISTENCIA = 'Respondemos mensajes de 9:00 a 21:00 (hora de España)'

function parkingGuest(): string {
  const lista = PARKINGS_CERCANOS
    .map(p => `• ${p.nombre} — ${p.direccion} · Tel. ${p.telefono} · ${p.web}`)
    .join('\n')
  return `Si venís en coche: el apartamento no dispone de plaza de aparcamiento propia. Estos son los parkings públicos más cercanos (conviene consultar disponibilidad):\n${lista}`
}

function lineaChekin(d: DatosPlantilla): string {
  return d.chekinUrl
    ? `CHECK-IN ONLINE OBLIGATORIO (todos los mayores de 16 años, lo exige la Policía Nacional). Se hace en un minuto aquí: ${d.chekinUrl}`
    : 'CHECK-IN ONLINE OBLIGATORIO (todos los mayores de 16 años, lo exige la Policía Nacional): encontrarás el enlace en tu sitio personalizado de reserva.'
}

function confirmacion(d: DatosPlantilla): string {
  return [
    `¡Hola ${nombre(d)}!`,
    '',
    `Muchas gracias por reservar con nosotros 😊 Te esperamos en ${d.property} del ${fmtFecha(d.checkIn)} al ${fmtFecha(d.checkOut)} — entrada a partir de las ${d.horaCheckIn}, salida hasta las ${d.horaCheckOut}.`,
    '',
    'Una semana antes de tu llegada te enviaremos por aquí las instrucciones completas de acceso (dirección exacta, cómo recoger las llaves, con fotos y mapa), y la víspera, los códigos de entrada.',
    '',
    lineaChekin(d),
    '',
    parkingGuest(),
    '',
    `${HORARIO_ASISTENCIA}.`,
    '',
    '¿A qué hora tenéis pensado llegar, aproximadamente? ¿Necesitáis algo especial para la estancia (cuna, trona…)? Contádnoslo por aquí y lo organizamos.',
  ].join('\n')
}

function acceso(d: DatosPlantilla): string {
  return [
    `¡Hola ${nombre(d)}!`,
    '',
    `Tu llegada a ${d.property} está cerca: entrada el ${fmtFecha(d.checkIn)} a partir de las ${d.horaCheckIn}. Aquí tienes toda la información para llegar y entrar — guárdate este mensaje: lo tendrás a mano aunque te quedes sin internet.`,
    '',
    bloqueAcceso(d.propertyId, d.codigos, { conCodigos: false }),
    '',
    lineaChekin(d),
    d.guestAppUrl ? `\nToda esta información está también en tu sitio personalizado de reserva: ${d.guestAppUrl}` : '',
    '',
    '¿Nos confirmas a qué hora llegaréis, aproximadamente? Así lo dejamos todo listo.',
  ].filter(l => l !== null).join('\n')
}

function visperaLlegada(d: DatosPlantilla): string {
  const cuando = d.llegadaHoy ? '¡Hoy te esperamos' : '¡Mañana te esperamos'
  return [
    `¡Hola ${nombre(d)}! ${cuando} en ${d.property}! Entrada a partir de las ${d.horaCheckIn}.`,
    '',
    'AQUÍ TIENES LOS CÓDIGOS Y TODA LA INFORMACIÓN DE ACCESO — guárdate este mensaje:',
    '',
    bloqueAcceso(d.propertyId, d.codigos, { conCodigos: true }),
    '',
    lineaChekin(d),
    '',
    `La entrada es autónoma: a partir de las ${d.horaCheckIn} puedes llegar a CUALQUIER hora, también de madrugada, sin avisar. ${HORARIO_ASISTENCIA} — si vas a llegar más tarde de las 21:00, revisa estas instrucciones y escríbenos cualquier duda antes de esa hora.`,
    '',
    d.llegadaHoy
      ? '¿A qué hora llegaréis? Si surge cualquier cosa por el camino, escribidnos por aquí.'
      : `¿Sigue en pie vuestra hora de llegada? Si os viene bien entrar antes de las ${d.horaCheckIn}, decídnoslo y miramos si es posible.`,
  ].join('\n')
}

function bienvenida(d: DatosPlantilla): string {
  return [
    `¡Bienvenido/a, ${nombre(d)}! Esperamos que la llegada a ${d.property} vaya genial.`,
    '',
    'Solo un par de cosas para la buena convivencia con los vecinos: no hacer ruido de 22:00 a 9:00, no se pueden hacer fiestas, no se puede fumar dentro, y al apartamento solo pueden acceder las personas de la reserva.',
    '',
    `${HORARIO_ASISTENCIA} — escríbenos por este chat para cualquier cosa. Emergencias: 112 · Policía: 091.`,
    '',
    '¡Disfruta de Sevilla! Y si quieres recomendaciones de la zona (dónde comer, qué ver), pídenoslas por aquí.',
  ].join('\n')
}

function estancia(d: DatosPlantilla): string {
  return [
    `¡Hola ${nombre(d)}! ¿Qué tal va todo en ${d.property}?`,
    '',
    `¿Está el apartamento a vuestro gusto? Si falta algo o podemos mejorar cualquier cosa de la estancia, decídnoslo por aquí — respondemos de 9:00 a 21:00 (hora de España).`,
  ].join('\n')
}

function visperaSalida(d: DatosPlantilla): string {
  const oferta =
    d.lateOfertaOk === true
      ? `\nBuena noticia: mañana no entra nadie después de vosotros, así que si os viene bien podéis quedaros en el apartamento hasta las ${SALIDA_FLEX_HASTA} sin coste (equipaje dentro incluido). Si queréis, decídnoslo por aquí.\n`
      : ''
  return [
    `¡Hola ${nombre(d)}! Mañana es vuestro día de salida de ${d.property}: podéis estar en el apartamento hasta las ${d.horaCheckOut}.`,
    oferta,
    'Al salir, solo os pedimos esto:',
    `• ${llavesAlSalir(d.propertyId)}`,
    '• Apagad el aire acondicionado y las luces, y cerrad las ventanas.',
    '• Sacad la basura al salir.',
    '• Escribidnos un mensaje cuando os vayáis, para coordinar la limpieza.',
    '',
    '¿Sobre qué hora tenéis pensado salir?',
  ].join('\n')
}

function postSalida(d: DatosPlantilla): string {
  return [
    `¡Gracias por quedaros con nosotros, ${nombre(d)}! Esperamos que hayáis disfrutado de Sevilla y de ${d.property}.`,
    '',
    'Si todo ha ido bien, nos ayudaría muchísimo una reseña en el portal donde reservasteis — es un minuto y para una casa pequeña como la nuestra vale oro.',
    '',
    'Y si algo no estuvo a la altura, contádnoslo por aquí: lo arreglamos.',
    '',
    '¡Buen viaje de vuelta y hasta pronto! 👋',
  ].join('\n')
}

export function renderPlantilla(tipo: TipoMensaje, d: DatosPlantilla): string {
  switch (tipo) {
    case 'confirmacion': return confirmacion(d)
    case 'acceso': return acceso(d)
    case 'vispera_llegada': return visperaLlegada(d)
    case 'bienvenida': return bienvenida(d)
    case 'estancia': return estancia(d)
    case 'vispera_salida': return visperaSalida(d)
    case 'post_salida': return postSalida(d)
  }
}

// Asunto (solo lo aprovechan los canales de email; en el chat del portal no estorba).
export function renderAsunto(tipo: TipoMensaje, d: DatosPlantilla): string {
  switch (tipo) {
    case 'confirmacion': return `Reserva confirmada — ${d.property}`
    case 'acceso': return `🔑 Cómo llegar y recoger las llaves — ${d.property}`
    case 'vispera_llegada': return `🔑 Códigos de acceso — ${d.property}`
    case 'vispera_salida': return `Salida mañana — ${d.property}`
    default: return ''
  }
}
