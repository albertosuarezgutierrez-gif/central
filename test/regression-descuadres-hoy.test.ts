// Cepos de los descuadres de comisiones en «Hoy»: lo normal no es incidencia; lo no comprobado no es «todo bien».
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { contadorDescuadres, descuadresParaHoy, type PeriodoCuadre } from '../apps/plataforma/lib/correduria/descuadres-hoy.ts'

const p = (estado: PeriodoCuadre['estado'], fin = '2026-07-31'): PeriodoCuadre =>
  ({ compania: 'Allianz', inicio: fin.slice(0, 8) + '01', fin, estado, liqRemesa: 80.77 })

test('un descuadre sube siempre', () => {
  const d = descuadresParaHoy([p('descuadra', '2026-09-30')], '2026-09-24')
  assert.equal(d.incidencias.length, 1)
})

test('🪤 liquidado sin cobrar dentro del plazo de pago es lo normal, no una incidencia', () => {
  assert.equal(descuadresParaHoy([p('liquidado-sin-cobrar', '2026-08-31')], '2026-09-24').incidencias.length, 0)
  assert.equal(descuadresParaHoy([p('liquidado-sin-cobrar', '2026-07-31')], '2026-09-24').incidencias.length, 1)
})

test('🪤 un periodo no comprobado no deja el contador en 0', () => {
  const d = descuadresParaHoy([p('no-comprobado'), p('cuadra')], '2026-09-24')
  assert.equal(contadorDescuadres(d), null)
})

test('todo cuadrado: 0; cuadra, sin datos y deudor no suben', () => {
  const d = descuadresParaHoy([p('cuadra'), p('sin-datos'), p('deudor'), p('esperado-sin-liquidar')], '2026-09-24')
  assert.equal(contadorDescuadres(d), 0)
})
