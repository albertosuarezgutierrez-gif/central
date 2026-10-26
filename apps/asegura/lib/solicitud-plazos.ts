/**
 * Plazos de LECTURA del enlace de datos (26/10/2026, revisión del PR #5068). El portal espera a asegura un tope fijo
 * (`TOPE_PUENTE_*_MS` de `apps/asegura-portal/lib/solicitud-datos.ts`); si asegura tardara más, el portal cortaría el
 * puente y el cliente vería «fallo» con el fichero YA archivado en su ficha. Por eso asegura corta SU lectura antes, con
 * margen para archivar y contestar: pasado el plazo, el fichero se archiva igual y se le dice «no lo hemos podido leer;
 * rellénalo a mano». Cepo `solicitud-plazos.test.ts` (lee los topes del portal).
 */

/** Lector de pólizas (texto con suplente, o visión hasta 90 s): se corta a los 80 s. */
export const PLAZO_LECTURA_POLIZA_MS = 80_000
/** Lector de papeles sueltos (DNI, carné, permiso: ~40 s de IA). */
export const PLAZO_LECTURA_DOCUMENTO_MS = 40_000
/** Margen mínimo entre el corte de asegura y el del portal: archivar en la ficha + guardar la lectura + responder. */
export const MARGEN_PUENTE_MS = 15_000

/** La promesa, o `alVencer()` si no acaba en `ms`. Nunca lanza por el plazo (si la promesa lanza, lanza igual). */
export function conPlazo<T>(p: Promise<T>, ms: number, alVencer: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => resolve(alVencer()), ms)
    p.then((x) => { clearTimeout(t); resolve(x) }, (e) => { clearTimeout(t); reject(e) })
  })
}
