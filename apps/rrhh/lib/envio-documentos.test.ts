// Cepos de `asignarStaging` (envío masivo) sin BD ni Storage: prisma y storage simulados.
// Cubren: idempotencia por envio_id (reintento no duplica), firma prohibida en formacion /
// datos_personales, y tamaño/tipo tomados del objeto REAL del staging (no del cliente).
import { vi, describe, it, expect, beforeEach } from 'vitest'

const { queryRaw, copiarObjeto, borrarObjeto, infoObjeto } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  copiarObjeto: vi.fn(async () => {}),
  borrarObjeto: vi.fn(async () => {}),
  infoObjeto: vi.fn(async () => ({ tamano: 1000, tipo: 'application/pdf' }) as { tamano: number | null; tipo: string | null } | null),
}))
// CI de la raíz no genera el cliente Prisma: `Prisma.sql` se simula (devuelve {sql, values}).
vi.mock('@prisma/client', () => ({
  Prisma: { sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ sql: s.join('?'), values }) },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRaw, $executeRaw: vi.fn() } }))
vi.mock('@/lib/storage', () => ({
  descargarObjeto: vi.fn(), copiarObjeto, borrarObjeto, infoObjeto, listarObjetos: vi.fn(), borrarObjetos: vi.fn(),
}))
vi.mock('@/lib/avisos', () => ({ avisarDocumento: vi.fn(async () => null), avisarSolicitudFirma: vi.fn(async () => null) }))
vi.mock('@/lib/ai', () => ({ iaChat: vi.fn(), iaDisponible: () => false }))
vi.mock('@/lib/distribuir-nominas', () => ({ extraerTextoPorPagina: vi.fn() }))

import { asignarStaging, type EntradaAsignar } from '@/lib/envio-documentos'

const EMP = '11111111-1111-1111-1111-111111111111'
const E1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const E2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ENVIO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const PATH = `staging/${EMP}/dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf`

type Sql = { sql: string; values: unknown[] }
let previas: { id: string; empleado_id: string }[] = []
let insertConflicto = false
const inserts: Sql[] = []

beforeEach(() => {
  vi.clearAllMocks()
  previas = []; insertConflicto = false; inserts.length = 0
  infoObjeto.mockImplementation(async () => ({ tamano: 1000, tipo: 'application/pdf' }))
  queryRaw.mockImplementation(async (q: Sql) => {
    const s = q.sql
    if (/FROM rrhh\.empleados/.test(s)) {
      const pedidos = q.values.find(v => Array.isArray(v)) as string[] | undefined
      return (pedidos ?? [E1, E2]).filter(id => id === E1 || id === E2).map(id => ({ id }))
    }
    if (/INSERT INTO rrhh\.documentos/.test(s)) { inserts.push(q); return insertConflicto ? [] : [{ id: `doc-${inserts.length}` }] }
    if (/FROM rrhh\.documentos/.test(s) && /empleado_id = ANY/.test(s)) return previas
    if (/FROM rrhh\.documentos/.test(s)) return [{ id: 'doc-ganador' }]
    throw new Error(`SQL inesperada: ${s}`)
  })
})

const base = (p: Partial<EntradaAsignar> = {}): EntradaAsignar => ({
  path: PATH, nombre_original: 'Contrato.pdf', titulo: 'Contrato', carpeta: 'contratos', categoria: 'contrato',
  resumen: null, empleado_ids: [E1, E2], firma: 'none', avisar: false, envio_id: ENVIO, ...p,
})

