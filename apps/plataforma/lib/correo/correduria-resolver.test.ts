import test from 'node:test'
import assert from 'node:assert/strict'

import { anotarHistorialDesdeCorreo, resolverCorreoAseguradora } from './correduria-resolver.ts'

function conFetchSimulado<T>(
  respuestas: Record<string, () => { ok: boolean; status: number; json?: unknown }>,
  fn: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch
  // @ts-expect-error — stub deliberado para el test
  globalThis.fetch = async (url: string, init?: { method?: string }) => {
    const metodo = init?.method || 'GET'
    const clave = `${metodo} ${url}`
    const entrada = Object.entries(respuestas).find(([k]) => clave.includes(k))
    if (!entrada) throw new Error(`fetch no simulado: ${clave}`)
    const r = entrada[1]()
    return { ok: r.ok, status: r.status, json: async () => r.json } as Response
  }
  return fn().finally(() => {
    globalThis.fetch = original
  })
}

function conEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const originales: Record<string, string | undefined> = {}
  for (const k of Object.keys(vars)) originales[k] = process.env[k]
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(originales)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })
}

test('🚨 sin ASEGURA_OPERADOR_SECRET, resolverCorreoAseguradora devuelve undefined — NUNCA []', () => {
  // `undefined` = «no se ha podido preguntar»; `[]` = «se preguntó y no hay ninguna póliza».
  // Colapsar un fallo de configuración a `[]` haría que un correo real se leyera como «no es de nadie».
  return conEnv({ ASEGURA_OPERADOR_SECRET: undefined }, async () => {
    const r = await resolverCorreoAseguradora('cualquier texto')
    assert.equal(r, undefined)
  })
})

test('resolverCorreoAseguradora: [] cuando asegura contesta que no hay ninguna póliza', () =>
  conEnv({ ASEGURA_OPERADOR_SECRET: 'x', ASEGURA_URL: 'https://asegura.test' }, () =>
    conFetchSimulado(
      { 'POST https://asegura.test/api/operador/correo/resolver': () => ({ ok: true, status: 200, json: { estado: 'ok', resueltos: [] } }) },
      async () => {
        const r = await resolverCorreoAseguradora('texto sin póliza')
        assert.deepEqual(r, [])
      },
    ),
  ))

test('resolverCorreoAseguradora: devuelve la resolución cuando asegura la manda completa', () =>
  conEnv({ ASEGURA_OPERADOR_SECRET: 'x', ASEGURA_URL: 'https://asegura.test' }, () =>
    conFetchSimulado(
      {
        'POST https://asegura.test/api/operador/correo/resolver': () => ({
          ok: true,
          status: 200,
          json: { estado: 'ok', resueltos: [{ clienteId: 'c1', polizaId: 'p1', numeroPoliza: '04Z113777894' }] },
        }),
      },
      async () => {
        const r = await resolverCorreoAseguradora('04Z11-3777894')
        assert.deepEqual(r, [{ clienteId: 'c1', polizaId: 'p1', numeroPoliza: '04Z113777894' }])
      },
    ),
  ))

test('🚨 varias resoluciones (liquidación con varios clientes) viajan TODAS, no solo la primera', () =>
  conEnv({ ASEGURA_OPERADOR_SECRET: 'x', ASEGURA_URL: 'https://asegura.test' }, () =>
    conFetchSimulado(
      {
        'POST https://asegura.test/api/operador/correo/resolver': () => ({
          ok: true,
          status: 200,
          json: {
            estado: 'ok',
            resueltos: [
              { clienteId: 'c1', polizaId: 'p1', numeroPoliza: '111' },
              { clienteId: 'c2', polizaId: 'p2', numeroPoliza: '222' },
            ],
          },
        }),
      },
      async () => {
        const r = await resolverCorreoAseguradora('texto')
        assert.equal(r?.length, 2)
      },
    ),
  ))

test('🚨 una fila con forma rara (falta un campo) se descarta, y las buenas se conservan', () =>
  conEnv({ ASEGURA_OPERADOR_SECRET: 'x', ASEGURA_URL: 'https://asegura.test' }, () =>
    conFetchSimulado(
      {
        'POST https://asegura.test/api/operador/correo/resolver': () => ({
          ok: true,
          status: 200,
          json: { estado: 'ok', resueltos: [{ clienteId: 'c1' }, { clienteId: 'c2', polizaId: 'p2', numeroPoliza: '222' }] },
        }),
      },
      async () => {
        const r = await resolverCorreoAseguradora('texto')
        assert.deepEqual(r, [{ clienteId: 'c2', polizaId: 'p2', numeroPoliza: '222' }])
      },
    ),
  ))

test('resolverCorreoAseguradora: un 500 o una red caída dan undefined, no []', () =>
  conEnv({ ASEGURA_OPERADOR_SECRET: 'x', ASEGURA_URL: 'https://asegura.test' }, () =>
    conFetchSimulado(
      { 'POST https://asegura.test/api/operador/correo/resolver': () => ({ ok: false, status: 500 }) },
      async () => {
        const r = await resolverCorreoAseguradora('texto')
        assert.equal(r, undefined)
      },
    ),
  ))

test('anotarHistorialDesdeCorreo: manda tipo "gestion" y el actor "triaje-correo"', () =>
  conEnv({ ASEGURA_OPERADOR_SECRET: 'x', ASEGURA_URL: 'https://asegura.test' }, () => {
    let cuerpoVisto: unknown = null
    const original = globalThis.fetch
    // @ts-expect-error — stub deliberado
    globalThis.fetch = async (_url: string, init?: { body?: string }) => {
      cuerpoVisto = init?.body ? JSON.parse(init.body) : null
      return { ok: true, status: 200, json: async () => ({ estado: 'ok' }) } as Response
    }
    return anotarHistorialDesdeCorreo('c1', 'nota de prueba')
      .then((ok) => {
        assert.equal(ok, true)
        assert.deepEqual(cuerpoVisto, { clienteId: 'c1', tipo: 'gestion', texto: 'nota de prueba', actor: 'triaje-correo' })
      })
      .finally(() => {
        globalThis.fetch = original
      })
  }))

test('sin secreto, anotarHistorialDesdeCorreo devuelve false sin intentar red', () =>
  conEnv({ ASEGURA_OPERADOR_SECRET: undefined }, async () => {
    const ok = await anotarHistorialDesdeCorreo('c1', 'nota')
    assert.equal(ok, false)
  }))
