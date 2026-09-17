import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opcionesPorDefecto, opcionesEmisionPorDefecto, conProductoPorDefecto } from './opciones-producto.ts'

test('opcionesPorDefecto: Allianz trae las 14 opciones portadas del CRM, con naturalPhenomena=false', () => {
  const o = opcionesPorDefecto('Allianz')
  assert.ok(o)
  assert.equal(o.length, 14)
  const fenomenos = o.find((x) => x.id === 'naturalPhenomena')
  assert.deepEqual(fenomenos, { id: 'naturalPhenomena', type: 'boolean', value: false })
})

test('opcionesPorDefecto: casa por nombre sin distinguir mayúsculas ni espacios', () => {
  assert.ok(opcionesPorDefecto('ALLIANZ Seguros'))
  assert.ok(opcionesPorDefecto('  allianz  '))
})

test('opcionesPorDefecto: sin catálogo para el resto de compañías → null', () => {
  assert.equal(opcionesPorDefecto('Reale'), null)
  assert.equal(opcionesPorDefecto('Mapfre'), null)
  assert.equal(opcionesPorDefecto('Fidelidade'), null)
})

test('opcionesPorDefecto: cada llamada devuelve una copia — mutar una no afecta a la siguiente', () => {
  const primera = opcionesPorDefecto('Allianz')
  assert.ok(primera)
  primera[0].value = 'mutado'
  const segunda = opcionesPorDefecto('Allianz')
  assert.ok(segunda)
  assert.notEqual(segunda[0].value, 'mutado')
})

test('opcionesEmisionPorDefecto: Allianz trae los 4 consentimientos del Submit, todos en false', () => {
  const o = opcionesEmisionPorDefecto('Allianz')
  assert.ok(o)
  assert.deepEqual(
    o.map((x) => x.id),
    ['insuredFamilyInAllianz', 'publicityConsent', 'allianzGroupProductsConsent', 'commercialProfilingConsent'],
  )
  assert.ok(o.every((x) => x.type === 'boolean' && x.value === false))
})

test('opcionesEmisionPorDefecto: NO es el mismo catálogo que opcionesPorDefecto (ReRate vs Submit)', () => {
  const reRate = opcionesPorDefecto('Allianz')
  const submit = opcionesEmisionPorDefecto('Allianz')
  assert.ok(reRate && submit)
  assert.notEqual(reRate.length, submit.length)
  assert.equal(reRate.some((x) => x.id === 'insuredFamilyInAllianz'), false)
})

test('opcionesEmisionPorDefecto: sin catálogo para el resto de compañías → null', () => {
  assert.equal(opcionesEmisionPorDefecto('Reale'), null)
  assert.equal(opcionesEmisionPorDefecto('Mapfre'), null)
})

test('opcionesEmisionPorDefecto: cada llamada devuelve una copia', () => {
  const primera = opcionesEmisionPorDefecto('Allianz')
  assert.ok(primera)
  primera[0].value = 'mutado'
  const segunda = opcionesEmisionPorDefecto('Allianz')
  assert.ok(segunda)
  assert.notEqual(segunda[0].value, 'mutado')
})

test('conProductoPorDefecto: Allianz sin product previo → lo rellena con los 4 consentimientos', () => {
  const r = conProductoPorDefecto({ quote: { id: 'Q1' } }, 'Allianz')
  assert.deepEqual(r, {
    quote: { id: 'Q1' },
    product: {
      options: [
        { id: 'insuredFamilyInAllianz', type: 'boolean', value: false },
        { id: 'publicityConsent', type: 'boolean', value: false },
        { id: 'allianzGroupProductsConsent', type: 'boolean', value: false },
        { id: 'commercialProfilingConsent', type: 'boolean', value: false },
      ],
    },
  })
})

test('conProductoPorDefecto: si el corredor YA puso `product` (JSON avanzado), no se pisa', () => {
  const yaPuesto = { quote: { id: 'Q1' }, product: { options: [{ id: 'x', type: 'boolean', value: true }] } }
  assert.deepEqual(conProductoPorDefecto(yaPuesto, 'Allianz'), yaPuesto)
})

test('conProductoPorDefecto: compañía sin catálogo (Reale) → campos tal cual, sin `product`', () => {
  const campos = { quote: { id: 'Q1' } }
  assert.deepEqual(conProductoPorDefecto(campos, 'Reale'), campos)
})

test('conProductoPorDefecto: un `product` que no es objeto (array/null) SÍ se rellena', () => {
  const r = conProductoPorDefecto({ product: null }, 'Allianz')
  assert.ok((r.product as { options: unknown }).options)
})

test('conProductoPorDefecto: familiaAllianz=true pone insuredFamilyInAllianz a true, el resto sigue en false', () => {
  const r = conProductoPorDefecto({ quote: { id: 'Q1' } }, 'Allianz', { familiaAllianz: true })
  const opciones = (r.product as { options: { id: string; value: unknown }[] }).options
  assert.deepEqual(
    Object.fromEntries(opciones.map((o) => [o.id, o.value])),
    {
      insuredFamilyInAllianz: true,
      publicityConsent: false,
      allianzGroupProductsConsent: false,
      commercialProfilingConsent: false,
    },
  )
})

test('conProductoPorDefecto: familiaAllianz=true en una compañía sin catálogo no inventa nada', () => {
  const campos = { quote: { id: 'Q1' } }
  assert.deepEqual(conProductoPorDefecto(campos, 'Reale', { familiaAllianz: true }), campos)
})

test('conProductoPorDefecto: familiaAllianz sin marcar (u omitido) sigue en false, como antes', () => {
  const r = conProductoPorDefecto({ quote: { id: 'Q1' } }, 'Allianz', { familiaAllianz: false })
  const opciones = (r.product as { options: { id: string; value: unknown }[] }).options
  assert.equal(opciones.find((o) => o.id === 'insuredFamilyInAllianz')?.value, false)
})
