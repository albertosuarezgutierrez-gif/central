import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  consultarLibre,
  esParcial,
  LIMITE_DEFECTO,
  LIMITE_MAXIMO,
  listarSitios,
  parsearConsulta,
  ultimoDiaFiable,
  type Consulta,
} from './gsc-consulta.ts'
import { PROPIEDAD_GSC, type FetchLike } from './tipos.ts'

const HOY = new Date('2026-09-20T08:30:00Z')

function fetchFalso(responder: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const llamadas: { url: string; init?: RequestInit }[] = []
  const fetch: FetchLike = async (url, init) => {
    llamadas.push({ url, init })
    const r = responder(url, init)
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status })
  }
  return { fetch, llamadas }
}

function ok(body: unknown): Consulta {
  const p = parsearConsulta(body, HOY)
  assert.equal(p.ok, true, p.ok ? '' : `esperaba ok, dio: ${p.error}`)
  return (p as { ok: true; consulta: Consulta }).consulta
}

function error(body: unknown): string {
  const p = parsearConsulta(body, HOY)
  assert.equal(p.ok, false, 'esperaba que lo rechazara')
  return (p as { ok: false; error: string }).error
}

test('ultimoDiaFiable: hoy − 3 días (UTC), sin moverse con la hora', () => {
  assert.equal(ultimoDiaFiable(HOY), '2026-09-17')
  assert.equal(ultimoDiaFiable(new Date('2026-09-20T23:59:59Z')), '2026-09-17')
  // Cruce de mes hacia atrás.
  assert.equal(ultimoDiaFiable(new Date('2026-03-01T12:00:00Z')), '2026-02-26')
})

test('por defecto: 28 días cerrados en el último día fiable, dimensión query, propiedad de la correduría', () => {
  const c = ok({})
  assert.deepEqual(c, {
    propiedad: PROPIEDAD_GSC,
    desde: '2026-08-21',
    hasta: '2026-09-17',
    dimensiones: ['query'],
    limite: LIMITE_DEFECTO,
  })
})

test('la ventana por defecto NO toca los días sin consolidar', () => {
  assert.equal(esParcial(ok({}), HOY), false)
})

test('una ventana que llega a hoy sale marcada parcial (el total sería un suelo, no el dato)', () => {
  assert.equal(esParcial(ok({ desde: '2026-09-01', hasta: '2026-09-20' }), HOY), true)
  assert.equal(esParcial(ok({ desde: '2026-09-01', hasta: '2026-09-18' }), HOY), true)
  assert.equal(esParcial(ok({ desde: '2026-09-01', hasta: '2026-09-17' }), HOY), false)
})

test('`desde` por defecto se calcula desde el `hasta` PEDIDO, no desde hoy', () => {
  const c = ok({ hasta: '2026-01-31' })
  assert.equal(c.desde, '2026-01-04')
  assert.equal(c.hasta, '2026-01-31')
})

test('rechaza fechas con formato malo, inexistentes o del revés', () => {
  assert.match(error({ desde: '20-09-2026' }), /desde/)
  assert.match(error({ hasta: 'ayer' }), /hasta/)
  // 2026-02-31 no existe: `new Date` la acepta y la desplaza al 3 de marzo en silencio.
  assert.match(error({ desde: '2026-02-31' }), /desde/)
  assert.match(error({ desde: '2026-09-10', hasta: '2026-09-01' }), /posterior/)
})

test('dimensiones: acepta las válidas, rechaza inventadas, repetidas y searchAppearance combinada', () => {
  assert.deepEqual(ok({ dimensiones: ['page', 'device'] }).dimensiones, ['page', 'device'])
  assert.deepEqual(ok({ dimensiones: [] }).dimensiones, [])
  assert.match(error({ dimensiones: ['consulta'] }), /no soportada/)
  assert.match(error({ dimensiones: ['query', 'query'] }), /repetida/)
  assert.match(error({ dimensiones: ['searchAppearance', 'query'] }), /no se puede combinar/)
  assert.match(error({ dimensiones: 'query' }), /lista/)
})

test('limite: entero dentro del tope de la API; nada de recortar en silencio', () => {
  assert.equal(ok({ limite: 5 }).limite, 5)
  assert.equal(ok({ limite: LIMITE_MAXIMO }).limite, LIMITE_MAXIMO)
  assert.match(error({ limite: 0 }), /limite/)
  assert.match(error({ limite: LIMITE_MAXIMO + 1 }), /limite/)
  assert.match(error({ limite: 12.5 }), /limite/)
  assert.match(error({ limite: '10' }), /limite/)
})

