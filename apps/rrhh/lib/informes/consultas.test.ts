import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { CATALOGO } from './catalogo'
import { construirConsulta, ENTIDADES_CON_CONSULTA } from './consultas'

const SESION = '11111111-1111-4111-8111-111111111111'
const AJENA = '22222222-2222-4222-8222-222222222222'

describe('consultas de informes · aislamiento multi-tenant', () => {
  it('toda entidad del catálogo tiene consulta', () => {
    expect(CATALOGO.map(e => e.clave).sort()).toEqual([...ENTIDADES_CON_CONSULTA].sort())
  })

  for (const e of CATALOGO) {
    it(`${e.clave}: el WHERE filtra por la empresa de SESIÓN (primer parámetro) y nunca por otra`, () => {
      const q = construirConsulta(SESION, { entidad: e.clave, columnas: [], filtros: {}, agrupacion: null }, 10)
      // La tabla principal se filtra por empresa con un parámetro (no texto interpolado).
      expect(q.sql).toMatch(/WHERE [a-z]+\.empresa_id = \?::uuid/)
      expect(q.values[q.sql.slice(0, q.sql.indexOf('WHERE')).split('?').length - 1]).toBe(SESION)
      expect(q.values).not.toContain(AJENA)
      expect(q.sql).not.toContain(SESION) // siempre parametrizado
    })
  }

  it('los JOIN también exigen la misma empresa (un id de otra empresa no cuela por el JOIN)', () => {
    const q = construirConsulta(SESION, { entidad: 'fichajes', columnas: [], filtros: {}, agrupacion: null }, 10)
    expect(q.sql).toMatch(/JOIN rrhh\.empleados e ON e\.id = f\.empleado_id AND e\.empresa_id = f\.empresa_id/)
  })

  it('fichajes: un fichaje sin salida tiene horas NULL en SQL (no 0)', () => {
    const q = construirConsulta(SESION, { entidad: 'fichajes', columnas: [], filtros: {}, agrupacion: null }, 10)
    expect(q.sql).toMatch(/CASE WHEN f\.salida_at IS NULL THEN NULL/)
  })

  it('los valores de filtro viajan como parámetros', () => {
    const q = construirConsulta(SESION, { entidad: 'solicitudes', columnas: [], filtros: { tipo: 'vacaciones', fecha: { desde: '2026-01-01' } }, agrupacion: null }, 10)
    expect(q.values).toEqual(expect.arrayContaining([SESION, 'vacaciones', '2026-01-01', 10]))
    expect(q.sql).not.toContain('vacaciones')
  })
})
