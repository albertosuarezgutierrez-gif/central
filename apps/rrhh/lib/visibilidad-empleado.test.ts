// Documentos OCULTOS al empleado (migración 0029): ni listados, ni descargables (sin URL firmada), ni firmables,
// ni avisados, ni contados. prisma/Storage simulados: se comprueba el SQL que sale hacia la BD.
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@prisma/client', () => ({
  Prisma: { sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ sql: s.join('?'), values }) },
}))
const { queryRaw, executeRaw, urlFirmada, pushEmpleadoResultado, sendMail } = vi.hoisted(() => ({
  queryRaw: vi.fn(), executeRaw: vi.fn(async (_q?: unknown) => 1), urlFirmada: vi.fn(async (p: string) => `https://signed/${p}`),
  pushEmpleadoResultado: vi.fn(async () => 'enviado'), sendMail: vi.fn(async () => {}),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRaw, $executeRaw: executeRaw } }))
vi.mock('@/lib/storage', () => ({ subirObjeto: vi.fn(), borrarObjeto: vi.fn(), urlFirmada, presignSubida: vi.fn(), descargarObjeto: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ getTransporter: () => ({ sendMail }), MAIL_FROM: 'x@x' }))
vi.mock('@/lib/push', () => ({ pushEmpleadoResultado }))
vi.mock('@/lib/firma', () => ({ solicitarFirma: vi.fn() }))

import { listarExpediente, cambiarVisibilidadDocumento } from '@/lib/documental'
import { ACTOR_GESTOR, ACTOR_TITULAR } from '@/lib/carpetas'
import { avisarDocumento, listarAvisosEmpleado, marcarDocumentoVisto } from '@/lib/avisos'

type Sql = { sql: string; values: unknown[] }
const EMP = '11111111-1111-1111-1111-111111111111'
const E1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const D1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const fila = (o: Record<string, unknown>) => ({
  id: 'x', carpeta: 'contratos', nombre: 'n.pdf', tipo: 'application/pdf', tamano: 1, storage_path: 'empleado/p', subido_por: 'gestor',
  estado_firma: 'no_requiere', requiere_firma_empresa: false, creada_at: new Date(), visible_empleado: true, ...o,
})
const sqls = () => queryRaw.mock.calls.map(c => (c[0] as Sql).sql)

beforeEach(() => { vi.clearAllMocks(); executeRaw.mockResolvedValue(1) })

describe('listarExpediente: el empleado NO ve lo oculto', () => {
  beforeEach(() => {
    queryRaw.mockImplementation(async (q: Sql) => /FROM rrhh\.empleados/.test(q.sql) ? [{ id: E1 }] : [fila({})])
  })
  it('la consulta del TITULAR filtra visible_empleado (las nóminas siempre visibles)', async () => {
    await listarExpediente(EMP, E1, ACTOR_TITULAR)
    const q = sqls().find(s => /FROM rrhh\.documentos/.test(s))!
    expect(q).toMatch(/visible_empleado/)
    expect(q).toMatch(/carpeta\s*=\s*'nominas'/)
    expect(q).toMatch(/WHERE[\s\S]*visible_empleado/)
  })
  it('la del GESTOR ve todo: sin filtro, y devuelve visible_empleado para pintar el candado', async () => {
    queryRaw.mockImplementation(async (q: Sql) => /FROM rrhh\.empleados/.test(q.sql) ? [{ id: E1 }] : [fila({ visible_empleado: false })])
    const r = await listarExpediente(EMP, E1, ACTOR_GESTOR)
    const q = sqls().find(s => /FROM rrhh\.documentos/.test(s))!
    expect(q).not.toMatch(/WHERE[^]*visible_empleado\s+OR/) // sin condición de filtrado
    expect(q).toMatch(/SELECT[^]*visible_empleado[^]*FROM rrhh\.documentos/)
    expect(r[0].visible_empleado).toBe(false)
  })
  it('defensa en profundidad: aunque la BD devolviera una fila oculta, el titular no recibe su URL firmada', async () => {
    queryRaw.mockImplementation(async (q: Sql) => /FROM rrhh\.empleados/.test(q.sql) ? [{ id: E1 }]
      : [fila({ id: 'oculto', storage_path: 'empleado/secreto', visible_empleado: false }), fila({ id: 'visible', storage_path: 'empleado/ok' })])
    const r = await listarExpediente(EMP, E1, ACTOR_TITULAR)
    expect(r.map(d => d.id)).toEqual(['visible'])
    expect(urlFirmada).not.toHaveBeenCalledWith('empleado/secreto')
  })
})

