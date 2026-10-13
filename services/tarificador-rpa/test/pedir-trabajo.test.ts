// pedirTrabajo reintenta ante red/5xx (no ante 401/403/404/503) y la salida sin trabajo distingue infra de "nada que hacer".
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { pedirTrabajo, salidaSinTrabajo, type Config, type CuerpoResultado } from '../src/api.ts'

const cfg: Config = { jobId: '11111111-1111-1111-1111-111111111111', apiUrl: 'https://asegura.test', secreto: 's'.repeat(20) }
const fetchOriginal = globalThis.fetch
afterEach(() => { globalThis.fetch = fetchOriginal })

const trabajo = { id: cfg.jobId, compania: 'x', ramo: 'auto', riesgo: {} }
function simular(pasos: Array<number | Error>) {
  let llamadas = 0
  globalThis.fetch = (async () => {
    const p = pasos[Math.min(llamadas++, pasos.length - 1)]
    if (p instanceof Error) throw p
    return new Response(p === 200 ? JSON.stringify({ trabajo }) : '{}', { status: p })
  }) as typeof fetch
  return () => llamadas
}
const esperas: number[] = []
const esperar = async (ms: number) => { esperas.push(ms) }

test('reintenta ante excepción de red y acaba bien (esperas 2/4 s)', async () => {
  esperas.length = 0
  const n = simular([new Error('fetch failed'), new Error('fetch failed'), 200])
  const r = await pedirTrabajo(cfg, esperar)
  assert.equal(r.estado, 'ok')
  assert.equal(n(), 3)
  assert.deepEqual(esperas, [2_000, 4_000])
})

test('reintenta ante 5xx', async () => {
  esperas.length = 0
  const n = simular([502, 500, 200])
  assert.equal((await pedirTrabajo(cfg, esperar)).estado, 'ok')
  assert.equal(n(), 3)
})

test('4 intentos en total y relanza la última excepción', async () => {
  esperas.length = 0
  const n = simular([new Error('fetch failed')])
  await assert.rejects(pedirTrabajo(cfg, esperar), /fetch failed/)
  assert.equal(n(), 4)
  assert.deepEqual(esperas, [2_000, 4_000, 8_000])
})

test('5xx persistente: 4 intentos y devuelve el status', async () => {
  const n = simular([500])
  assert.deepEqual(await pedirTrabajo(cfg, esperar), { estado: 'no_disponible', status: 500 })
  assert.equal(n(), 4)
})

for (const status of [401, 403, 404, 503]) {
  test(`${status} NO se reintenta`, async () => {
    const n = simular([status])
    assert.deepEqual(await pedirTrabajo(cfg, esperar), { estado: 'no_disponible', status })
    assert.equal(n(), 1)
  })
}

function captura() {
  const lineas: Array<{ m: string; d?: Record<string, unknown> }> = []
  const enviados: CuerpoResultado[] = []
  return {
    lineas,
    enviados,
    log: (m: string, d?: Record<string, unknown>) => { lineas.push({ m, d }) },
    redactar: (t: string) => t.replaceAll(cfg.secreto, '***'),
    enviar: async (_c: Config, cuerpo: CuerpoResultado) => { enviados.push(cuerpo); return 200 },
  }
}

test('status 0: log con motivo y código, aviso infra y salida 1', async () => {
  const x = captura()
  const e = Object.assign(new Error(`fetch failed ${cfg.secreto}`), { cause: { code: 'ECONNRESET' } })
  const cod = await salidaSinTrabajo(cfg, { status: 0, e }, x.log, x.redactar, x.enviar)
  assert.equal(cod, 1)
  assert.equal(x.lineas[0].m, 'trabajo_no_disponible')
  assert.equal(x.lineas[0].d?.status, 0)
  assert.equal(x.lineas[0].d?.codigo, 'ECONNRESET')
  assert.match(String(x.lineas[0].d?.motivo), /fetch failed \*\*\*/)
  assert.equal(x.enviados.length, 1)
  assert.equal(x.enviados[0].resultado === 'error' && x.enviados[0].error.tipo, 'infra')
})

test('status 0 y el aviso también falla: sigue siendo salida 1', async () => {
  const x = captura()
  const cod = await salidaSinTrabajo(cfg, { status: 0, e: new Error('x') }, x.log, x.redactar, async () => { throw new Error('caído') })
  assert.equal(cod, 1)
})

for (const status of [404, 503]) {
  test(`${status}: salida 0 y sin aviso`, async () => {
    const x = captura()
    assert.equal(await salidaSinTrabajo(cfg, { status }, x.log, x.redactar, x.enviar), 0)
    assert.equal(x.enviados.length, 0)
  })
}
