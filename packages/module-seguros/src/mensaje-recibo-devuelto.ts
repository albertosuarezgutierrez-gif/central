// El WhatsApp a quien se le ha DEVUELTO un recibo (Alberto, 29/09/2026: «pulsando
// automáticamente se hace un mensaje, dando los buenos días, las buenas tardes…
// y decirle que ha venido un recibo devuelto, cómo procedemos, si es por el
// precio…»; y después: «añade importe, compañía y resumen del riesgo»).
//
// Lo abre Alberto desde la fila del recibo y lo ENVÍA él: nada sale solo.
//
// 🚨 Lo que el mensaje NO lleva: nº de póliza, IBAN ni DNI. Un WhatsApp se
// reenvía igual que un correo, y es la misma regla que los correos a clientes.
// La matrícula sí: es el bien del cliente y le dice de qué seguro le hablamos.
//
// 🚨 Y no promete precio («te busco otra opción», no «te lo bajo»): pasa por
// `copy-regulado` (RDL 3/2020).
import { MEDIADOR } from './mediador.ts'
import { nombreDePila } from './nombre-de-pila.ts'
import { fechaEs, suspensionDesde } from './seguimiento-devolucion.ts'
import type { TipoMotivoDevolucion } from './devolucion-correo.ts'

const FIRMA = `${MEDIADOR.identidad.nombre.split(' ')[0]}, de ${MEDIADOR.marca}`

export type EntradaWhatsappDevuelto = {
  /** Nombre completo del tomador (se saluda por el de pila si se puede afirmar). */
  nombre: string | null
  aseguradora: string | null
  /** `polizas.tipo` (auto, hogar, responsabilidad_civil…). */
  tipo: string | null
  /** El objeto tal cual lo pinta la ficha: `titulo` (marca/modelo, dirección…) y `detalle` (matrícula, …). */
  riesgo: { titulo: string | null; detalle: string | null } | null
  importe: number | null
  fechaEfecto: string | null
  /** El motivo clasificado del aviso por correo; `null` = no se sabe (p. ej. lo trajo CIMA). */
  tipoMotivo: TipoMotivoDevolucion | string | null
  /**
   * `true` si el móvil NO es del tomador sino de alguien de su póliza (su hijo, el conductor…):
   * se le habla a esa persona del seguro DEL TOMADOR, nunca como si fuera el titular.
   */
  paraTercero: boolean
  ahora: Date
}

const RAMO: Record<string, string> = {
  auto: 'coche', moto: 'moto', hogar: 'hogar', comunidad: 'comunidad', comercio: 'comercio',
  responsabilidad_civil: 'responsabilidad civil', vida: 'vida', salud: 'salud', decesos: 'decesos',
  accidentes: 'accidentes', mascotas: 'mascota',
}

const MOTOR = new Set(['auto', 'moto'])
const MATRICULA = /^(?:\d{4}\s?[B-DF-HJ-NP-TV-Z]{3}|[A-Z]{1,2}\s?\d{4}\s?[A-Z]{0,2})$/i

/** Buenos días / buenas tardes / buenas noches, en hora de Madrid. */
export function saludoSegunHora(ahora: Date): string {
  const h = Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(ahora))
  if (h >= 6 && h < 14) return 'Buenos días'
  if (h >= 14 && h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

function eur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

/** «CIA. MAPFRE ESPAÑA» → «Mapfre España»: una compañía en mayúsculas grita en un WhatsApp. */
function compania(nombre: string | null): string | null {
  const t = nombre?.trim()
  if (!t) return null
  if (t !== t.toUpperCase()) return t
  return t.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
}

/** «tu coche Ford Focus (1234 ABC)», «tu hogar de Calle Socorro 24»… `null` si no hay nada que decir. */
export function resumenRiesgo(tipo: string | null, riesgo: EntradaWhatsappDevuelto['riesgo']): string | null {
  const titulo = riesgo?.titulo?.trim() || null
  if (!titulo) return null
  if (tipo && MOTOR.has(tipo)) {
    const primero = riesgo?.detalle?.split(',')[0]?.trim() ?? ''
    const matricula = MATRICULA.test(primero) && primero !== titulo ? primero : null
    return matricula ? `${titulo} (${matricula})` : titulo
  }
  return titulo
}

function quePidoSegunMotivo(tipoMotivo: EntradaWhatsappDevuelto['tipoMotivo']): string {
  switch (tipoMotivo) {
    case 'cuenta':
      return 'Por lo que indica el banco, parece un problema con la cuenta o con el titular. ¿Me confirmas el IBAN correcto y lo volvemos a pasar?'
    case 'cliente_rechaza':
      return '¿Ha pasado algo? Si es por el precio, dímelo y te busco otras opciones con las compañías con las que trabajo. Y si has vendido o dado de baja el bien asegurado, avísame y lo gestionamos.'
    case 'fondos':
      return '¿Lo volvemos a pasar al banco en unos días o prefieres otra forma de pago?'
    default:
      return '¿Cómo prefieres que lo hagamos: lo volvemos a pasar al banco o te paso otra forma de pago? Y si hay algún problema con el seguro o con el precio, dímelo y lo vemos.'
  }
}

export function mensajeReciboDevueltoWhatsapp(e: EntradaWhatsappDevuelto): string {
  const pila = e.paraTercero ? null : nombreDePila(e.nombre)
  const ramo = e.tipo ? (RAMO[e.tipo] ?? e.tipo.replace(/_/g, ' ')) : null
  const cia = compania(e.aseguradora)
  const bien = resumenRiesgo(e.tipo, e.riesgo)
  const seguro = [
    e.paraTercero
      ? `el seguro${ramo ? ` de ${ramo}` : ''}${e.nombre?.trim() ? ` de ${e.nombre.trim()}` : ''}`
      : `tu seguro${ramo ? ` de ${ramo}` : ''}`,
    cia ? `con ${cia}` : null,
    bien ? `(${bien})` : null,
  ].filter(Boolean).join(' ')
  const importe = e.importe !== null && e.importe > 0 ? ` de ${eur(e.importe)}` : ''

  const hoy = e.ahora.toISOString().slice(0, 10)
  const suspension = suspensionDesde(e.fechaEfecto)
  const plazo = suspension === null
    ? 'Conviene resolverlo cuanto antes para que no te quedes sin cobertura.'
    : suspension > hoy
      ? `Para que no te quedes sin cobertura, conviene resolverlo antes del ${fechaEs(suspension)}.`
      : `Mientras no se pague, la cobertura está en suspenso desde el ${fechaEs(suspension)}; a las 24 horas de pagarlo vuelve a estar en vigor.`

  return [
    `${saludoSegunHora(e.ahora)}${pila ? ` ${pila}` : ''}, soy ${FIRMA}.`,
    '',
    `Te escribo porque el banco nos ha devuelto el recibo${importe} de ${seguro}.`,
    '',
    quePidoSegunMotivo(e.tipoMotivo),
    '',
    plazo,
    '',
    'Un saludo.',
  ].join('\n')
}
