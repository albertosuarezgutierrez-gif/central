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

// 0036 (seguro obligatorio por convenio): dos tablas nuevas, mismo cepo. Cada tabla nueva de una migración debe llevar su
// REVOKE ALL + GRANT exacto (el default ACL del schema lo da TODO).
const sql36 = readFileSync(join(DIR, '0036_convenio_seguro_obligatorio.sql'), 'utf8')
const codigo36 = sql36.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()
const sentencias36 = codigo36.split(';').map(s => s.trim()).filter(Boolean)
const permisos36 = (tabla: string) => sentencias36.filter(s => /^(REVOKE|GRANT)\b/.test(s) && s.includes(`rrhh.${tabla} `))

describe('0036_convenio_seguro_obligatorio.sql', () => {
  it('es la única 0036', () => {
    expect(readdirSync(DIR).filter(f => f.startsWith('0036_'))).toEqual(['0036_convenio_seguro_obligatorio.sql'])
  })
  it('toda tabla que crea lleva REVOKE ALL + GRANT a rrhh_app', () => {
    const creadas = [...codigo36.matchAll(/CREATE TABLE IF NOT EXISTS rrhh\.(\w+)/g)].map(m => m[1]).sort()
    expect(creadas).toEqual(['convenio_seguros_obligatorios', 'leads_correduria'])
    for (const t of creadas) {
      const p = permisos36(t)
      expect(p[0], t).toBe(`REVOKE ALL ON rrhh.${t} FROM rrhh_app`)
      expect(p.length, t).toBeGreaterThan(1)
    }
  })
  it('convenio_seguros_obligatorios: SOLO SELECT, INSERT, UPDATE, DELETE', () => {
    expect(permisos36('convenio_seguros_obligatorios')).toEqual([
      'REVOKE ALL ON rrhh.convenio_seguros_obligatorios FROM rrhh_app',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON rrhh.convenio_seguros_obligatorios TO rrhh_app',
    ])
  })
  it('leads_correduria: histórico sin DELETE; UPDATE solo del resultado del envío', () => {
    expect(permisos36('leads_correduria')).toEqual([
      'REVOKE ALL ON rrhh.leads_correduria FROM rrhh_app',
      'GRANT SELECT, INSERT ON rrhh.leads_correduria TO rrhh_app',
      'GRANT UPDATE (estado, detalle, actualizada_at) ON rrhh.leads_correduria TO rrhh_app',
    ])
  })
  it('aditiva: no toca el default ACL, ni borra, ni cambia datos', () => {
    expect(codigo36).not.toMatch(/ALTER DEFAULT PRIVILEGES/i)
    expect(codigo36).not.toMatch(/\b(TRUNCATE|DELETE FROM|UPDATE rrhh|DROP|INSERT INTO)\b/i)
  })
  it('tres estados en la cobertura: NULL = no se sabe (sin DEFAULT ni NOT NULL en seguro_estado)', () => {
    expect(codigo36).toMatch(/seguro_estado text CHECK \(seguro_estado IS NULL OR seguro_estado IN \('cubierto', 'no_cubierto'\)\)/)
    expect(codigo36).not.toMatch(/seguro_estado text[^,]*(DEFAULT|NOT NULL)/i)
  })
})
