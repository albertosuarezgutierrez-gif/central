import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const E = '11111111-1111-4111-8111-111111111111'
const EMP = '22222222-2222-4222-8222-222222222222'

const consulta = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: (...a: unknown[]) => consulta(...a) } }))
const activo = vi.fn()
const entrada = vi.fn(async (..._a: unknown[]) => ({ id: 'f1', estado: 'activo' }))
const salida = vi.fn(async (..._a: unknown[]) => ({ id: 'f1', estado: 'cerrado' }))
vi.mock('@/lib/fichajes', () => ({
  fichajeActivo: (...a: unknown[]) => activo(...a),
  ficharEntrada: (...a: unknown[]) => entrada(...a),
  ficharSalida: (...a: unknown[]) => salida(...a),
}))

import { POST } from '@/app/api/operador/fichajes/route'
import { validarFichajeTaller, normalizaNif } from './fichaje-taller'

const pide = (body: unknown, token: string | null = 's3cret') => POST(new Request('https://x/api/operador/fichajes', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}))

beforeEach(() => {
  process.env.RRHH_FICHAJE_TALLER_SECRET = 's3cret'
  process.env.RRHH_OPERADOR_SECRET = 'otro-secreto'
  consulta.mockReset(); activo.mockReset(); entrada.mockClear(); salida.mockClear()
  consulta.mockResolvedValue([{ id: EMP, nombre: 'Pepe', estado: 'activo' }])
  activo.mockResolvedValue(null)
})
afterEach(() => { delete process.env.RRHH_FICHAJE_TALLER_SECRET; delete process.env.RRHH_OPERADOR_SECRET })

describe('POST /api/operador/fichajes', () => {
  it('sin Bearer, con Bearer erróneo o con el secreto de OPERADOR: 401 y no toca nada', async () => {
    expect((await pide({}, null)).status).toBe(401)
    expect((await pide({}, 'malo')).status).toBe(401)
    expect((await pide({ empresa_id: E, accion: 'entrada', dni: '1A' }, 'otro-secreto')).status).toBe(401)
    expect(consulta).not.toHaveBeenCalled()
  })

  it('sin la env configurada el puerto está cerrado (fail-closed)', async () => {
    delete process.env.RRHH_FICHAJE_TALLER_SECRET
    expect((await pide({ empresa_id: E, accion: 'entrada', dni: '1A' }, 'undefined')).status).toBe(401)
  })

  it('entrada: 201, hora del servidor (no se manda), origen taller, sin ubicación y la IP del cuerpo', async () => {
    const r = await pide({ empresa_id: E, accion: 'entrada', dni: '12345678z', ip: '88.1.2.3', entrada_at: '2000-01-01' })
    expect(r.status).toBe(201)
    expect(entrada).toHaveBeenCalledWith(E, EMP, null, null, { sin_ubicacion: true, origen: 'taller', ip: '88.1.2.3' })
    expect(JSON.stringify(entrada.mock.calls[0])).not.toContain('2000')
  })

  it('sin ip válida en el cuerpo usa la de la petición', async () => {
    await pide({ empresa_id: E, accion: 'entrada', empleado_id: EMP, ip: 'no-es-ip' })
    expect(entrada.mock.calls[0][4]).toMatchObject({ ip: '9.9.9.9' })
  })

  it('entrada con una entrada abierta: 409 ya_fichado, sin segundo fichaje', async () => {
    activo.mockResolvedValue({ id: 'f0', entrada_at: '2026-11-04T07:00:00Z' })
    const r = await pide({ empresa_id: E, accion: 'entrada', empleado_id: EMP })
    expect(r.status).toBe(409); expect((await r.json()).codigo).toBe('ya_fichado')
    expect(entrada).not.toHaveBeenCalled()
  })

  it('salida sin entrada: 409 sin_entrada; con entrada: cierra', async () => {
    const r = await pide({ empresa_id: E, accion: 'salida', empleado_id: EMP })
    expect(r.status).toBe(409); expect((await r.json()).codigo).toBe('sin_entrada')
    activo.mockResolvedValue({ id: 'f0' })
    expect((await pide({ empresa_id: E, accion: 'salida', empleado_id: EMP })).status).toBe(201)
    expect(salida).toHaveBeenCalledTimes(1)
  })

  it('empleado de otra empresa o inexistente: 404; inactivo: 403; ambiguo: 409', async () => {
    consulta.mockResolvedValueOnce([])
    expect((await pide({ empresa_id: E, accion: 'entrada', dni: '1A' })).status).toBe(404)
    consulta.mockResolvedValueOnce([{ id: EMP, nombre: 'P', estado: 'baja' }])
    expect((await pide({ empresa_id: E, accion: 'entrada', dni: '1A' })).status).toBe(403)
    consulta.mockResolvedValueOnce([{ id: EMP, nombre: 'P', estado: 'activo' }, { id: E, nombre: 'Q', estado: 'activo' }])
    expect((await pide({ empresa_id: E, accion: 'entrada', dni: '1A' })).status).toBe(409)
    expect(entrada).not.toHaveBeenCalled()
  })

  it('cuerpo inválido: 400', async () => {
    expect((await pide({ empresa_id: 'x', accion: 'entrada', dni: '1A' })).status).toBe(400)
    expect((await pide({ empresa_id: E, accion: 'toggle', dni: '1A' })).status).toBe(400)
    expect((await pide({ empresa_id: E, accion: 'entrada' })).status).toBe(400)
  })
})

describe('validarFichajeTaller', () => {
  it('normaliza el NIF y rechaza dos identificadores', () => {
    expect(normalizaNif(' 12.345.678-z ')).toBe('12345678Z')
    const r = validarFichajeTaller({ empresa_id: E, accion: 'salida', dni: '12 345 678 z' })
    expect(r.ok && r.datos.dni).toBe('12345678Z')
    expect(validarFichajeTaller({ empresa_id: E, accion: 'salida', dni: '1', empleado_id: EMP }).ok).toBe(false)
  })
})
