/**
 * Guardián de la migración 0033 (nóminas P2): aditiva, todo NULL-able, nombres de columna que usan OTROS paquetes
 * (remesa SEPA, contabilidad) y tabla de convenio en céntimos con RLS + grants a rrhh_app.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(__dirname, '..', 'prisma/migrations')
const sql = readFileSync(join(DIR, '0033_nominas_contratos_convenio.sql'), 'utf8')
const codigo = sql.replace(/^\s*--.*$/gm, '').replace(/--.*$/gm, '')

describe('0033_nominas_contratos_convenio.sql', () => {
  it('doble 0033 TOLERADO solo para este par exacto (ambas ya aplicadas en producción con su nombre; ver apps/rrhh/CLAUDE.md)', () => {
    // #5588 y #5590 numeraron 0033 a la vez. No se renombran: `supabase_migrations.schema_migrations` las registra con ese nombre.
    // Cualquier otra repetición (o una tercera 0033) vuelve a fallar.
    expect(readdirSync(DIR).filter(f => f.startsWith('0033_')).sort()).toEqual(['0033_fichajes_nomina_hechos.sql', '0033_nominas_contratos_convenio.sql'])
    const numeros = readdirSync(DIR).filter(f => /^\d{4}_.*\.sql$/.test(f)).map(f => f.slice(0, 4))
    const repetidos = [...new Set(numeros.filter((n, i) => numeros.indexOf(n) !== i))]
    expect(repetidos.filter(n => n !== '0033' && Number(n) > 33), 'numeración nueva duplicada').toEqual([])
  })
  it('aditiva e idempotente: sin DROP TABLE/COLUMN, TRUNCATE, DELETE ni UPDATE de datos', () => {
    expect(codigo).not.toMatch(/DROP\s+(TABLE|COLUMN)|\bTRUNCATE\b|^\s*DELETE\b|^\s*UPDATE\b/im)
    const add = codigo.match(/ADD COLUMN(?! IF NOT EXISTS)/g)
    expect(add, 'todo ADD COLUMN con IF NOT EXISTS').toBeNull()
    expect(codigo.match(/CREATE (?:UNIQUE )?INDEX/g)?.length).toBe(codigo.match(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/g)?.length)
    // Solo se reemplazan CHECK propios (DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT del mismo nombre).
    for (const m of codigo.matchAll(/DROP CONSTRAINT IF EXISTS (\w+)/g)) expect(codigo).toContain(`ADD CONSTRAINT ${m[1]}`)
  })
  it('columnas nuevas NULL-ables (NULL = «no se sabe»)', () => {
    for (const m of codigo.matchAll(/ADD COLUMN IF NOT EXISTS ([^,;]+)/g)) expect(m[1], m[1]).not.toMatch(/NOT NULL|DEFAULT/i)
  })
  it('nombres que usan otros agentes, exactos', () => {
    for (const c of ['fecha_inicio', 'fecha_fin', 'duracion']) expect(codigo).toMatch(new RegExp(`ALTER TABLE rrhh\\.contratos_laborales[\\s\\S]*ADD COLUMN IF NOT EXISTS ${c}\\b`))
    for (const c of ['fecha_baja', 'motivo_baja', 'iban']) expect(codigo).toMatch(new RegExp(`ALTER TABLE rrhh\\.empleados[\\s\\S]*?ADD COLUMN IF NOT EXISTS ${c}\\b`))
    for (const c of ['nif', 'iban', 'bic', 'contabilidad_empresa_id']) expect(codigo).toMatch(new RegExp(`ALTER TABLE rrhh\\.empresas[\\s\\S]*?ADD COLUMN IF NOT EXISTS ${c}\\b`))
  })
  it('tabla de convenio por empresa, en céntimos, con RLS y grants a rrhh_app', () => {
    expect(codigo).toMatch(/CREATE TABLE IF NOT EXISTS rrhh\.convenio_tablas_salariales/)
    expect(codigo).toMatch(/empresa_id\s+uuid\s+NOT NULL REFERENCES rrhh\.empresas/)
    expect(codigo).toMatch(/salario_base_cent\s+bigint/)
    const tabla = codigo.slice(codigo.indexOf('CREATE TABLE IF NOT EXISTS rrhh.convenio_tablas_salariales'))
    expect(tabla.slice(0, tabla.indexOf(');'))).not.toMatch(/\b(NUMERIC|DECIMAL|REAL|DOUBLE|FLOAT)\b/i)
    expect(codigo).toMatch(/ALTER TABLE rrhh\.convenio_tablas_salariales ENABLE ROW LEVEL SECURITY/)
    expect(codigo).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON rrhh\.convenio_tablas_salariales TO rrhh_app/)
  })
  it('no toca rrhh.avisos: el vencimiento de contrato NO se avisa al empleado (riesgo de leerse como preaviso)', () => {
    expect(codigo).not.toMatch(/\brrhh\.avisos\b(?!_admin)/)
    expect(codigo).not.toMatch(/vencimiento_contrato/)
  })
})

describe('0033: estado de la emisión a contabilidad en nominas', () => {
  it('tres columnas NULL-ables y CHECK con el catálogo exacto', () => {
    for (const c of ['contabilidad_estado text', 'contabilidad_detalle text', 'contabilidad_intento_at timestamptz']) {
      expect(codigo).toMatch(new RegExp(`ALTER TABLE rrhh\\.nominas[\\s\\S]*ADD COLUMN IF NOT EXISTS ${c.replace(' ', '\\s+')}`))
    }
    const v = codigo.match(/nominas_contabilidad_estado_ck CHECK \(contabilidad_estado IS NULL OR contabilidad_estado IN\s*\(([^)]*)\)/)?.[1] ?? ''
    expect(v.match(/'[a-z_]+'/g)).toEqual(["'enviado'", "'pendiente_regla'", "'pendiente_vincular'", "'sin_configurar'", "'error'", "'rechazado'", "'no_enviable'"])
  })
})

describe('0033: sello de la remesa SEPA en nominas (contra el doble pago)', () => {
  it('remesa_generada_at timestamptz y remesa_msg_id text, NULL-ables', () => {
    expect(codigo).toMatch(/ALTER TABLE rrhh\.nominas[\s\S]*ADD COLUMN IF NOT EXISTS remesa_generada_at\s+timestamptz/)
    expect(codigo).toMatch(/ALTER TABLE rrhh\.nominas[\s\S]*ADD COLUMN IF NOT EXISTS remesa_msg_id\s+text/)
  })
})
