/**
 * Guardián de la migración 0032 (modelo 145 con vigencia, N1): aditiva, con histórico y sin euros float.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(__dirname, '..', 'prisma/migrations/0032_situacion_familiar.sql'), 'utf8')
const codigo = sql.replace(/^\s*--.*$/gm, '')

describe('0032_situacion_familiar.sql', () => {
  it('es aditiva e idempotente: nada de DROP/TRUNCATE/DELETE y todo con IF NOT EXISTS', () => {
    expect(codigo).not.toMatch(/\b(DROP|TRUNCATE)\b|(?<!ON )\bDELETE\b/i)
    expect(codigo).toMatch(/CREATE TABLE IF NOT EXISTS rrhh\.situacion_familiar/)
    expect(codigo.match(/CREATE (?:UNIQUE )?INDEX/g)?.length).toBe(codigo.match(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/g)?.length)
  })
  it('histórico con vigencia: desde/hasta, hasta ≥ desde, una sola abierta por empleado, sin DELETE al rol', () => {
    expect(codigo).toMatch(/vigente_desde\s+date\s+NOT NULL/)
    expect(codigo).toMatch(/vigente_hasta\s+date,/)
    expect(codigo).toMatch(/vigente_hasta IS NULL OR vigente_hasta >= vigente_desde/)
    expect(codigo).toMatch(/UNIQUE INDEX IF NOT EXISTS uq_situacion_familiar_abierta[^;]*WHERE vigente_hasta IS NULL/)
    expect(codigo).toMatch(/GRANT SELECT, INSERT, UPDATE ON rrhh\.situacion_familiar TO rrhh_app;/)
    expect(codigo).not.toMatch(/GRANT[^;]*DELETE/)
    expect(codigo).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })
  it('todo cuelga de la empresa y del empleado, y los importes van en céntimos enteros (sin NUMERIC/float)', () => {
    expect(codigo).toMatch(/empresa_id\s+uuid\s+NOT NULL REFERENCES rrhh\.empresas/)
    expect(codigo).toMatch(/empleado_id\s+uuid\s+NOT NULL REFERENCES rrhh\.empleados/)
    expect(codigo).not.toMatch(/\b(NUMERIC|DECIMAL|REAL|DOUBLE|FLOAT)\b/i)
    expect(codigo).toMatch(/pension_compensatoria_cent\s+bigint/)
    expect(codigo).toMatch(/anualidades_alimentos_cent\s+bigint/)
  })
})
