import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const E = '11111111-1111-4111-8111-111111111111'
const EMP = '22222222-2222-4222-8222-222222222222'
const TALLER = '55555555-5555-4555-8555-555555555555'

const consulta = vi.fn() // el EMPLEADO (y el UPDATE del operador)
const habilitada = vi.fn() // «¿esta empresa habilitó a este taller?» (migración 0030): consulta aparte para no mezclar el orden de las demás
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => ((a[0] as { strings: string[] }).strings.join('?').includes(') AS ok') ? habilitada(...a) : consulta(...a)),
  },
}))
const activo = vi.fn()
const entrada = vi.fn(async (..._a: unknown[]) => ({ id: 'f1', estado: 'activo' }))
const salida = vi.fn(async (..._a: unknown[]) => ({ id: 'f1', estado: 'cerrado' }))
vi.mock('@/lib/fichajes', () => ({
  fichajeActivo: (...a: unknown[]) => activo(...a),
  ficharEntrada: (...a: unknown[]) => entrada(...a),
  ficharSalida: (...a: unknown[]) => salida(...a),
}))

import { POST } from '@/app/api/operador/fichajes/route'
import { PUT as habilitar } from '@/app/api/operador/empresas/fichaje-taller/route'
import { validarFichajeTaller, normalizaNif } from './fichaje-taller'

const pide = (body: unknown, token: string | null = 's3cret') => POST(new Request('https://x/api/operador/fichajes', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}))

beforeEach(() => {
  process.env.RRHH_FICHAJE_TALLER_SECRET = 's3cret'
  process.env.RRHH_OPERADOR_SECRET = 'otro-secreto'
  consulta.mockReset(); activo.mockReset(); entrada.mockClear(); salida.mockClear()
  habilitada.mockReset(); habilitada.mockResolvedValue([{ ok: true }])
  consulta.mockResolvedValue([{ id: EMP, nombre: 'Pepe', estado: 'activo' }])
  activo.mockResolvedValue(null)
})
afterEach(() => { delete process.env.RRHH_FICHAJE_TALLER_SECRET; delete process.env.RRHH_OPERADOR_SECRET })

describe('POST /api/operador/fichajes', () => {
  it('sin Bearer, con Bearer erróneo o con el secreto de OPERADOR: 401 y no toca nada', async () => {
    expect((await pide({}, null)).status).toBe(401)
    expect((await pide({}, 'malo')).status).toBe(401)
    expect((await pide({ taller_id: TALLER, empresa_id: E, accion: 'entrada', dni: '1A' }, 'otro-secreto')).status).toBe(401)
    expect(consulta).not.toHaveBeenCalled()
  })

  it('sin la env configurada el puerto está cerrado (fail-closed)', async () => {
    delete process.env.RRHH_FICHAJE_TALLER_SECRET
    expect((await pide({ taller_id: TALLER, empresa_id: E, accion: 'entrada', dni: '1A' }, 'undefined')).status).toBe(401)
  })

  it('entrada: 201, hora del servidor (no se manda), origen taller, sin ubicación y la IP del cuerpo', async () => {
    const r = await pide({ taller_id: TALLER, empresa_id: E, accion: 'entrada', dni: '12345678z', ip: '88.1.2.3', entrada_at: '2000-01-01' })
    expect(r.status).toBe(201)
    expect(entrada).toHaveBeenCalledWith(E, EMP, null, null, { sin_ubicacion: true, origen: 'taller', ip: '88.1.2.3' })
    expect(JSON.stringify(entrada.mock.calls[0])).not.toContain('2000')
  })

  it('sin ip válida en el cuerpo usa la de la petición', async () => {
    await pide({ taller_id: TALLER, empresa_id: E, accion: 'entrada', empleado_id: EMP, ip: 'no-es-ip' })
    expect(entrada.mock.calls[0][4]).toMatchObject({ ip: '9.9.9.9' })
  })

  it('entrada con una entrada abierta: 409 ya_fichado, sin segundo fichaje', async () => {
    activo.mockResolvedValue({ id: 'f0', entrada_at: '2026-11-04T07:00:00Z' })
    const r = await pide({ taller_id: TALLER, empresa_id: E, accion: 'entrada', empleado_id: EMP })
    expect(r.status).toBe(409); expect((await r.json()).codigo).toBe('ya_fichado')
    expect(entrada).not.toHaveBeenCalled()
  })

  it('salida sin entrada: 409 sin_entrada; con entrada: cierra', async () => {
    const r = await pide({ taller_id: TALLER, empresa_id: E, accion: 'salida', empleado_id: EMP })
    expect(r.status).toBe(409); expect((await r.json()).codigo).toBe('sin_entrada')
    activo.mockResolvedValue({ id: 'f0' })
    expect((await pide({ taller_id: TALLER, empresa_id: E, accion: 'salida', empleado_id: EMP })).status).toBe(201)
    expect(salida).toHaveBeenCalledTimes(1)
  })

  it('empleado de otra empresa o inexistente: 404; inactivo: 403; ambiguo: 409', async () => {
    consulta.mockResolvedValueOnce([])
    expect((await pide({ taller_id: TALLER, empresa_id: E, accion: 'entrada', dni: '1A' })).status).toBe(404)
    consulta.mockResolvedValueOnce([{ id: EMP, nombre: 'P', estado: 'baja' }])
    expect((await pide({ taller_id: TALLER, empresa_id: E, accion: 'entrada', dni: '1A' })).status).toBe(403)
    consulta.mockResolvedValueOnce([{ id: EMP, nombre: 'P', estado: 'activo' }, { id: E, nombre: 'Q', estado: 'activo' }])
    expect((await pide({ taller_id: TALLER, empresa_id: E, accion: 'entrada', dni: '1A' })).status).toBe(409)
    expect(entrada).not.toHaveBeenCalled()
  })

  // Hallazgo 2 (revisión de seguridad): sin esto, quien conociera un empresa_id podía fichar contra OTRA empresa.
  // Cepo visto fallar el 05/11/2026: quitar el `if (hab[0]?.ok !== true)` de la ruta → rojo en estos tres.
  it('la empresa no ha habilitado a ESTE taller (otro taller, sin habilitar o empresa inexistente): 403 y no se mira al empleado', async () => {
    for (const filas of [[{ ok: false }], [{ ok: null }], []]) {
      consulta.mockClear(); entrada.mockClear()
      habilitada.mockResolvedValue(filas)
      const r = await pide({ taller_id: TALLER, empresa_id: E, accion: 'entrada', empleado_id: EMP })
      expect(r.status).toBe(403)
      expect((await r.json()).codigo).toBe('fichaje_taller_no_habilitado')
      expect(consulta).not.toHaveBeenCalled()
      expect(entrada).not.toHaveBeenCalled()
    }
  })

  it('la comprobación compara con el taller_id RECIBIDO (consulta parametrizada con ese taller y esa empresa)', async () => {
    await pide({ taller_id: TALLER, empresa_id: E, accion: 'entrada', empleado_id: EMP })
    const sql = habilitada.mock.calls[0][0] as { values: unknown[]; strings: string[] }
    expect(sql.values).toEqual([TALLER, E])
    expect(sql.strings.join('?')).toMatch(/fichaje_taller_id = \?::uuid/)
  })

  it('sin taller_id (o no uuid): 400', async () => {
    expect((await pide({ empresa_id: E, accion: 'entrada', empleado_id: EMP })).status).toBe(400)
    expect((await pide({ taller_id: 'x', empresa_id: E, accion: 'entrada', empleado_id: EMP })).status).toBe(400)
  })

  it('cuerpo inválido: 400', async () => {
    expect((await pide({ taller_id: TALLER, empresa_id: 'x', accion: 'entrada', dni: '1A' })).status).toBe(400)
    expect((await pide({ taller_id: TALLER, empresa_id: E, accion: 'toggle', dni: '1A' })).status).toBe(400)
    expect((await pide({ taller_id: TALLER, empresa_id: E, accion: 'entrada' })).status).toBe(400)
  })
})

