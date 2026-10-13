// Campos DERIVADOS que el GET de `/api/operador/presupuesto` añade a cada presupuesto para que plataforma sepa, ANTES de
// pedir la emisión, si asegura la rechazaría (12/10/2026). Misma regla que `precondicionesEmision` (module-tarificacion):
// `ipidConstaEnAceptacion`. NUNCA sale el hash del IPID ni datos personales: solo un booleano y el id de la opción.
//
// Tres estados: `ipidConsta` true/false = leído; `null` = no se pudo leer (columna sin aplicar o fallo): ni «sí» ni «no».
import { ipidConstaEnAceptacion } from '@central/module-tarificacion'

export type CamposEmision = { ipidConsta: boolean | null; opcionElegidaId: string | null }
export type FilaEmision = { ipidHuella: string | null; opcionElegidaId: string | null }

/** `fila` `undefined`/`null` = no se leyó (≠ «no hay IPID»). */
export function camposEmisionDe(fila: FilaEmision | null | undefined): CamposEmision {
  if (!fila) return { ipidConsta: null, opcionElegidaId: null }
  const op = typeof fila.opcionElegidaId === 'string' && fila.opcionElegidaId.trim() !== '' ? fila.opcionElegidaId : null
  return { ipidConsta: ipidConstaEnAceptacion(fila.ipidHuella), opcionElegidaId: op }
}
