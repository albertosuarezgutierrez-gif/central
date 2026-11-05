/**
 * Guardián `regression-nominas-modulo` (N0): el cálculo de nóminas es un MÓDULO por empresa (rrhh.empresa_modulos, 0031).
 *  - el cron solo recorre empresas con el módulo activo en modo 'calculo' y calcula en modo fail-closed;
 *  - el responsable no puede activarlo (ninguna ruta /api/admin escribe empresa_modulos); solo el operador;
 *  - confirmar exige un desglose sin cifras pendientes.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { estadoDeFila, modoMotor, validarCambioModulo } from './modulos-empresa-reglas'

const APP = join(__dirname, '..')
const leer = (p: string) => readFileSync(join(APP, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
function listar(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? listar(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
}

describe('reglas del interruptor', () => {
  it('sin fila o inactivo = apagado; activo con modo = su modo; modo raro = no se sabe', () => {
    expect(estadoDeFila(null)).toEqual({ estado: 'apagado' })
    expect(estadoDeFila({ activo: false, modo: 'calculo', activado_por: 'x', activado_at: null })).toEqual({ estado: 'apagado' })
    expect(estadoDeFila({ activo: true, modo: 'calculo', activado_por: 'op', activado_at: '2026-11-05T10:00:00Z' }))
      .toEqual({ estado: 'activo', modo: 'calculo', activadoPor: 'op', activadoAt: '2026-11-05T10:00:00.000Z' })
    expect(estadoDeFila({ activo: true, modo: 'otro', activado_por: null, activado_at: null }).estado).toBe('desconocido')
  })
  it('el motor solo va en modo cálculo con el módulo activo en cálculo; «no se sabe» = simulación', () => {
    expect(modoMotor({ estado: 'activo', modo: 'calculo', activadoPor: null, activadoAt: null })).toBe('calculo')
    expect(modoMotor({ estado: 'activo', modo: 'reparto', activadoPor: null, activadoAt: null })).toBe('simulacion')
    expect(modoMotor({ estado: 'apagado' })).toBe('simulacion')
    expect(modoMotor({ estado: 'desconocido', motivo: 'x' })).toBe('simulacion')
  })
  it('el PUT del operador lo exige todo explícito', () => {
    const ok = { empresa_id: '11111111-1111-1111-1111-111111111111', modulo: 'nominas', activo: true, modo: 'calculo', activado_por: 'Alberto' }
    expect(validarCambioModulo(ok).ok).toBe(true)
    expect(validarCambioModulo({ ...ok, modo: undefined }).ok).toBe(false)
    expect(validarCambioModulo({ ...ok, activado_por: ' ' }).ok).toBe(false)
    expect(validarCambioModulo({ ...ok, modulo: 'contabilidad' }).ok).toBe(false)
    expect(validarCambioModulo({ ...ok, empresa_id: 'x' }).ok).toBe(false)
    expect(validarCambioModulo({ ...ok, activo: 'true' }).ok).toBe(false)
  })
})

describe('cron /api/cron/nominas', () => {
  const cron = leer('app/api/cron/nominas/route.ts')
  it('lee las empresas del interruptor, no TODAS las empresas', () => {
    expect(cron).toMatch(/await empresasConNominasEnCalculo\(\)/)
    expect(cron).not.toMatch(/rrhh\.empresas/i)
    expect(cron).not.toMatch(/prisma\./)
  })
  it('calcula en modo fail-closed', () => {
    expect(cron).toMatch(/generarBorradores\([^)]*'calculo'\)/)
  })
  it('la consulta del interruptor exige activo + modo calculo + modulo nominas', () => {
    const lib = leer('lib/modulos-empresa.ts')
    const q = lib.slice(lib.indexOf('async function empresasConNominasEnCalculo'), lib.indexOf('async function guardarModulo'))
    expect(q).toMatch(/m\.modulo = 'nominas'/)
    expect(q).toMatch(/m\.activo = true/)
    expect(q).toMatch(/m\.modo = 'calculo'/)
    expect(q).not.toMatch(/catch/) // si no se puede leer, el cron NO procesa (no se traga el error devolviendo [] ni todas)
  })
})

describe('quién activa el módulo', () => {
  it('ninguna ruta /api/admin ni pantalla escribe empresa_modulos', () => {
    const escriben = [...listar(join(APP, 'app/api/admin')), ...listar(join(APP, 'app/admin'))]
      .filter(f => /guardarModulo|INSERT INTO rrhh\.empresa_modulos|UPDATE rrhh\.empresa_modulos/i.test(readFileSync(f, 'utf8')))
    expect(escriben).toEqual([])
  })
  it('la ruta del operador exige el secreto del operador', () => {
    const r = leer('app/api/operador/empresas/modulos/route.ts')
    expect(r).toMatch(/if \(!operadorAutorizado\(req\)\) return/)
    expect(r).toMatch(/guardarModulo/)
  })
  it('la migración 0031 crea la tabla con sus columnas y apagado por defecto', () => {
    const sql = readFileSync(join(APP, 'prisma/migrations/0031_empresa_modulos.sql'), 'utf8')
    for (const c of ['empresa_id', 'modulo', 'activo', 'modo', 'activado_por', 'activado_at']) expect(sql).toContain(c)
    expect(sql).toMatch(/activo\s+boolean\s+NOT NULL DEFAULT false/)
    expect(sql).toMatch(/CHECK \(modo IN \('reparto', 'calculo'\)\)/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS/)
  })
})

describe('confirmar nómina', () => {
  it('rechaza un desglose con cifras pendientes o calculado con las tablas antiguas', () => {
    const r = leer('app/api/admin/nominas/[nominaId]/confirmar/route.ts')
    const guarda = r.indexOf('desgloseConfirmable(nomina.datos_calculo)')
    expect(guarda).toBeGreaterThan(0)
    expect(guarda).toBeLessThan(r.indexOf('generarNominaPdf('))
    expect(r).toMatch(/if \(!confirmable\.ok\) return NextResponse\.json/)
  })
})
