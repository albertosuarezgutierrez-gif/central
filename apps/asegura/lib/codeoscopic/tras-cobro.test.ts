import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerTrasCobro, leerTrasCobroRecuperando, projectIdDeCrudo, MENSAJE_COBRADA_ILEGIBLE } from './tras-cobro.ts'

test('200 sin projectId: no lanza y dice «cobrada, reintenta sin pagar»', () => {
  const r = leerTrasCobro({ mainQuotes: [] })
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.mensaje.startsWith(MENSAJE_COBRADA_ILEGIBLE))
  assert.match(MENSAJE_COBRADA_ILEGIBLE, /COBRADA/)
  assert.match(MENSAJE_COBRADA_ILEGIBLE, /SIN pagar/)
})

test('respuesta válida se interpreta', () => {
  const res = leerTrasCobro({ id: 123, mainQuotes: [] })
  assert.ok(res.ok && res.cotizacion.projectId === '123')
})

test('cobro con respuesta ilegible pero con projectId: se recupera con GET gratis, sin segundo POST', async () => {
  const leer = (raw: unknown) => {
    const o = raw as { id?: number; ok?: boolean }
    if (!o.ok) throw new Error('forma desconocida')
    return { projectId: String(o.id) } as never
  }
  const gets: string[] = []
  const r = await leerTrasCobroRecuperando({ id: 777 }, async (id) => (gets.push(id), { id: 777, ok: true }), leer)
  assert.ok(r.ok && r.recuperada)
  assert.deepEqual(r.ok && r.crudo, { id: 777, ok: true })
  assert.deepEqual(gets, ['777'])
})

test('recuperación: sin projectId, sin recuperador, GET que falla o ilegible = el mensaje de siempre', async () => {
  const leer = () => {
    throw new Error('x')
  }
  const casos = [
    await leerTrasCobroRecuperando({}, async () => ({}), leer),
    await leerTrasCobroRecuperando({ id: 5 }, null, leer),
    await leerTrasCobroRecuperando({ id: 5 }, async () => { throw new Error('red') }, leer),
    await leerTrasCobroRecuperando({ id: 5 }, async () => ({ id: 5 }), leer),
  ]
  for (const c of casos) assert.ok(!c.ok && c.mensaje.startsWith(MENSAJE_COBRADA_ILEGIBLE))
  assert.equal(projectIdDeCrudo({ id: '12' }), '12')
  assert.equal(projectIdDeCrudo({ id: 'abc' }), null)
  assert.equal(projectIdDeCrudo(null), null)
})

test('cotizar(): la recuperación es un GET y hay un único POST', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./cotizar.ts', import.meta.url), 'utf8')
  assert.match(src, /metodo: 'GET', path: `\$\{config\.quotePath\}\/\$\{id\}`/)
  assert.equal((src.match(/metodo: 'POST'/g) ?? []).length, 1, 'solo un POST /insurances en cotizar.ts: nunca se reintenta tras cobrar')
})

test('respuesta legible a la primera: no se llama a recuperar', async () => {
  let llamadas = 0
  const r = await leerTrasCobroRecuperando({ id: 9, mainQuotes: [] }, async () => (llamadas++, {}))
  assert.ok(r.ok && !r.recuperada)
  assert.equal(llamadas, 0)
})

test('un lector que lanza algo raro tampoco escapa', () => {
  const r = leerTrasCobro({}, () => {
    throw 'boom'
  })
  assert.equal(r.ok, false)
})
