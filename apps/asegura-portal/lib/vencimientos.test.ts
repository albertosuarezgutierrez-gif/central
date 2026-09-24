import { test } from 'node:test'
import assert from 'node:assert/strict'
import { primaQuePaga, vencimientosEnVentana } from './vencimientos.ts'
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
