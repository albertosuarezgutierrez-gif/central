// packages/module-seguros/src/renovacion-contacto.ts
//
// El mensaje que Alberto le manda a un cliente VIVO (no un lead del volcado)
// cuando su póliza vence pronto — distinto de `recaptacion.ts`, que escribe a
// alguien que ya no es cliente. Aquí SÍ se nombra la compañía actual (es la
// que tiene contratada, no un centinela del volcado) y el motivo es avisar
// con tiempo, no recuperar un contacto perdido.

import { MEDIADOR } from './mediador.ts'
import { nombreDePila } from './nombre-de-pila.ts'

export const COOLDOWN_RENOVACION_DIAS = 14

export type ContactoReciente = { creadoAt: Date }

/** Mismo cálculo que `enCooldown()` de `recaptacion.ts`: por días de
 *  calendario, no por horas exactas. Se separa a propósito — el día que un
 *  cooldown cambie por su cuenta, no arrastra al otro. */
export function enCooldownRenovacion(
  ultimoContacto: ContactoReciente | null,
  hoy: Date = new Date(),
  dias: number = COOLDOWN_RENOVACION_DIAS,
): boolean {
  if (ultimoContacto === null) return false
  const limite = new Date(ultimoContacto.creadoAt)
  limite.setUTCDate(limite.getUTCDate() + dias)
  return hoy <= limite
}

export type PersonalizacionRenovacion = {
  nombre: string
  /** Ya en texto legible ("auto", "hogar"), no el enum crudo de la BD. */
  ramoLegible: string
  /** La compañía ACTUAL de la póliza que vence — no un dato del volcado, así
   *  que aquí sí se nombra siempre que llegue. */
  aseguradora: string
  /** ISO `yyyy-mm-dd`. */
  fechaVencimiento: string
}

function fechaEs(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

/**
 * Base DETERMINISTA del aviso de renovación por WhatsApp. Mismo criterio que
 * `textoBaseRecaptacionWhatsapp`: un solo enlace (el portal), firma corta, y
 * la salida siempre invita a decir que no hace falta insistir.
 */
export function textoAvisoRenovacionWhatsapp(d: PersonalizacionRenovacion): string {
  const pila = nombreDePila(d.nombre) ?? d.nombre
  const firma = `${MEDIADOR.identidad.nombre.split(' ').slice(0, 2).join(' ')}, de ${MEDIADOR.marca}`
  return [
    `Hola ${pila}, soy ${firma}, corredor de seguros.`,
    '',
    `Te escribo porque tu seguro de ${d.ramoLegible} con ${d.aseguradora} vence el ${fechaEs(d.fechaVencimiento)}, y quería avisarte con tiempo antes de que se renueve solo.`,
    '',
    'Si quieres, te paso un precio actualizado sin compromiso — y de paso tienes tu póliza siempre a mano en esta herramienta gratuita:',
    '',
    MEDIADOR.identidad.portal,
    '',
    'Si ya lo tienes controlado, dímelo y no insisto.',
  ].join('\n')
}
