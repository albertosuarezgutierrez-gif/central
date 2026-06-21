import type { ElaboracionTraza } from './types.ts'

// Las muestras testigo se conservan un mínimo legal; pasado el plazo se retiran.
// Por defecto 2 días (48 h), configurable por cliente.
const DIAS_RETENCION_DEFECTO = 2

/** Una muestra testigo pendiente de retirar (ya cumplió su plazo de conservación). */
export interface MuestraACaducar {
  elaboracion_id: string
  nombre: string
  guardada_at: string
  retirar_at: string   // ISO: cuándo se puede/debe retirar
}

function addDias(iso: string, dias: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString()
}

/**
 * Muestras testigo que ya pueden retirarse a fecha `ahora` (mi idea: aviso de
 * caducidad de muestras). Una elaboración cuenta si tiene muestra guardada
 * (`muestra_testigo === true`), conoce `muestra_testigo_at`, y han pasado
 * `diasRetencion` días desde que se guardó.
 */
export function muestrasACaducar(
  elaboraciones: ElaboracionTraza[],
  ahora: string,
  diasRetencion: number = DIAS_RETENCION_DEFECTO,
): MuestraACaducar[] {
  const ahoraMs = new Date(ahora).getTime()
  const out: MuestraACaducar[] = []
  for (const e of elaboraciones) {
    if (e.muestra_testigo !== true || !e.muestra_testigo_at) continue
    const retirar = addDias(e.muestra_testigo_at, diasRetencion)
    if (new Date(retirar).getTime() <= ahoraMs) {
      out.push({
        elaboracion_id: e.id,
        nombre: e.nombre,
        guardada_at: e.muestra_testigo_at,
        retirar_at: retirar,
      })
    }
  }
  return out
}
