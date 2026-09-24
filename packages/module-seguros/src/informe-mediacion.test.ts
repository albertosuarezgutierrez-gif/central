import { test } from 'node:test'
import assert from 'node:assert/strict'
import { informeMediacion, type ReciboInforme } from './informe-mediacion.ts'

const base: ReciboInforme = { compania: 'C0109', ramo: 'auto', situacion: 'cobrado', clase: 'CA', prima: '300.00', efecto: '2026-03-01' }

test('suma por compañía y ramo solo lo COBRADO del año, separando nueva producción y cartera', () => {
  const i = informeMediacion(
    [
      base,
      { ...base, clase: 'NP', prima: '120.50' },
      { ...base, clase: 'SU', prima: '-20.00' },
      { ...base, ramo: 'hogar', prima: '200.00' },
      { ...base, efecto: '2025-12-31' },
      { ...base, situacion: 'anulado' },
      { ...base, situacion: 'devuelto' },
      { ...base, situacion: 'pendiente' },
    ],
    2026,
  )
  const auto = i.filas.find((f) => f.ramo === 'auto')!
  assert.equal(auto.recibos, 3)
  assert.equal(auto.primas, 400.5)
  assert.equal(auto.primasNuevaProduccion, 120.5)
  assert.equal(auto.primasCartera, 300)
  assert.equal(auto.primasOtras, -20)
  assert.equal(auto.anulados, 1)
  assert.equal(auto.devueltos, 1)
  assert.equal(auto.pendientes, 1)
  assert.equal(i.total.primas, 600.5)
  assert.deepEqual(i.companiasConDatos, ['C0109'])
})

test('🪤 un importe ilegible no suma como 0: se cuenta aparte', () => {
  const i = informeMediacion([base, { ...base, prima: '1.234,56' }, { ...base, prima: null }], 2026)
  assert.equal(i.total.primas, 300)
  assert.equal(i.ilegibles, 2)
})

test('🪤 un recibo sin fecha no se imputa a ningún año (y se declara)', () => {
  const i = informeMediacion([base, { ...base, efecto: null }], 2026)
  assert.equal(i.total.recibos, 1)
  assert.equal(i.sinFecha, 1)
})

test('una compañía sin recibos del año NO aparece como 0: no está en companiasConDatos', () => {
  const i = informeMediacion([base, { ...base, compania: 'C0058', efecto: '2025-06-01' }], 2026)
  assert.deepEqual(i.companiasConDatos, ['C0109'])
  assert.equal(i.filas.length, 1)
})
