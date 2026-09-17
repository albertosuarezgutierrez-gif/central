import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consultarGsc, leerGsc, totalizar, ventanas, GSC_API_BASE } from './gsc.ts'
import type { FetchLike, FilaGsc } from './tipos.ts'

const VENTANA = { desde: '2026-08-30', hasta: '2026-09-05' }

const RESPUESTA_EJEMPLO = {
  rows: [
    { keys: ['seguro de hogar sevilla'], clicks: 12, impressions: 300, ctr: 0.04, position: 8.2 },
    { keys: ['correduria seguros sevilla'], clicks: 3, impressions: 50, ctr: 0.06, position: 14.9 },
  ],
  responseAggregationType: 'byProperty',
}

function fetchFalso(responder: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const llamadas: { url: string; init?: RequestInit }[] = []
  const fetch: FetchLike = async (url, init) => {
    llamadas.push({ url, init })
    const r = responder(url, init)
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status })
  }
  return { fetch, llamadas }
}

test('ventanas: 7 días cerrados 3 días antes de hoy, y los 7 justo anteriores (UTC)', () => {
  const v = ventanas(new Date('2026-09-08T08:30:00Z'))
  assert.deepEqual(v.actual, { desde: '2026-08-30', hasta: '2026-09-05' })
  assert.deepEqual(v.anterior, { desde: '2026-08-23', hasta: '2026-08-29' })
})

test('ventanas: no se mueve con la hora del día ni al cruzar medianoche UTC tarde', () => {
  assert.deepEqual(ventanas(new Date('2026-09-08T00:00:00Z')), ventanas(new Date('2026-09-08T23:59:59Z')))
  // Cambio de mes y de año en el cálculo.
  assert.deepEqual(ventanas(new Date('2027-01-02T12:00:00Z')).actual, { desde: '2026-12-24', hasta: '2026-12-30' })
})

test('totalizar([]) → posicion null (no 0) y ctr 0', () => {
  const t = totalizar([])
  assert.deepEqual(t, { clics: 0, impresiones: 0, ctr: 0, posicion: null })
  assert.strictEqual(t.posicion, null, 'sin impresiones no hay posición media: null, nunca 0')
})

test('totalizar: filas con 0 impresiones tampoco inventan posición', () => {
  const t = totalizar([{ clave: 'x', clics: 0, impresiones: 0, ctr: 0, posicion: 3 }])
  assert.strictEqual(t.posicion, null)
})

test('totalizar pondera la posición por impresiones y recalcula el ctr', () => {
  const filas: FilaGsc[] = [
    { clave: 'a', clics: 10, impresiones: 100, ctr: 0.1, posicion: 2 },
    { clave: 'b', clics: 5, impresiones: 300, ctr: 0.0167, posicion: 10 },
  ]
  const t = totalizar(filas)
  assert.equal(t.clics, 15)
  assert.equal(t.impresiones, 400)
  assert.equal(t.ctr, 15 / 400)
  // (2·100 + 10·300) / 400 = 8 — no la media simple (6).
  assert.equal(t.posicion, 8)
})

test('consultarGsc: URL, cabeceras, body y mapeo de un JSON de ejemplo', async () => {
  const { fetch, llamadas } = fetchFalso(() => ({ status: 200, body: RESPUESTA_EJEMPLO }))
  const filas = await consultarGsc('tok', 'sc-domain:grupoasegura.es', VENTANA, 'query', fetch)

  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].url, `${GSC_API_BASE}/sc-domain%3Agrupoasegura.es/searchAnalytics/query`)
  assert.equal(llamadas[0].init?.method, 'POST')
  const headers = llamadas[0].init?.headers as Record<string, string>
  assert.equal(headers.Authorization, 'Bearer tok')
  assert.deepEqual(JSON.parse(String(llamadas[0].init?.body)), {
    startDate: '2026-08-30',
    endDate: '2026-09-05',
    dimensions: ['query'],
    rowLimit: 250,
  })

  assert.deepEqual(filas, [
    { clave: 'seguro de hogar sevilla', clics: 12, impresiones: 300, ctr: 0.04, posicion: 8.2 },
    { clave: 'correduria seguros sevilla', clics: 3, impresiones: 50, ctr: 0.06, posicion: 14.9 },
  ])
})

