/**
 * Límites del campo «Fecha de efecto» de las pantallas de pedir precio (29/09/2026). Los mismos dos
 * cepos que el vendor aplica y que no se arreglan después de pagar (ver
 * `apps/asegura/lib/codeoscopic/fecha-efecto.ts`): ni anterior a hoy, ni a más de 90 días vista.
 * «Hoy» en hora de Madrid, que es la que usa el vendor. PURO.
 */
export const MAX_DIAS_EFECTO = 90

export function limitesFechaEfecto(ahora: Date = new Date()): { min: string; max: string } {
  const min = ahora.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
  const d = new Date(`${min}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + MAX_DIAS_EFECTO)
  return { min, max: d.toISOString().slice(0, 10) }
}

/**
 * El defecto que pone asegura cuando el campo va vacío. Copia de `DIAS_EFECTO_PRESUPUESTO_NUEVO`
 * (`apps/asegura/lib/codeoscopic/fecha-efecto.ts`): son dos apps, y `fecha-efecto.test.ts` lee aquel
 * fuente para que la ayuda no prometa una fecha y el servidor mande otra.
 */
export const DIAS_EFECTO_DEFECTO = 15

/** Texto de ayuda común: vacía = el defecto del servidor. */
export const AYUDA_FECHA_EFECTO =
  `Vacía = dentro de ${DIAS_EFECTO_DEFECTO} días, para que el precio siga valiendo al emitir. Pon la del cliente si ya la sabe.`
