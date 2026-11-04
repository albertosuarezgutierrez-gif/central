// Matrícula = clave de negocio del vehículo (única por taller). Normalización ESPEJO de la columna generada
// `taller.vehiculos.matricula_normalizada` (apps/taller/prisma/sql/0001_schema_taller.sql): mayúsculas, solo letras y dígitos.
// Si cambias una, cambia la otra (cepo en apps/taller/test/esquema-sql.test.ts).

export function normalizarMatricula(m: string): string {
  return m.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/**
 * Matrícula plausible para un formulario PÚBLICO: ya normalizada, entre 5 y 9 caracteres, con al menos una letra y un dígito
 * (1234BCD, SE1234AB, C1234BBB, AB12CD de Portugal…). No consulta nada: solo corta lo evidentemente inválido antes de tocar la BD.
 */
export function validarMatricula(m: string): { ok: true; normalizada: string } | { ok: false } {
  const normalizada = normalizarMatricula(m)
  return /^(?=.*\d)(?=.*[A-Z])[A-Z0-9]{5,9}$/.test(normalizada) ? { ok: true, normalizada } : { ok: false }
}
