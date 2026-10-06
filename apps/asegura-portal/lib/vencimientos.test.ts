import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ofrecibleParaMejorarPrecio, primaQuePaga, vencimientosEnVentana } from './vencimientos.ts'
import { polizasConBajaEnMarcha } from './anulacion-firma.ts'
import type { PolizaPortal } from './cartera-lectura.ts'

const poliza = (id: string, vence: string | null, vigencia = 'vigente') =>
  ({ id, vigencia, fechaVencimiento: vence === null ? null : new Date(`${vence}T00:00:00Z`) }) as unknown as PolizaPortal

test('entra solo lo vigente, con fecha y dentro de la ventana, del más cercano al más lejano', () => {
  const r = vencimientosEnVentana([
    poliza('lejos', '2026-11-10'),
    poliza('cerca', '2026-09-30'),
    poliza('fuera', '2027-03-01'),
    poliza('pasada', '2026-09-01'),
    poliza('sin-fecha', null),
    poliza('anulada', '2026-10-01', 'anulada'),
  ], '2026-09-23')
  assert.deepEqual(r.map((f) => f.p.id), ['cerca', 'lejos'])
  assert.equal(r[0].dias, 7)
})

test('🪤 la prima: bruta antes que anual, y un 0 no es una prima', () => {
  assert.equal(primaQuePaga({ bruta: 480, anual: 400, mensual: null, fraccionamiento: null }), 480)
  assert.equal(primaQuePaga({ bruta: null, anual: 400, mensual: null, fraccionamiento: null }), 400)
  assert.equal(primaQuePaga({ bruta: 0, anual: 400, mensual: null, fraccionamiento: null }), null)
  assert.equal(primaQuePaga({ bruta: null, anual: null, mensual: null, fraccionamiento: null }), null)
  assert.equal(primaQuePaga(null), null)
})

const sustituida = (id: string, vence: string) =>
  ({ ...poliza(id, vence), sustituidaAt: new Date('2026-09-24T06:15:24Z') }) as unknown as PolizaPortal

test('🪤 una póliza con baja en marcha no «renueva»: sale de la lista aunque siga vigente', () => {
  const lista = [poliza('honda', '2026-11-01'), poliza('otra', '2026-11-05')]
  const conBaja = polizasConBajaEnMarcha({
    anulaciones: [],
    enRevision: [],
    firmadas: [{ id: 'a', polizaId: 'honda', estado: 'comunicada' }] as never,
  })
  assert.deepEqual(vencimientosEnVentana(lista, '2026-10-06', conBaja).map((f) => f.p.id), ['otra'])
  assert.deepEqual(vencimientosEnVentana(lista, '2026-10-06').map((f) => f.p.id), ['honda', 'otra'])
})

test('🪤 la lista y el puente comparten criterio: sustituida (sustituida_at) no se ofrece', () => {
  assert.equal(ofrecibleParaMejorarPrecio(sustituida('x', '2026-11-01')), false)
  assert.equal(ofrecibleParaMejorarPrecio(poliza('x', '2026-11-01')), true)
  assert.deepEqual(vencimientosEnVentana([sustituida('honda', '2026-11-01')], '2026-10-06'), [])
})

test('polizasConBajaEnMarcha: pendientes, en revisión y firmadas; la confirmada solo si se pide', () => {
  const f = {
    anulaciones: [{ polizaId: 'a' }, { polizaId: null }] as never,
    enRevision: [{ polizaId: 'b' }] as never,
    firmadas: [{ polizaId: 'c', estado: 'firmada' }, { polizaId: 'd', estado: 'confirmada' }] as never,
  }
  assert.deepEqual([...polizasConBajaEnMarcha(f)].sort(), ['a', 'b', 'c'])
  assert.deepEqual([...polizasConBajaEnMarcha(f, { conConfirmadas: true })].sort(), ['a', 'b', 'c', 'd'])
})
