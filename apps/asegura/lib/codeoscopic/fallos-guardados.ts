// Los productos que NO dieron precio, tal como se guardan en `tarificaciones.fallos` (29/09/2026).
// PURO: lo usa `tarificacion-guardada.ts` y lo vigila su `.test.ts` sin levantar Prisma.

/** Un producto que no dio precio, tal como se guardó (`tarificaciones.fallos`). */
export type FalloGuardado = {
  compania: string | null
  producto: string | null
  configuracion: string | null
  motivo: string | null
  tambienDioPrecio: boolean
}

/**
 * El jsonb de `fallos`. PURO. `null`/no-array = no se guardaron (nunca `[]`); cada fallo sin
 * compañía ni motivo se descarta en vez de pintarse vacío.
 */
export function fallosDe(v: unknown): FalloGuardado[] | null {
  if (!Array.isArray(v)) return null
  const txt = (x: unknown) => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null)
  return v
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && !Array.isArray(f))
    .map((f) => ({
      compania: txt(f.compania),
      producto: txt(f.producto),
      configuracion: txt(f.configuracion),
      motivo: txt(f.motivo),
      tambienDioPrecio: f.tambienDioPrecio === true,
    }))
    .filter((f) => f.compania !== null || f.motivo !== null)
}
