import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consultarSerp, dominioDe, leerSerp, posicionPropia } from './serp.ts'
import type { FetchLike, ResultadoSerp } from './tipos.ts'

const r = (posicion: number, url: string): ResultadoSerp => ({ posicion, dominio: dominioDe(url), url, titulo: `t${posicion}` })

function respuesta(status: number, body: unknown): Response {
  const texto = typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(texto, { status, headers: { 'Content-Type': 'application/json' } })
}

test('dominioDe: hostname sin www., en minúsculas', () => {
  assert.equal(dominioDe('https://www.grupoasegura.es/seguros/hogar'), 'grupoasegura.es')
  assert.equal(dominioDe('https://GrupoAsegura.es/'), 'grupoasegura.es')
  assert.equal(dominioDe('https://clientes.grupoasegura.es/x'), 'clientes.grupoasegura.es')
})

test('posicionPropia: null cuando el dominio no está (NO es 0)', () => {
  const top = [r(1, 'https://www.mapfre.es/'), r(2, 'https://www.rastreator.com/seguros')]
  assert.strictEqual(posicionPropia(top, 'grupoasegura.es'), null)
  assert.strictEqual(posicionPropia([], 'grupoasegura.es'), null)
})

test('posicionPropia: acierta con www. y con subdominio propio', () => {
  const top = [r(1, 'https://www.mapfre.es/'), r(2, 'https://www.grupoasegura.es/seguros/hogar'), r(3, 'https://grupoasegura.es/')]
  assert.equal(posicionPropia(top, 'grupoasegura.es'), 2)
  const sub = [r(1, 'https://www.mapfre.es/'), r(4, 'https://clientes.grupoasegura.es/')]
  assert.equal(posicionPropia(sub, 'grupoasegura.es'), 4)
})

test('posicionPropia: NO confunde grupoasegura.es.otro.com ni un sufijo sin punto', () => {
  const top = [r(1, 'https://grupoasegura.es.otro.com/'), r(2, 'https://xgrupoasegura.es/')]
  assert.strictEqual(posicionPropia(top, 'grupoasegura.es'), null)
})

test('consultarSerp: manda X-API-KEY + body es/es/10, mapea organic y recorta a 10', async () => {
  const llamadas: { url: string; init?: RequestInit }[] = []
  const organic = Array.from({ length: 12 }, (_, i) => ({ position: i + 1, link: `https://www.sitio${i + 1}.com/p`, title: `Título ${i + 1}` }))
  const fetch: FetchLike = async (url, init) => { llamadas.push({ url, init }); return respuesta(200, { organic }) }
  const top = await consultarSerp('clave', 'seguro de hogar', fetch)
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].url, 'https://google.serper.dev/search')
  assert.equal(llamadas[0].init?.method, 'POST')
  assert.equal((llamadas[0].init?.headers as Record<string, string>)['X-API-KEY'], 'clave')
  assert.deepEqual(JSON.parse(String(llamadas[0].init?.body)), { q: 'seguro de hogar', gl: 'es', hl: 'es', num: 10 })
  assert.equal(top.length, 10)
  assert.deepEqual(top[0], { posicion: 1, dominio: 'sitio1.com', url: 'https://www.sitio1.com/p', titulo: 'Título 1' })
  assert.equal(top[9].posicion, 10)
})

test('consultarSerp: !ok → error con status y cuerpo (ahí dice lo de los créditos)', async () => {
  const fetch: FetchLike = async () => respuesta(400, { message: 'Not enough credits' })
  await assert.rejects(() => consultarSerp('clave', 'x', fetch), (e: Error) => /Serper 400/.test(e.message) && /Not enough credits/.test(e.message))
})

test('leerSerp: llama en orden y en serie, calcula propia por consulta', async () => {
  const orden: string[] = []
  let enVuelo = 0, maxEnVuelo = 0
  const fetch: FetchLike = async (_url, init) => {
    enVuelo++; maxEnVuelo = Math.max(maxEnVuelo, enVuelo)
    const q = JSON.parse(String(init?.body)).q as string
    orden.push(q)
    await new Promise(res => setTimeout(res, 5))
    enVuelo--
    const organic = q === 'b'
      ? [{ position: 1, link: 'https://www.mapfre.es/', title: 'M' }, { position: 2, link: 'https://www.grupoasegura.es/seguros/hogar', title: 'G' }]
      : [{ position: 1, link: 'https://www.mapfre.es/', title: 'M' }]
    return respuesta(200, { organic })
  }
  const datos = await leerSerp({ apiKey: 'k', dominio: 'grupoasegura.es', consultas: [{ consulta: 'a', pagina: null }, { consulta: 'b', pagina: '/seguros/hogar' }, { consulta: 'c', pagina: '/' }] }, fetch)
  assert.deepEqual(orden, ['a', 'b', 'c'])
  assert.equal(maxEnVuelo, 1, 'las consultas tienen que ir en serie, no en ráfaga')
  assert.equal(datos.dominio, 'grupoasegura.es')
  assert.deepEqual(datos.consultas.map(c => [c.consulta, c.pagina, c.propia, c.top.length]), [['a', null, null, 1], ['b', '/seguros/hogar', 2, 2], ['c', '/', null, 1]])
})

test('leerSerp: si una consulta falla se propaga y no se devuelve un top-10 a medias', async () => {
  let n = 0
  const fetch: FetchLike = async () => (++n === 2 ? respuesta(429, 'rate limited') : respuesta(200, { organic: [] }))
  await assert.rejects(
    () => leerSerp({ apiKey: 'k', dominio: 'grupoasegura.es', consultas: [{ consulta: 'a', pagina: null }, { consulta: 'b', pagina: null }, { consulta: 'c', pagina: null }] }, fetch),
    /Serper 429/,
  )
  assert.equal(n, 2, 'tras el fallo no se sigue llamando')
})