describe('validarFichajeTaller', () => {
  it('normaliza el NIF y rechaza dos identificadores', () => {
    expect(normalizaNif(' 12.345.678-z ')).toBe('12345678Z')
    const r = validarFichajeTaller({ taller_id: TALLER, empresa_id: E, accion: 'salida', dni: '12 345 678 z' })
    expect(r.ok && r.datos.dni).toBe('12345678Z')
    expect(validarFichajeTaller({ taller_id: TALLER, empresa_id: E, accion: 'salida', dni: '1', empleado_id: EMP }).ok).toBe(false)
  })
})

describe('PUT /api/operador/empresas/fichaje-taller (solo el OPERADOR habilita)', () => {
  const put = (body: unknown, token: string | null = 'op-secret') => habilitar(new Request('https://x/api/operador/empresas/fichaje-taller', {
    method: 'PUT', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  }))
  beforeEach(() => { process.env.RRHH_OPERADOR_SECRET = 'op-secret' })

  it('el secreto de FICHAJE del taller no sirve (401): el taller no puede habilitarse a sí mismo', async () => {
    expect((await put({ empresa_id: E, taller_id: TALLER }, 's3cret')).status).toBe(401)
    expect((await put({ empresa_id: E, taller_id: TALLER }, null)).status).toBe(401)
    expect(consulta).not.toHaveBeenCalled()
  })

  it('habilita, quita (null), 400 si faltan ids y 404 si la empresa no existe', async () => {
    consulta.mockReset(); consulta.mockResolvedValueOnce([{ id: E }])
    const ok = await put({ empresa_id: E.toUpperCase(), taller_id: TALLER })
    expect(ok.status).toBe(200)
    expect((consulta.mock.calls[0][0] as { values: unknown[] }).values).toEqual([TALLER, E])
    consulta.mockResolvedValueOnce([{ id: E }])
    expect((await put({ empresa_id: E, taller_id: null })).status).toBe(200)
    expect((await put({ empresa_id: E })).status).toBe(400)
    expect((await put({ empresa_id: 'x', taller_id: TALLER })).status).toBe(400)
    consulta.mockResolvedValueOnce([])
    expect((await put({ empresa_id: E, taller_id: TALLER })).status).toBe(404)
  })
})