test('consultarGsc: sin rows devuelve [] y manda la dimensión pedida', async () => {
  const { fetch, llamadas } = fetchFalso(() => ({ status: 200, body: { responseAggregationType: 'byProperty' } }))
  const filas = await consultarGsc('tok', 'sc-domain:grupoasegura.es', VENTANA, 'page', fetch)
  assert.deepEqual(filas, [])
  assert.deepEqual(JSON.parse(String(llamadas[0].init?.body)).dimensions, ['page'])
})

test('consultarGsc: !ok lanza con status y cuerpo recortado', async () => {
  const { fetch } = fetchFalso(() => ({ status: 403, body: { error: { message: 'User does not have sufficient permission' } } }))
  await assert.rejects(
    () => consultarGsc('tok', 'sc-domain:grupoasegura.es', VENTANA, 'query', fetch),
    /^Error: gsc query 403: .*sufficient permission/,
  )
})

test('leerGsc: consultas + páginas de la actual, total de la anterior', async () => {
  const { fetch, llamadas } = fetchFalso((_url, init) => {
    const b = JSON.parse(String(init?.body))
    if (b.startDate === '2026-08-23') {
      return { status: 200, body: { rows: [{ keys: ['q'], clicks: 1, impressions: 10, ctr: 0.1, position: 20 }] } }
    }
    if (b.dimensions[0] === 'page') {
      return { status: 200, body: { rows: [{ keys: ['https://grupoasegura.es/'], clicks: 15, impressions: 350, ctr: 0.043, position: 9 }] } }
    }
    return { status: 200, body: RESPUESTA_EJEMPLO }
  })

  const datos = await leerGsc({ token: 'tok', propiedad: 'sc-domain:grupoasegura.es', hoy: new Date('2026-09-08T08:30:00Z') }, fetch)

  assert.equal(llamadas.length, 3)
  assert.deepEqual(datos.actual.ventana, { desde: '2026-08-30', hasta: '2026-09-05' })
  assert.equal(datos.actual.consultas.length, 2)
  assert.equal(datos.actual.paginas.length, 1)
  assert.equal(datos.actual.paginas[0].clave, 'https://grupoasegura.es/')
  assert.deepEqual(datos.actual.total, { clics: 15, impresiones: 350, ctr: 15 / 350, posicion: (8.2 * 300 + 14.9 * 50) / 350 })
  assert.ok(datos.anterior)
  assert.deepEqual(datos.anterior.ventana, { desde: '2026-08-23', hasta: '2026-08-29' })
  assert.deepEqual(datos.anterior.total, { clics: 1, impresiones: 10, ctr: 0.1, posicion: 20 })
})

test('leerGsc: si la semana anterior falla, anterior es null y la actual se conserva', async () => {
  const { fetch } = fetchFalso((_url, init) => {
    const b = JSON.parse(String(init?.body))
    if (b.startDate === '2026-08-23') return { status: 500, body: 'backend error' }
    return { status: 200, body: RESPUESTA_EJEMPLO }
  })
  const datos = await leerGsc({ token: 'tok', propiedad: 'sc-domain:grupoasegura.es', hoy: new Date('2026-09-08T08:30:00Z') }, fetch)
  assert.strictEqual(datos.anterior, null)
  assert.equal(datos.actual.consultas.length, 2)
})

test('leerGsc: si la semana ACTUAL falla, se propaga (no se disfraza de cero)', async () => {
  const { fetch } = fetchFalso(() => ({ status: 401, body: 'invalid token' }))
  await assert.rejects(
    () => leerGsc({ token: 'tok', propiedad: 'sc-domain:grupoasegura.es', hoy: new Date('2026-09-08T08:30:00Z') }, fetch),
    /gsc query 401/,
  )
})
