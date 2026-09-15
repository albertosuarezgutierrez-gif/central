import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspeccionarUrl, leerCobertura, urlsPropias, URL_INSPECTION_API } from './cobertura.ts'
import type { FetchLike } from './tipos.ts'

function fetchFalso(responder: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const llamadas: { url: string; init?: RequestInit }[] = []
  const fetch: FetchLike = async (url, init) => {
    llamadas.push({ url, init })
    const r = responder(url, init)
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status })
  }
  return { fetch, llamadas }
}

test('urlsPropias: rutas únicas de consultas.ts, ordenadas, como URL completa', () => {
  const urls = urlsPropias(
    [
      { pagina: '/seguros/hogar' },
      { pagina: null },
      { pagina: '/' },
      { pagina: '/seguros/hogar' }, // repetida a propósito: no debe duplicar
    ],
    'grupoasegura.es',
  )
  assert.deepEqual(urls, ['https://grupoasegura.es/', 'https://grupoasegura.es/seguros/hogar'])
})

test('inspeccionarUrl: URL, cabeceras, body y mapeo de una respuesta PASS', async () => {
  const { fetch, llamadas } = fetchFalso(() => ({
    status: 200,
    body: {
      inspectionResult: {
        indexStatusResult: {
          verdict: 'PASS',
          coverageState: 'Submitted and indexed',
          robotsTxtState: 'ALLOWED',
          indexingState: 'INDEXING_ALLOWED',
          pageFetchState: 'SUCCESSFUL',
          lastCrawlTime: '2026-09-10T08:00:00Z',
          googleCanonical: 'https://grupoasegura.es/',
          userCanonical: 'https://grupoasegura.es/',
        },
      },
    },
  }))

  const fila = await inspeccionarUrl('tok', 'sc-domain:grupoasegura.es', 'https://grupoasegura.es/', fetch)

  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].url, URL_INSPECTION_API)
  assert.equal(llamadas[0].init?.method, 'POST')
  const headers = llamadas[0].init?.headers as Record<string, string>
  assert.equal(headers.Authorization, 'Bearer tok')
  assert.deepEqual(JSON.parse(String(llamadas[0].init?.body)), {
    inspectionUrl: 'https://grupoasegura.es/',
    siteUrl: 'sc-domain:grupoasegura.es',
  })

  assert.deepEqual(fila, {
    url: 'https://grupoasegura.es/',
    estado: 'ok',
    verdicto: 'PASS',
    cobertura: 'Submitted and indexed',
    indexacion: 'INDEXING_ALLOWED',
    robotsTxt: 'ALLOWED',
    rastreoPagina: 'SUCCESSFUL',
    ultimoRastreo: '2026-09-10T08:00:00Z',
    canonicalGoogle: 'https://grupoasegura.es/',
    canonicalUsuario: 'https://grupoasegura.es/',
  })
})

test('inspeccionarUrl: FAIL (404/no indexada) se refleja tal cual, no se disfraza de PASS', async () => {
  const { fetch } = fetchFalso(() => ({
    status: 200,
    body: { inspectionResult: { indexStatusResult: { verdict: 'FAIL', coverageState: 'Not found (404)' } } },
  }))
  const fila = await inspeccionarUrl('tok', 'sc-domain:grupoasegura.es', 'https://grupoasegura.es/roto', fetch)
  assert.equal(fila.estado, 'ok')
  assert.equal(fila.verdicto, 'FAIL')
  assert.equal(fila.cobertura, 'Not found (404)')
})

test('inspeccionarUrl: un verdict que no reconocemos cae a DESCONOCIDO, no a PASS', async () => {
  const { fetch } = fetchFalso(() => ({
    status: 200,
    body: { inspectionResult: { indexStatusResult: { verdict: 'ALGO_NUEVO_DE_GOOGLE' } } },
  }))
  const fila = await inspeccionarUrl('tok', 'sc-domain:grupoasegura.es', 'https://grupoasegura.es/', fetch)
  assert.equal(fila.verdicto, 'DESCONOCIDO')
})

test('inspeccionarUrl: !ok se declara en la fila (estado:error), no lanza', async () => {
  const { fetch } = fetchFalso(() => ({ status: 403, body: { error: { message: 'insufficient permission' } } }))
  const fila = await inspeccionarUrl('tok', 'sc-domain:grupoasegura.es', 'https://grupoasegura.es/', fetch)
  assert.equal(fila.estado, 'error')
  assert.match(fila.detalle ?? '', /403.*insufficient permission/)
})

test('inspeccionarUrl: respuesta sin indexStatusResult se declara error, nunca datos vacíos con forma de ok', async () => {
  const { fetch } = fetchFalso(() => ({ status: 200, body: {} }))
  const fila = await inspeccionarUrl('tok', 'sc-domain:grupoasegura.es', 'https://grupoasegura.es/', fetch)
  assert.equal(fila.estado, 'error')
})

test('inspeccionarUrl: un fetch que lanza (red caída) se captura y declara, no revienta el lote', async () => {
  const fetch: FetchLike = async () => {
    throw new Error('network down')
  }
  const fila = await inspeccionarUrl('tok', 'sc-domain:grupoasegura.es', 'https://grupoasegura.es/', fetch)
  assert.equal(fila.estado, 'error')
  assert.match(fila.detalle ?? '', /network down/)
})

test('leerCobertura: una URL en error no impide leer las demás', async () => {
  const { fetch } = fetchFalso((_url, init) => {
    const b = JSON.parse(String(init?.body))
    if (b.inspectionUrl.endsWith('/roto')) return { status: 500, body: 'backend error' }
    return { status: 200, body: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } } }
  })
  const datos = await leerCobertura(
    { token: 'tok', propiedad: 'sc-domain:grupoasegura.es', urls: ['https://grupoasegura.es/', 'https://grupoasegura.es/roto'] },
    fetch,
  )
  assert.equal(datos.paginas.length, 2)
  assert.equal(datos.paginas[0].estado, 'ok')
  assert.equal(datos.paginas[1].estado, 'error')
})

test('leerCobertura: sin presupuesto de tiempo, las URLs restantes se declaran (no se omiten)', async () => {
  let llamadas = 0
  const fetch: FetchLike = async () => {
    llamadas++
    return new Response(JSON.stringify({ inspectionResult: { indexStatusResult: { verdict: 'PASS' } } }), { status: 200 })
  }
  const datos = await leerCobertura(
    { token: 'tok', propiedad: 'sc-domain:grupoasegura.es', urls: ['https://a/', 'https://b/', 'https://c/'], presupuestoMs: -1 },
    fetch,
  )
  assert.equal(llamadas, 0, 'presupuesto ya agotado antes de la 1ª: no llama a la red')
  assert.equal(datos.paginas.length, 3, 'las 3 URLs constan, ninguna desaparece en silencio')
  for (const p of datos.paginas) {
    assert.equal(p.estado, 'error')
    assert.match(p.detalle ?? '', /sin tiempo/)
  }
})
