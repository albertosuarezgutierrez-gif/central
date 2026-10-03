import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opcionesPorDefecto, opcionesEmisionPorDefecto, conProductoPorDefecto, conDescuentos, descuentosDelCuerpo } from './opciones-producto.ts'

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

test('opcionesPorDefecto: las de Allianz son de AUTO; moto u hogar no las heredan', () => {
  assert.ok(opcionesPorDefecto('Allianz', 'auto'))
  assert.ok(opcionesPorDefecto('Allianz', null), 'sin ramo conocido se mantiene el comportamiento de auto')
  // Moto/hogar: solo los dos campos de descuento, no las 14 de auto.
  assert.equal(opcionesPorDefecto('Allianz', 'moto')!.length, 2)
  assert.equal(opcionesPorDefecto('Allianz', 'hogar')!.length, 2)
})

const ids = (o: { id: string; value: unknown }[] | null) => Object.fromEntries((o ?? []).map((x) => [x.id, x.value]))

test('opcionesPorDefecto: Allianz moto → dtoCap y dtoVentaCruzada a 50', () => {
  assert.deepEqual(ids(opcionesPorDefecto('Allianz', 'moto')), { dtoCap: 50, dtoVentaCruzada: 50 })
})
test('opcionesPorDefecto: Allianz hogar → dtoCap y dtoVentaCruzada a 50', () => {
  assert.deepEqual(ids(opcionesPorDefecto('Allianz', 'hogar')), { dtoCap: 50, dtoVentaCruzada: 50 })
})
test('opcionesPorDefecto: Generali moto → commercialDiscountNumber a 50', () => {
  assert.deepEqual(ids(opcionesPorDefecto('Generali', 'moto')), { commercialDiscountNumber: 50 })
})
test('opcionesPorDefecto: Generali hogar → commercialDiscountNumber a 50', () => {
  assert.deepEqual(ids(opcionesPorDefecto('Generali Seguros', 'hogar')), { commercialDiscountNumber: 50 })
})
test('opcionesPorDefecto: Occident y Fidelidade siguen sin catálogo en moto/hogar; comissionType nunca', () => {
  for (const c of ['Occident', 'Catalana Occidente', 'Fidelidade'])
    for (const r of ['moto', 'hogar']) assert.equal(opcionesPorDefecto(c, r), null, `${c} ${r}`)
  assert.equal(opcionesPorDefecto('Generali', 'auto'), null)
  for (const c of ['Allianz', 'Generali', 'Occident', 'Fidelidade'])
    for (const r of ['moto', 'hogar'])
      assert.equal((opcionesPorDefecto(c, r) ?? []).some((o) => o.id === 'comissionType'), false, `${c} ${r}`)
})

test('descuento en preemisión: límites del formulario real (CAP 0-99, venta cruzada 0-100), sin tocar el catálogo', () => {
  assert.deepEqual(descuentosDelCuerpo(undefined), { pedidos: null })
  assert.deepEqual(descuentosDelCuerpo({ dtoCap: 10, dtoVentaCruzada: '' }), { pedidos: { dtoCap: 10 } })
  assert.ok('reparo' in descuentosDelCuerpo({ dtoCap: 100 }))
  assert.ok('reparo' in descuentosDelCuerpo({ dtoVentaCruzada: -1 }))
  assert.ok('reparo' in descuentosDelCuerpo({ dtoCap: 12.5 }))
  assert.ok('reparo' in descuentosDelCuerpo({ comision: 5 }))
  assert.deepEqual(descuentosDelCuerpo({ dtoVentaCruzada: 100 }), { pedidos: { dtoVentaCruzada: 100 } })
  // 🪤 Claves del prototipo y valores que Number() aceptaría sin serlo.
  for (const raro of [{ toString: 5 }, JSON.parse('{"__proto__":5}'), { dtoCap: true }, { dtoCap: '0x10' }, { dtoCap: [5] }, { dtoCap: ' 7 ' }]) {
    assert.ok('reparo' in descuentosDelCuerpo(raro), JSON.stringify(raro))
  }
  assert.deepEqual(descuentosDelCuerpo({ dtoCap: '15' }), { pedidos: { dtoCap: 15 } })
  // Un formulario del vendor que manda el valor como texto lo conserva como texto; sin el campo, mensaje del formulario.
  const delFormulario = conDescuentos([{ id: 'dtoCap', value: '25' }], { dtoCap: 10 }, 'formulario')
  assert.ok(delFormulario.ok && (delFormulario.opciones[0] as { value: unknown }).value === '10')
  const sinCampo = conDescuentos([{ id: 'otro', value: 1 }], { dtoCap: 10 }, 'formulario')
  assert.ok(!sinCampo.ok && /formulario/.test(sinCampo.motivo))

  const base = opcionesPorDefecto('Allianz')!
  const r = conDescuentos(base, { dtoCap: 10, dtoVentaCruzada: 0 })
  assert.ok(r.ok)
  const valor = (id: string) => (r.opciones as { id: string; value: unknown }[]).find((o) => o.id === id)?.value
  assert.equal(valor('dtoCap'), 10)
  assert.equal(valor('dtoVentaCruzada'), 0)
  // 🪤 Copia: el catálogo compartido sigue en su valor por defecto (50, decisión 29/09/2026).
  assert.equal(opcionesPorDefecto('Allianz')!.find((o) => o.id === 'dtoCap')!.value, 50)
  assert.equal(opcionesPorDefecto('Allianz')!.find((o) => o.id === 'dtoVentaCruzada')!.value, 50)
  // Otra compañía (sin el campo) no se inventa la opción: se rechaza antes de gastar.
  assert.equal(conDescuentos(null, { dtoCap: 10 }).ok, false)
  assert.equal(conDescuentos([{ id: 'otro', type: 'number', value: 1 }], { dtoCap: 10 }).ok, false)
})
