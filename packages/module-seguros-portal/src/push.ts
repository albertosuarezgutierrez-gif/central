// El push es un canal INDEPENDIENTE del correo (12/09/2026): usa la misma ventana de
// `entraEnVentana()`/`DIAS_VENTANA_AVISO` que ya decide el correo, pero su propio sello
// (`avisadaPushAt`, no `avisadaAt`) — el correo lo manda `apps/asegura` con el email en claro; el
// push lo manda `apps/asegura-portal`, que solo tiene la suscripción del navegador. Que uno falle
// no puede tapar el envío del otro.
import { entraEnVentana } from './obligacion.ts'
import { TIPOS_RECORDATORIO_PROPIO } from './recordatorio-libre.ts'

export function debeAvisarPush(o: { fechaAccionable: Date; avisadaPushAt: Date | null }, hoy: Date): boolean {
  if (o.avisadaPushAt !== null) return false
  return entraEnVentana({ fechaAccionable: o.fechaAccionable, hoy })
}

/**
 * Qué dice el push de una obligación, según SU TIPO.
 *
 * 🚨 Existe porque el texto único que había antes —«Tu seguro pide una
 * decisión… te queda poco margen para decidir si lo renuevas»— es de una
 * RENOVACIÓN DE PÓLIZA, y este cron manda también los recordatorios que se
 * pone el propio cliente. Sobre una ITV, ese texto le dice que se queda sin
 * cobertura cuando lo que vence es la inspección del coche: el mismo daño que
 * el cron de correo de `apps/asegura` evita excluyéndolos.
 *
 * Aquí NO se excluyen, y es la diferencia que importa: el push es el ÚNICO
 * canal que puede avisar de un recordatorio propio (no tiene póliza de la que
 * sacar un destinatario de correo), así que callarlo lo dejaría mudo. Lo que
 * se arregla es lo que dice, no a quién se le dice.
 */
export function textoPushObligacion(o: { tipo: string; titulo: string }): { title: string; body: string } {
  if ((TIPOS_RECORDATORIO_PROPIO as readonly string[]).includes(o.tipo)) {
    return { title: 'Tu recordatorio', body: `${o.titulo}: se acerca la fecha que apuntaste.` }
  }
  return { title: 'Tu seguro pide una decisión', body: `${o.titulo}: te queda poco margen para decidir si lo renuevas.` }
}
