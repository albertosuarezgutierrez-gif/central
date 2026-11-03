import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { engancharRegularizacion, type CrearRegularizacion } from './regularizacion-rc-enganche.ts'

const item = { tipo: 'suplemento', subtipo: 'regularizacion_rc', numeroPoliza: 'BIDS000001', periodoDesde: '2025-06', periodoHasta: '2026-06', periodo: '2025-06_2026-06' }
const P = '11111111-1111-4111-8111-111111111111'

function espia(resp: () => Promise<{ estado: string }>) {
  const llamadas: unknown[][] = []
  const crear: CrearRegularizacion = async (...a) => { llamadas.push(a); return resp() }
  return { crear, llamadas }
}

test('crea la petición con la póliza ya resuelta y el periodo normalizado', async () => {
  const { crear, llamadas } = espia(async () => ({ estado: 'creada' }))
  const r = await engancharRegularizacion(crear, 'c1', 'Occident', item, P, 'agente-correo')
  assert.equal(r?.estado, 'creada')
  assert.equal(llamadas.length, 1)
  const [corr, e] = llamadas[0] as [string, Record<string, string>]
  assert.equal(corr, 'c1'); assert.equal(e.polizaId, P); assert.equal(e.periodoDesde, '2025-06'); assert.equal(e.periodoHasta, '2026-06')
})

test('no es regularización de Occident: no llama', async () => {
  const { crear, llamadas } = espia(async () => ({ estado: 'creada' }))
  assert.equal(await engancharRegularizacion(crear, 'c1', 'Mapfre', item, P, 'a'), null)
  assert.equal(await engancharRegularizacion(crear, 'c1', 'Occident', { ...item, subtipo: null }, P, 'a'), null)
  assert.equal(llamadas.length, 0)
})

test('idempotente: repetir devuelve ya_existe y no falla', async () => {
  const { crear } = espia(async () => ({ estado: 'ya_existe' }))
  assert.equal((await engancharRegularizacion(crear, 'c1', 'Occident', item, P, 'a'))?.estado, 'ya_existe')
  assert.equal((await engancharRegularizacion(crear, 'c1', 'Occident', item, P, 'a'))?.estado, 'ya_existe')
})

test('sin_migracion / 409 / excepción: capturado, no lanza', async () => {
  for (const estado of ['sin_migracion', 'ambigua', 'no_viva']) {
    const { crear } = espia(async () => ({ estado }))
    assert.equal((await engancharRegularizacion(crear, 'c1', 'Occident', item, P, 'a'))?.estado, estado)
  }
  const { crear } = espia(async () => { throw new Error('boom') })
  assert.equal((await engancharRegularizacion(crear, 'c1', 'Occident', item, P, 'a'))?.estado, 'error')
})

test('procesarItem engancha SOLO tras crear la tarea y dentro de try propio', () => {
  const src = readFileSync(new URL('./correo-evento-bd.ts', import.meta.url), 'utf8')
  const iTarea = src.indexOf('gestionId = await crearTareaCorreo(')
  const iEnganche = src.indexOf('engancharRegularizacion(crearRegularizacion')
  assert.ok(iTarea > 0 && iEnganche > iTarea, 'el enganche va después de crear la tarea')
  assert.ok(iEnganche - iTarea < 600, 'dentro del mismo bloque de creación de tarea')
})