describe('cambiarVisibilidadDocumento (gestor)', () => {
  it('oculta un documento sin firma, con scope empresa+empleado', async () => {
    queryRaw.mockImplementation(async () => [{ carpeta: 'contratos', estado_firma: 'no_requiere' }])
    await cambiarVisibilidadDocumento(EMP, E1, D1, false)
    const [u] = executeRaw.mock.calls.map(c => c[0] as Sql)
    expect(u.sql).toMatch(/UPDATE rrhh\.documentos SET visible_empleado/)
    expect(u.sql).toMatch(/empresa_id/); expect(u.sql).toMatch(/empleado_id/)
    expect(u.values).toEqual(expect.arrayContaining([false, D1, E1, EMP]))
  })
  it('rechaza ocultar un documento con firma (y no escribe)', async () => {
    queryRaw.mockImplementation(async () => [{ carpeta: 'contratos', estado_firma: 'pendiente' }])
    await expect(cambiarVisibilidadDocumento(EMP, E1, D1, false)).rejects.toThrow(/firma.*visible/i)
    expect(executeRaw).not.toHaveBeenCalled()
  })
  it('rechaza ocultar una nómina', async () => {
    queryRaw.mockImplementation(async () => [{ carpeta: 'nominas', estado_firma: 'no_requiere' }])
    await expect(cambiarVisibilidadDocumento(EMP, E1, D1, false)).rejects.toThrow(/nóminas/i)
    expect(executeRaw).not.toHaveBeenCalled()
  })
  it('documento de otro empleado/empresa → no encontrado', async () => {
    queryRaw.mockImplementation(async () => [])
    await expect(cambiarVisibilidadDocumento(EMP, E1, D1, false)).rejects.toThrow(/no encontrado/)
  })
  it('volver a mostrarlo siempre se permite', async () => {
    queryRaw.mockImplementation(async () => [{ carpeta: 'contratos', estado_firma: 'pendiente' }])
    await cambiarVisibilidadDocumento(EMP, E1, D1, true)
    expect(executeRaw).toHaveBeenCalledTimes(1)
  })
})

describe('avisos: nada se notifica ni se cuenta de lo oculto', () => {
  it('avisarDocumento de un documento oculto: no inserta aviso, ni email, ni push', async () => {
    queryRaw.mockImplementation(async () => [{ doc_nombre: 'Amonestación', nombre: 'Ana', email: 'a@a.es', empresa: 'X', visible_empleado: false, carpeta: 'contratos' }])
    const r = await avisarDocumento({ empresaId: EMP, empleadoId: E1, documentoId: D1, tipo: 'documento_nuevo', creadoPor: 'u' })
    expect(r).toBeNull()
    expect(sqls().some(s => /INSERT INTO rrhh\.avisos/.test(s))).toBe(false)
    expect(sendMail).not.toHaveBeenCalled()
    expect(pushEmpleadoResultado).not.toHaveBeenCalled()
  })
  it('la consulta que lee el documento a avisar pide visible_empleado', async () => {
    queryRaw.mockImplementation(async () => [])
    await avisarDocumento({ empresaId: EMP, empleadoId: E1, documentoId: D1, tipo: 'documento_nuevo', creadoPor: 'u' }).catch(() => {})
    expect(sqls()[0]).toMatch(/visible_empleado/)
  })
  it('listarAvisosEmpleado: ni avisos de documentos ocultos ni su contador', async () => {
    queryRaw.mockImplementation(async (q: Sql) => /count/.test(q.sql) ? [{ n: 0 }] : [])
    await listarAvisosEmpleado(EMP, E1)
    const [lista, cuenta] = sqls()
    expect(lista).toMatch(/visible_empleado/)
    expect(cuenta).toMatch(/visible_empleado/)
  })
  it('marcarDocumentoVisto de un documento oculto → false (la ruta responde 404) y no toca avisos', async () => {
    executeRaw.mockResolvedValue(0)
    const ok = await marcarDocumentoVisto(EMP, E1, D1)
    expect(ok).toBe(false)
    expect((executeRaw.mock.calls[0][0] as Sql).sql).toMatch(/visible_empleado/)
    expect(executeRaw).toHaveBeenCalledTimes(1)
  })
})
