/**
 * En qué orden se pintan las pólizas de la ficha de un cliente.
 *
 * ─── Por qué existe ─────────────────────────────────────────────────────────
 * La ficha las traía ordenadas SOLO por `fechaVencimiento: 'desc'`. En Postgres
 * `DESC` implica **NULLS FIRST**, y las pólizas del volcado histórico no tienen
 * fecha de vencimiento — así que salían todas delante.
 *
 * Medido sobre un cliente real el 05/09/2026 (21 pólizas: 6 vivas, 15 del
 * volcado): las **8 primeras filas eran históricas, sin fecha y sin un solo
 * recibo**, y las 5 que sí traen importe, forma de pago y estado de cobro
 * quedaban al final de la tabla. La pestaña «Recibos» parecía vacía teniendo
 * los datos: ocho «sin informar · — · — · —» seguidos.
 *
 * ─── El criterio ────────────────────────────────────────────────────────────
 * El de la pantalla, no el de la tabla:
 *   1. **Primero lo vivo.** Es lo único sobre lo que se puede actuar hoy.
 *   2. Dentro de cada grupo, **lo que vence antes arriba**: ese es el orden en
 *      que hay que trabajarlo (llamar, renovar, reclamar el recibo).
 *   3. 🚨 **Sin fecha va al FINAL de su grupo**, nunca al principio. Una fecha
 *      ausente es un dato que falta, no una fecha muy próxima ni muy lejana —
 *      colocarla arriba es justo el bug que esto arregla.
 *
 * Las fechas son ISO (`YYYY-MM-DD`), así que comparar como texto ordena bien y
 * evita construir un `Date` por comparación.
 */
export type PolizaOrdenable = {
  /** `true` = cartera viva (la mantiene CIMA, o la emitimos y está pendiente). */
  viva: boolean
  /** ISO `YYYY-MM-DD`, o `null` cuando la compañía no la informa. */
  fechaVencimiento: string | null
}

export function ordenPolizasFicha(a: PolizaOrdenable, b: PolizaOrdenable): number {
  if (a.viva !== b.viva) return a.viva ? -1 : 1
  if (a.fechaVencimiento === null || b.fechaVencimiento === null) {
    if (a.fechaVencimiento === b.fechaVencimiento) return 0
    return a.fechaVencimiento === null ? 1 : -1
  }
  return a.fechaVencimiento.localeCompare(b.fechaVencimiento)
}
