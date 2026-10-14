// Formato de fechas de ePAC — capa de intranet. Movido de comunidades.ts (14/10/2026).

import { ErrorTarificador } from '../../../errores.ts'

/** «2026-10-05» → «05/10/2026» (formato de los campos de fecha de ePAC). */
export function fechaEs(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new ErrorTarificador('datos', `allianz/comunidades: fecha «${iso}» no es AAAA-MM-DD`)
  return `${m[3]}/${m[2]}/${m[1]}`
}
