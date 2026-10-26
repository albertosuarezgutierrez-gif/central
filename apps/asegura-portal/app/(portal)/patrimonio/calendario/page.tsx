import { redirect } from 'next/navigation'

import { RUTA_CALENDARIO } from '@central/module-seguros-portal'

/**
 * `/patrimonio/calendario` ya no es una pantalla (26/10/2026, «un solo Calendario»): sus fechas están en el calendario
 * único de Herramientas, con los vencimientos, los recibos, los avisos y los recordatorios. Se conserva la ruta SOLO para
 * que no se rompa ningún enlace guardado, correo, notificación push ni marcador. No lee nada ni cambia ningún acceso.
 */
export default function CalendarioPatrimonioRedirige() {
  redirect(RUTA_CALENDARIO)
}
