import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hogql, leerPosthog } from './posthog.ts'
import type { FetchLike } from './tipos.ts'

const cfg = { apiKey: 'phx_test', projectId: '266897', host: 'https://eu.posthog.com' }

function respuesta(status: number, body: unknown): Response {
  const texto = typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(texto, { status, headers: { 'Content-Type': 'application/json' } })
}

test('hogql: POST a /api/projects/<id>/query con Bearer y body HogQLQuery; devuelve results', async () => {
  const llamadas: { url: string; init?: RequestInit }[] = []
  const fetch: FetchLike = async (url, init) => { llamadas.push({ url, init }); return respuesta(200, { results: [[1, 2]], columns: ['a', 'b'] }) }
  const filas = await hogql(cfg, 'SELECT 1', fetch)
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].url, 'https://eu.posthog.com/api/projects/266897/query')
  assert.equal(llamadas[0].init?.method, 'POST')
  assert.equal((llamadas[0].init?.headers as Record<string, string>).Authorization, 'Bearer phx_test')
  assert.deepEqual(JSON.parse(String(llamadas[0].init?.body)), { query: { kind: 'HogQLQuery', query: 'SELECT 1' } })
  assert.deepEqual(filas, [[1, 2]])
})

test('hogql: host con barra final no duplica la barra', async () => {
  let url = ''
  const fetch: FetchLike = async u => { url = u; return respuesta(200, { results: [] }) }
  await hogql({ ...cfg, host: 'https://eu.posthog.com/' }, 'SELECT 1', fetch)
  assert.equal(url, 'https://eu.posthog.com/api/projects/266897/query')
})

test('hogql: !ok → error con status y cuerpo recortado', async () => {
  const fetch: FetchLike = async () => respuesta(401, { type: 'authentication_error', detail: 'Invalid personal API key' })
  await assert.rejects(() => hogql(cfg, 'SELECT 1', fetch), (e: Error) => /PostHog 401/.test(e.message) && /Invalid personal API key/.test(e.message))
})

test('leerPosthog: tres consultas en orden, mapea totales/rutas/orígenes y descarta null', async () => {
  const queries: string[] = []
  const fetch: FetchLike = async (_url, init) => {
    const q = JSON.parse(String(init?.body)).query.query as string
    queries.push(q)
    if (queries.length === 1) return respuesta(200, { results: [[1234, 321]] })
    if (queries.length === 2) return respuesta(200, { results: [['/', 500], ['/seguros/hogar', 120], [null, 7], ['/quienes-somos', 30]] })
    return respuesta(200, { results: [['google.com', 200], [null, 9], ['bing.com', 12]] })
  }
  const datos = await leerPosthog(cfg, fetch)
  assert.equal(queries.length, 3)
  assert.match(queries[0], /^SELECT count\(\), count\(DISTINCT person_id\) FROM events WHERE event = '\$pageview' AND timestamp > now\(\) - INTERVAL 7 DAY$/)
  assert.match(queries[1], /SELECT properties\.\$pathname, count\(\) FROM events .*INTERVAL 7 DAY GROUP BY 1 ORDER BY 2 DESC LIMIT 5$/)
  assert.match(queries[2], /SELECT properties\.\$referring_domain, count\(DISTINCT \$session_id\) FROM events .*IS NOT NULL AND properties\.\$referring_domain != '\$direct' GROUP BY 1 ORDER BY 2 DESC LIMIT 5$/)
  assert.deepEqual(datos, {
    dias: 7,
    paginasVistas: 1234,
    visitantes: 321,
    topPaginas: [{ ruta: '/', vistas: 500 }, { ruta: '/seguros/hogar', vistas: 120 }, { ruta: '/quienes-somos', vistas: 30 }],
    origenes: [{ dominio: 'google.com', sesiones: 200 }, { dominio: 'bing.com', sesiones: 12 }],
  })
})

test('leerPosthog: `dias` se propaga a las tres consultas', async () => {
  const queries: string[] = []
  const fetch: FetchLike = async (_url, init) => { queries.push(JSON.parse(String(init?.body)).query.query); return respuesta(200, { results: [] }) }
  const datos = await leerPosthog(cfg, fetch, 30)
  assert.equal(datos.dias, 30)
  assert.ok(queries.every(q => q.includes('INTERVAL 30 DAY')))
  assert.deepEqual([datos.paginasVistas, datos.visitantes, datos.topPaginas, datos.origenes], [0, 0, [], []])
})
