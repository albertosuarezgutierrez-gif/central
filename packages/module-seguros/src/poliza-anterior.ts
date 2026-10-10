// El nº de póliza anterior tal como se manda a Codeoscopic (SINCO lo busca por él).
//
// Mapfre guarda en cartera «4840402030 01»: el sufijo de 2 dígitos es la versión/suplemento y el nº
// real es «4840402030». Con el sufijo la compañía no encuentra el historial. Puro, sin BD.

/** Código DGS de Mapfre (fuente: `devolucion-correo.ts`, `defensa-cartera.ts`). */
export const CODIGOS_DGS_MAPFRE: readonly string[] = ['C0058']

/**
 * `numero` tal como viaja: sin espacios en los extremos y, si la compañía es MAPFRE y tiene la forma
 * `<dígitos> <2 dígitos>`, sin el sufijo. En el resto se quitan los espacios internos. Sin compañía
 * conocida, solo espacios fuera. Separar el sufijo exige el espacio: pegado («484040203001») no se toca.
 */
export function polizaAnteriorParaTarificar(numero: string | null | undefined, companiaCodigoDgs?: string | null): string {
  const t = (numero ?? '').trim()
  const dgs = (companiaCodigoDgs ?? '').trim().toUpperCase()
  if (dgs !== '' && CODIGOS_DGS_MAPFRE.includes(dgs)) {
    const m = /^(\d+)\s+\d{2}$/.exec(t)
    if (m) return m[1]
  }
  return t.replace(/\s+/g, '')
}
