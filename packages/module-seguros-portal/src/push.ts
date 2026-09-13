// El push es un canal INDEPENDIENTE del correo (12/09/2026): usa la misma ventana de
// `entraEnVentana()`/`DIAS_VENTANA_AVISO` que ya decide el correo, pero su propio sello
// (`avisadaPushAt`, no `avisadaAt`) — el correo lo manda `apps/asegura` con el email en claro; el
// push lo manda `apps/asegura-portal`, que solo tiene la suscripción del navegador. Que uno falle
// no puede tapar el envío del otro.
import { entraEnVentana } from './obligacion.ts'

export function debeAvisarPush(o: { fechaAccionable: Date; avisadaPushAt: Date | null }, hoy: Date): boolean {
  if (o.avisadaPushAt !== null) return false
  return entraEnVentana({ fechaAccionable: o.fechaAccionable, hoy })
}
