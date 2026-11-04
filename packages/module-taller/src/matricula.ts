// Matrícula = clave de negocio del vehículo (única por taller). Normalización ESPEJO de la columna generada
// `taller.vehiculos.matricula_normalizada` (sql/0001_schema_taller.sql): mayúsculas, solo letras y dígitos.
// Si cambias una, cambia la otra (cepo en test/esquema-sql.test.ts).

export function normalizarMatricula(m: string): string {
  return m.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}
