// packages/module-seguros/src/recaptacion.ts
//
// Cola de recaptación de leads sin vencimiento (12/09/2026). Ver
// docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md.
//
// La cola es SOLO leads del volcado, sin vencimiento, con contacto, y
// EXCLUYENDO a quien ya es cliente vivo por CIMA en otro ramo (regla 6 del
// spec): esos se trabajan desde su ficha normal, no aquí. El filtro/exclusión
// vive en SQL (apps/asegura/lib/cartera-recaptacion.ts, con
// sqlVolcadoHistorico()/sqlCarteraViva() de cartera-viva.ts); aquí solo el
// cooldown y el texto, que no dependen de la BD.

import { MEDIADOR } from './mediador.ts'
import { nombreDePila } from './nombre-de-pila.ts'

export const COOLDOWN_DIAS = 14

export type EnvioRecienteRecaptacion = { creadoAt: Date }

/**
 * `true` si el lead sigue en cooldown desde su último envío/apertura de
 * enlace. El límite se calcula sumando días de calendario, no horas exactas:
 * un envío de las 23:50 y una comprobación a las 00:05 del día siguiente NO
 * cuentan como "un día completo" — así el cooldown no se vacía por minutos.
 */
export function enCooldown(
  ultimoEnvio: EnvioRecienteRecaptacion | null,
  hoy: Date = new Date(),
  dias: number = COOLDOWN_DIAS,
): boolean {
  if (ultimoEnvio === null) return false
  const limite = new Date(ultimoEnvio.creadoAt)
  limite.setUTCDate(limite.getUTCDate() + dias)
  return hoy <= limite
}

export type PersonalizacionRecaptacion = {
  nombre: string
  /** Ya en texto legible ("comunidades", "hogar"), no el enum crudo de la BD. */
  ramoLegible: string
  /** `null` = no se conoce; el texto NO menciona ninguna compañía en ese caso. */
  aseguradoraAnterior: string | null
}

/**
 * Firma igual que `mensaje-whatsapp.ts` (mismo `FIRMA`, mismo portal como
 * ÚNICO enlace — dos URLs en un mensaje corto compiten). Esta es la base
 * DETERMINISTA que `apps/asegura` manda a pulir a la IA; si la IA falla, esta
 * misma frase es lo que se envía — nunca un mensaje vacío ni una plantilla a
 * medias.
 */
export function textoBaseRecaptacionWhatsapp(d: PersonalizacionRecaptacion): string {
  const pila = nombreDePila(d.nombre) ?? d.nombre
  const firma = `${MEDIADOR.identidad.nombre.split(' ').slice(0, 2).join(' ')}, de ${MEDIADOR.marca}`
  const conQuien = d.aseguradoraAnterior ? ` que tuviste con ${d.aseguradoraAnterior}` : ''
  return [
    `Hola ${pila}, soy ${firma}, corredor de seguros.`,
    '',
    `Te escribo porque en su día tuvimos contacto por tu seguro de ${d.ramoLegible}${conQuien}, y quería saber si sigues teniendo ese riesgo asegurado.`,
    '',
    'Si te interesa, te paso un precio actualizado sin compromiso — y de paso te dejo una herramienta gratis para tener todos tus seguros en un sitio:',
    '',
    MEDIADOR.identidad.portal,
    '',
    'Si ya no te hace falta o prefieres que no te escriba más, dímelo y no insisto.',
  ].join('\n')
}

/** Misma redacción, adaptada a un asunto+cuerpo de correo (sin el saludo de WhatsApp). */
export function textoBaseRecaptacionEmail(d: PersonalizacionRecaptacion): { asunto: string; texto: string } {
  const pila = nombreDePila(d.nombre) ?? d.nombre
  const firma = `${MEDIADOR.identidad.nombre.split(' ').slice(0, 2).join(' ')}, de ${MEDIADOR.marca}`
  const conQuien = d.aseguradoraAnterior ? ` que tuviste con ${d.aseguradoraAnterior}` : ''
  const asunto = `¿Sigues con tu seguro de ${d.ramoLegible}?`
  const texto = [
    `Hola ${pila}:`,
    '',
    `Soy ${firma}. En su día tuvimos contacto por tu seguro de ${d.ramoLegible}${conQuien}, y quería saber si sigues teniendo ese riesgo asegurado.`,
    '',
    'Si te interesa, te paso un precio actualizado sin compromiso. De paso te dejo una herramienta gratis para tener todos tus seguros en un sitio, sean de quien sean:',
    MEDIADOR.identidad.portal,
    '',
    'Si ya no te hace falta o prefieres que no te escriba más, respóndeme y no insisto.',
  ].join('\n')
  return { asunto, texto }
}
