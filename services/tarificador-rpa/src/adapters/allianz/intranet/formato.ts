// Formato de fechas de ePAC — capa de intranet. Movido de comunidades.ts (14/10/2026).

import { ErrorTarificador } from '../../../errores.ts'

/**
 * «2026-10-05» → «05/10/2026» (formato de los campos de fecha de ePAC; Mapfre NSEI usa el mismo). `que` = quién y qué fecha
 * para el mensaje (p. ej. «mapfre/auto: la fecha de nacimiento del tomador»): por defecto el de Allianz. El mensaje NUNCA
 * lleva la fecha cruda (dato personal: una fecha de nacimiento identifica).
 */
export function fechaEs(iso: string, que = 'allianz/intranet: una fecha'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new ErrorTarificador('datos', `${que} no tiene el formato AAAA-MM-DD`)
  return `${m[3]}/${m[2]}/${m[1]}`
}