test('un cuerpo que no es objeto se RECHAZA; ausente sí es «dame el defecto»', () => {
  assert.match(error(['query']), /objeto JSON/)
  assert.match(error('query'), /objeto JSON/)
  assert.match(error(42), /objeto JSON/)
  // Ausente = defecto explícito (el endpoint manda `null` cuando el cuerpo viene vacío).
  assert.equal(ok(null).hasta, '2026-09-17')
  assert.equal(ok(undefined).dimensiones.length, 1)
})

test('consultarLibre: manda el rango, las dimensiones y el límite pedidos a la propiedad escapada', async () => {
  const { fetch, llamadas } = fetchFalso(() => ({ status: 200, body: { rows: [] } }))
  await consultarLibre('tok', ok({ propiedad: 'sc-domain:housesevillana.es', dimensiones: ['query', 'device'], limite: 7 }), fetch)

  assert.equal(llamadas.length, 1)
  assert.equal(
    llamadas[0].url,
    'https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Ahousesevillana.es/searchAnalytics/query',
  )
  assert.equal((llamadas[0].init?.headers as Record<string, string>).Authorization, 'Bearer tok')
  assert.deepEqual(JSON.parse(String(llamadas[0].init?.body)), {
    startDate: '2026-08-21',
    endDate: '2026-09-17',
    dimensions: ['query', 'device'],
    rowLimit: 7,
  })
})

test('consultarLibre: una clave por dimensión, en orden; sin `rows` → lista vacía', async () => {
  const { fetch } = fetchFalso(() => ({
    status: 200,
    body: {
      rows: [
        { keys: ['seguro de hogar sevilla', 'MOBILE'], clicks: 12, impressions: 300, ctr: 0.04, position: 8.2 },
        { keys: ['correduria sevilla', 'DESKTOP'], clicks: 3, impressions: 50, ctr: 0.06, position: 14.9 },
      ],
    },
  }))
  const filas = await consultarLibre('tok', ok({ dimensiones: ['query', 'device'] }), fetch)
  assert.deepEqual(filas[0], { claves: ['seguro de hogar sevilla', 'MOBILE'], clics: 12, impresiones: 300, ctr: 0.04, posicion: 8.2 })
  assert.deepEqual(filas[1].claves, ['correduria sevilla', 'DESKTOP'])

  const vacio = fetchFalso(() => ({ status: 200, body: { responseAggregationType: 'byProperty' } }))
  assert.deepEqual(await consultarLibre('tok', ok({}), vacio.fetch), [])
})

test('consultarLibre: un fallo de Google SALE como excepción, no como «sin datos»', async () => {
  const { fetch } = fetchFalso(() => ({ status: 403, body: { error: { message: 'User does not have sufficient permission' } } }))
  await assert.rejects(() => consultarLibre('tok', ok({}), fetch), /gsc consulta 403/)
})

test('listarSitios: propiedad + permiso de cada entrada; sin `siteEntry` → lista vacía', async () => {
  const { fetch, llamadas } = fetchFalso(() => ({
    status: 200,
    body: {
      siteEntry: [
        { siteUrl: 'sc-domain:grupoasegura.es', permissionLevel: 'siteFullUser' },
        { siteUrl: 'https://housesevillana.es/', permissionLevel: 'siteRestrictedUser' },
      ],
    },
  }))
  const sitios = await listarSitios('tok', fetch)
  assert.equal(llamadas[0].url, 'https://searchconsole.googleapis.com/webmasters/v3/sites')
  assert.deepEqual(sitios, [
    { propiedad: 'sc-domain:grupoasegura.es', permiso: 'siteFullUser' },
    { propiedad: 'https://housesevillana.es/', permiso: 'siteRestrictedUser' },
  ])

  const vacio = fetchFalso(() => ({ status: 200, body: {} }))
  assert.deepEqual(await listarSitios('tok', vacio.fetch), [])
})

test('listarSitios: un 401 no se lee como «la cuenta no llega a ninguna propiedad»', async () => {
  const { fetch } = fetchFalso(() => ({ status: 401, body: 'Invalid Credentials' }))
  await assert.rejects(() => listarSitios('tok', fetch), /gsc sitios 401/)
})
