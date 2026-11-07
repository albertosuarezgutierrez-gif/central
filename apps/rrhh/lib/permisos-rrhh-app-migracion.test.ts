/**
 * Guardián de la migración 0035: el default ACL del schema `rrhh` da a rrhh_app TODO en cada tabla nueva, así que los
 * permisos acotados de 0032 (situacion_familiar: histórico sin DELETE, UPDATE solo de 2 columnas) y 0033
 * (convenio_tablas_salariales: SELECT/INSERT/UPDATE/DELETE) solo valen con REVOKE ALL previo + GRANT exacto.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(__dirname, '..', 'prisma/migrations')
const sql = readFileSync(join(DIR, '0035_permisos_rrhh_app.sql'), 'utf8')
const codigo = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()
const sentencias = codigo.split(';').map(s => s.trim()).filter(Boolean)
const de = (tabla: string) => sentencias.filter(s => s.includes(`rrhh.${tabla} `))

describe('0035_permisos_rrhh_app.sql', () => {
  it('es la única 0035', () => {
    expect(readdirSync(DIR).filter(f => f.startsWith('0035_'))).toEqual(['0035_permisos_rrhh_app.sql'])
  })
  it('situacion_familiar: REVOKE ALL y después SOLO SELECT, INSERT y UPDATE (vigente_hasta, firma_documento_id)', () => {
    expect(de('situacion_familiar')).toEqual([
      'REVOKE ALL ON rrhh.situacion_familiar FROM rrhh_app',
      'GRANT SELECT, INSERT ON rrhh.situacion_familiar TO rrhh_app',
      'GRANT UPDATE (vigente_hasta, firma_documento_id) ON rrhh.situacion_familiar TO rrhh_app',
    ])
  })
  it('convenio_tablas_salariales: REVOKE ALL y después SOLO SELECT, INSERT, UPDATE, DELETE (lo de la 0033)', () => {
    expect(de('convenio_tablas_salariales')).toEqual([
      'REVOKE ALL ON rrhh.convenio_tablas_salariales FROM rrhh_app',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON rrhh.convenio_tablas_salariales TO rrhh_app',
    ])
  })
  it('no toca el default ACL del schema ni otras tablas, ni datos', () => {
    expect(codigo).not.toMatch(/ALTER DEFAULT PRIVILEGES/i)
    expect(sentencias.length).toBe(5)
    expect(codigo).not.toMatch(/\b(TRUNCATE|DELETE FROM|UPDATE rrhh|DROP|INSERT INTO)\b/i)
  })
})
