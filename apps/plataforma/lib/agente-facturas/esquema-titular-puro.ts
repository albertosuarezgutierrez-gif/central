// Parte PURA de la detección del esquema de titular/descarte (ver esquema-titular.ts).
export interface ColumnaEsquema { tabla: string; columna: string }

/** Columnas que crea `2026-10-04_gastos_titular.sql`. Todas o ninguna: el SQL va en una transacción. */
export const COLUMNAS_TITULAR: readonly ColumnaEsquema[] = [
  { tabla: 'gastos', columna: 'sociedad_id' },
  { tabla: 'gastos', columna: 'negocio_id' },
  { tabla: 'gastos', columna: 'titular_fuente' },
  { tabla: 'gastos', columna: 'titular_pendiente' },
  { tabla: 'gastos', columna: 'descartado_at' },
  { tabla: 'gastos', columna: 'descartado_motivo' },
  { tabla: 'sociedades', columna: 'estado' },
]

/** true solo si están TODAS (una a medias = no aplicada: se sigue como antes). */
export function esquemaCompleto(cols: ColumnaEsquema[]): boolean {
  const hay = new Set(cols.map((c) => `${c.tabla}.${c.columna}`))
  return COLUMNAS_TITULAR.every((c) => hay.has(`${c.tabla}.${c.columna}`))
}
