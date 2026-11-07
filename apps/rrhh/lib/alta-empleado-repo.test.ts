// Aislamiento y escritura única del alta (asistente + importación). rrhh_app tiene BYPASSRLS: la empresa sale SIEMPRE de
// getSesion() y cada sentencia lleva esa empresa. Complementa `lib/aislamiento-nominas.test.ts` (que ya escanea lib/).
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const m = vi.hoisted(() => {
  const sentencias: { sql: string; valores: unknown[] }[] = []
  const creados: Record<string, unknown>[] = []
  const estado = { filasExistentes: [] as { dni: string; nss: string; email: string }[] }
  const tx = {
    $queryRaw: vi.fn(async (q: { sql: string; values: unknown[] }) => {
      sentencias.push({ sql: q.sql, valores: q.values })
      if (/FROM rrhh\.empleados/.test(q.sql)) return estado.filasExistentes
      if (/INSERT INTO rrhh\.empleados/.test(q.sql)) return [{ id: `id-${sentencias.length}` }]
      return [{ ok: 1 }]
    }),
    contratos_laborales: { create: vi.fn(async (a: { data: Record<string, unknown> }) => { creados.push(a.data) }) },
  }
  const prisma = { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx), $queryRaw: tx.$queryRaw }
  return { sentencias, creados, estado, tx, prisma }
})
vi.mock('./prisma', () => ({ prisma: m.prisma }))
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }))
const { sentencias, creados, tx } = m

import { darDeAltaLote } from './alta-empleado-repo'
import { validarAlta } from './alta-empleado'

const EMPRESA = '11111111-1111-1111-1111-111111111111'
const alta = (dni: string, email: string, conContrato = false) => {
  const r = validarAlta({
    nombre: 'Ana', apellidos: 'García', dni, email,
    ...(conContrato ? { tipo_contrato: 'temporal', fecha_alta: '2026-11-01', fecha_fin: '2027-04-30', grupo_cotizacion: '7', jornada_pct: '100', salario_base: '1350' } : {}),
  }, { hoy: '2026-11-07', tablas: null })
  if (!r.ok) throw new Error('alta de prueba inválida')
  return r.alta
}

beforeEach(() => { sentencias.length = 0; creados.length = 0; m.estado.filasExistentes = [] })

describe('darDeAltaLote', () => {
  it('cerrojo por empresa, relectura de la plantilla y cada INSERT con la empresa de la sesión', async () => {
    const r = await darDeAltaLote(EMPRESA, [alta('12345678Z', 'a@x.es', true), alta('X1234567L', 'b@x.es')])
    expect(r.creados).toHaveLength(2)
    expect(sentencias[0].sql).toMatch(/pg_advisory_xact_lock/)
    expect(sentencias[0].valores).toContain(EMPRESA)
    expect(sentencias[1].sql).toMatch(/FROM rrhh\.empleados WHERE empresa_id = (\?|\$\d+)::uuid/); expect(sentencias[1].valores).toEqual([EMPRESA])
    const inserts = sentencias.filter(s => /INSERT INTO rrhh\.empleados/.test(s.sql))
    expect(inserts).toHaveLength(2)
    for (const s of inserts) expect(s.valores[0]).toBe(EMPRESA)
    expect(creados).toHaveLength(1)
    expect(creados[0]).toMatchObject({ empresa_id: EMPRESA, duracion: 'temporal', grupo_cotizacion: 7 })
    expect(creados[0].empleado_id).toBe(r.creados[0].id)
  })

  it('una persona que ya existe (carrera con otra alta) se salta; el resto entra', async () => {
    m.estado.filasExistentes = [{ dni: '12345678Z', nss: '', email: 'otra@x.es' }]
    const r = await darDeAltaLote(EMPRESA, [alta('12345678Z', 'a@x.es'), alta('X1234567L', 'b@x.es'), alta('Y0000000Z', 'B@x.es')])
    expect(r.creados.map(c => c.indice)).toEqual([1])
    expect(r.rechazadas.map(x => x.indice)).toEqual([0, 2])
    expect(r.rechazadas[1].motivo).toMatch(/fichero/)
  })

  it('un error de BD tumba el lote entero (no se traga)', async () => {
    tx.contratos_laborales.create.mockRejectedValueOnce(Object.assign(new Error('fallo'), { code: 'P2002' }))
    await expect(darDeAltaLote(EMPRESA, [alta('12345678Z', 'a@x.es', true)])).rejects.toThrow('fallo')
  })
})

describe('rutas del alta: empresa SOLO de getSesion()', () => {
  const APP = join(__dirname, '..')
  const FICHEROS = [
    'app/api/admin/empleados/importar/route.ts',
    'app/api/admin/empleados/importar/plantilla/route.ts',
    'app/admin/empleados/nuevo/actions.ts',
    'app/admin/empleados/nuevo/page.tsx',
    'app/admin/empleados/importar/page.tsx',
  ]
  for (const f of FICHEROS) {
    it(f, () => {
      const s = readFileSync(join(APP, f), 'utf8').replace(/\/\/.*$/gm, '')
      expect(s).toMatch(/await getSesion\(\)/)
      expect(s).not.toMatch(/(body|form|datos|params|searchParams)\s*(\??\.get\(\s*['"]|\??\.|\??\.?\[\s*['"])\s*empresa_?id/i)
      // Ni filas ni el fichero a la consola: solo códigos de error.
      const sinTextos = s.replace(/'[^'\n]*'|`[^`]*`/g, "''")
      expect(sinTextos).not.toMatch(/console\.\w+\([^)]*\b(entrada|datos|alta|altas|matriz|archivo|previa|message)\b/)
    })
  }
  it('el detector caza una empresa leída de la petición', () => {
    const mala = "const { empresa_id } = await getSesion(); const x = form?.get('empresa_id')"
    expect(mala).toMatch(/(body|form|datos|params|searchParams)\s*(\??\.get\(\s*['"]|\??\.|\??\.?\[\s*['"])\s*empresa_?id/i)
  })
})
