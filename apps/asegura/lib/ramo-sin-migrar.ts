/**
 * Un ramo que el CÓDIGO ya conoce y la BD todavía no (28/10/2026, `patinete`): escribirlo en una columna del enum
 * `seguros.tipo_seguro` falla con 22P02 «invalid input value for enum tipo_seguro». Código ANTES que SQL: eso no
 * es un 500 opaco sino un 503 `sin_migracion` que dice qué SQL falta. PURO.
 *
 * Solo casa el error del ENUM de ramo: un 22P02 de otra cosa (un uuid mal formado) sigue siendo un error.
 */
export const SQL_RAMO_PATINETE = '2026-10-28_ramo_patinete.sql'

export function esEnumRamoSinMigrar(e: unknown): boolean {
  const t = e instanceof Error ? e.message : String(e)
  return /invalid input value for enum [\w."]*tipo_seguro/i.test(t)
}

export const MOTIVO_RAMO_SIN_MIGRAR = `Falta el SQL ${SQL_RAMO_PATINETE}: ese ramo aún no existe en la base de datos.`