describe('asignarStaging: idempotencia por envio_id', () => {
  it('reintento: lo ya enviado se devuelve como «ya enviado» y NO se copia otra vez', async () => {
    previas = [{ id: 'doc-viejo', empleado_id: E1 }]
    const r = await asignarStaging(EMP, 'u1', base())
    expect(copiarObjeto).toHaveBeenCalledTimes(1)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].values).toContain(E2)
    expect(r.resultados.find(x => x.empleado_id === E1)).toEqual({ empleado_id: E1, doc_id: 'doc-viejo', ya_enviado: true })
    expect(r.ok).toBe(2)
  })
  it('todo ya enviado: ni copia ni INSERT (ni hace falta que exista el staging)', async () => {
    previas = [{ id: 'd1', empleado_id: E1 }, { id: 'd2', empleado_id: E2 }]
    infoObjeto.mockImplementation(async () => null)
    const r = await asignarStaging(EMP, 'u1', base())
    expect(copiarObjeto).not.toHaveBeenCalled()
    expect(inserts).toHaveLength(0)
    expect(r.ok).toBe(2)
    expect(r.resultados.every(x => x.ya_enviado)).toBe(true)
  })
  it('carrera (ON CONFLICT sin fila): borra la copia sobrante y devuelve la existente', async () => {
    insertConflicto = true
    const r = await asignarStaging(EMP, 'u1', base({ empleado_ids: [E1] }))
    expect(inserts[0].sql).toMatch(/ON CONFLICT \(envio_id, empleado_id\) WHERE envio_id IS NOT NULL DO NOTHING/)
    expect(borrarObjeto).toHaveBeenCalledWith(expect.stringMatching(/^empleado\//))
    expect(r.resultados[0]).toEqual({ empleado_id: E1, doc_id: 'doc-ganador', ya_enviado: true })
  })
  it('usa el envio_id del cliente y rechaza uno que no es uuid', async () => {
    const r = await asignarStaging(EMP, 'u1', base({ empleado_ids: [E1] }))
    expect(r.envio_id).toBe(ENVIO)
    await expect(asignarStaging(EMP, 'u1', base({ envio_id: 'x' }))).rejects.toThrow(/no válido/)
  })
  it('guarda «avisar» en la fila (lo lee firmar-empresa)', async () => {
    await asignarStaging(EMP, 'u1', base({ empleado_ids: [E1], firma: 'empresa_y_empleado', avisar: false }))
    expect(inserts[0].sql).toMatch(/avisar\)/)
    expect(inserts[0].values.at(-1)).toBe(false)
  })
})

describe('asignarStaging: firma prohibida en formacion y datos_personales', () => {
  for (const carpeta of ['formacion', 'datos_personales']) {
    for (const firma of ['solo_empleado', 'empresa_y_empleado'] as const) {
      it(`${carpeta} + ${firma} → rechazado sin tocar nada`, async () => {
        await expect(asignarStaging(EMP, 'u1', base({ carpeta, firma }))).rejects.toThrow(/no se pide firma/)
        expect(queryRaw).not.toHaveBeenCalled()
        expect(copiarObjeto).not.toHaveBeenCalled()
      })
    }
    it(`${carpeta} sin firma → se envía`, async () => {
      const r = await asignarStaging(EMP, 'u1', base({ carpeta, firma: 'none', empleado_ids: [E1] }))
      expect(r.ok).toBe(1)
    })
  }
})

describe('asignarStaging: tamaño y tipo del objeto REAL del staging', () => {
  it('graba el tamaño/tipo que da Storage', async () => {
    infoObjeto.mockImplementation(async () => ({ tamano: 4321, tipo: 'application/pdf' }))
    await asignarStaging(EMP, 'u1', base({ empleado_ids: [E1] }))
    expect(inserts[0].values).toContain(4321)
    expect(inserts[0].values).toContain('application/pdf')
  })
  it('objeto demasiado grande → rechazado aunque el cliente no diga nada', async () => {
    infoObjeto.mockImplementation(async () => ({ tamano: 500 * 1024 * 1024, tipo: 'application/pdf' }))
    await expect(asignarStaging(EMP, 'u1', base())).rejects.toThrow(/supera/)
    expect(copiarObjeto).not.toHaveBeenCalled()
  })
  it('staging inexistente → error claro, sin copias', async () => {
    infoObjeto.mockImplementation(async () => null)
    await expect(asignarStaging(EMP, 'u1', base())).rejects.toThrow(/no encontrado/)
    expect(copiarObjeto).not.toHaveBeenCalled()
  })
})
