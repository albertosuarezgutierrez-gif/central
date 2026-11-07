import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opcionesPorDefecto, opcionesParaReRate, opcionesEmisionPorDefecto, conProductoPorDefecto, conDescuentos, descuentosDelCuerpo } from './opciones-producto.ts'

test('opcionesPorDefecto: Allianz auto trae las 12 opciones (sin descuentos), con naturalPhenomena=false', () => {
  const o = opcionesPorDefecto('Allianz')
  assert.ok(o)
  assert.equal(o.length, 12)
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

const ids = (o: { id: string; value: unknown }[] | null) => Object.fromEntries((o ?? []).map((x) => [x.id, x.value]))
const DTOS = ['dtoCap', 'dtoVentaCruzada', 'commercialDiscountNumber']

test('opcionesPorDefecto: las de Allianz son de AUTO; moto u hogar no las heredan (sin catálogo)', () => {
  assert.ok(opcionesPorDefecto('Allianz', 'auto'))
  assert.ok(opcionesPorDefecto('Allianz', null), 'sin ramo conocido se mantiene el comportamiento de auto')
  assert.equal(opcionesPorDefecto('Allianz', 'moto'), null)
  assert.equal(opcionesPorDefecto('Allianz', 'hogar'), null)
})
test('🪤 opcionesPorDefecto NUNCA trae descuentos (afinaciones del panel de Avant2, 07/11/2026)', () => {
  for (const c of ['Allianz', 'Generali', 'Generali Seguros', 'Occident', 'Fidelidade', 'Mapfre'])
    for (const r of ['auto', 'moto', 'hogar', null])
      for (const o of opcionesPorDefecto(c, r) ?? []) assert.equal(DTOS.includes(o.id), false, `${c} ${r} ${o.id}`)
  assert.equal((opcionesPorDefecto('Allianz', 'auto') ?? []).some((o) => o.id === 'comissionType'), true)
  for (const c of ['Allianz', 'Generali', 'Occident', 'Fidelidade'])
    for (const r of ['moto', 'hogar'])
      assert.equal((opcionesPorDefecto(c, r) ?? []).some((o) => o.id === 'comissionType'), false, `${c} ${r}`)
})
test('opcionesPorDefecto: Generali y resto sin catálogo → null', () => {
  for (const r of ['auto', 'moto', 'hogar']) assert.equal(opcionesPorDefecto('Generali', r), null)
  assert.equal(opcionesPorDefecto('Occident', 'auto'), null)
})
test('opcionesParaReRate: reenvía lo del vendor tal cual (también Generali auto, sin forzar descuento)', () => {
  const vendor = [{ id: 'commercialDiscountNumber', type: 'number', value: 0 }, { id: 'codigoFlota', type: 'string', value: 'x' }]
  assert.deepEqual(opcionesParaReRate(vendor, 'Generali Seguros', 'auto'), vendor)
  assert.deepEqual(opcionesParaReRate(vendor, 'Allianz', 'auto'), vendor)
  assert.equal(vendor[0].value, 0)
})
test('opcionesParaReRate: sin opciones del vendor → catálogo (Allianz auto 12, Generali null)', () => {
  assert.equal((opcionesParaReRate(null, 'Allianz', 'auto') as unknown[]).length, 12)
  assert.equal(opcionesParaReRate(null, 'Generali', 'auto'), null)
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
  const r = conDescuentos(base, { dtoCap: 10, dtoVentaCruzada: 0 }, 'catalogo', { compania: 'Allianz', ramo: 'auto' })
  assert.ok(r.ok)
  const valor = (id: string) => (r.opciones as { id: string; value: unknown }[]).find((o) => o.id === id)?.value
  assert.equal(valor('dtoCap'), 10)
  assert.equal(valor('dtoVentaCruzada'), 0)
  assert.equal(r.opciones.length, 14)
  // 🪤 Copia: el catálogo compartido no se contamina.
  assert.equal(opcionesPorDefecto('Allianz')!.length, 12)
  // Sin destino o compañía no catalogada: se rechaza antes de gastar.
  assert.equal(conDescuentos(null, { dtoCap: 10 }).ok, false)
  assert.equal(conDescuentos([{ id: 'otro', type: 'number', value: 1 }], { dtoCap: 10 }).ok, false)
  assert.equal(conDescuentos([], { dtoCap: 10 }, 'catalogo', { compania: 'Occident', ramo: 'auto' }).ok, false)
  // Allianz no admite el id de Generali y viceversa.
  assert.equal(conDescuentos([], { commercialDiscountNumber: 10 }, 'catalogo', { compania: 'Allianz', ramo: 'moto' }).ok, false)
  assert.equal(conDescuentos([], { dtoCap: 10 }, 'catalogo', { compania: 'Generali', ramo: 'moto' }).ok, false)
  // Con origen formulario nunca se inventa el id, aunque la compañía lo admita.
  assert.equal(conDescuentos([], { dtoCap: 10 }, 'formulario', { compania: 'Allianz', ramo: 'auto' }).ok, false)
})

test('descuento manual: se AÑADE (number) en Allianz auto/moto/hogar y Generali auto/moto/hogar', () => {
  for (const r of ['auto', 'moto', 'hogar']) {
    const a = conDescuentos(opcionesPorDefecto('Allianz', r), { dtoCap: 20, dtoVentaCruzada: 5 }, 'catalogo', { compania: 'Allianz', ramo: r })
    assert.ok(a.ok, `Allianz ${r}`)
    const m = ids(a.opciones as { id: string; value: unknown }[])
    assert.equal(m.dtoCap, 20); assert.equal(m.dtoVentaCruzada, 5)
    assert.deepEqual((a.opciones as { id: string; type: string }[]).find((o) => o.id === 'dtoCap'), { id: 'dtoCap', type: 'number', value: 20 })
    const g = conDescuentos(opcionesPorDefecto('Generali Seguros', r), { commercialDiscountNumber: 12 }, 'catalogo', { compania: 'Generali Seguros', ramo: r })
    assert.ok(g.ok, `Generali ${r}`)
    assert.deepEqual(g.opciones, [{ id: 'commercialDiscountNumber', type: 'number', value: 12 }])
  }
})

test('🪤 consentimientos del Submit: solo Allianz AUTO; en moto/hogar no se firma nada por defecto', () => {
  assert.ok(opcionesEmisionPorDefecto('Allianz', 'auto'))
  assert.ok(opcionesEmisionPorDefecto('Allianz'), 'sin ramo = auto, como siempre')
  assert.equal(opcionesEmisionPorDefecto('Allianz', 'moto'), null)
  assert.equal(opcionesEmisionPorDefecto('Allianz', 'hogar'), null)
  const campos = { quote: { id: 'Q1' } }
  assert.deepEqual(conProductoPorDefecto(campos, 'Allianz', { ramo: 'hogar' }), campos)
  assert.deepEqual(conProductoPorDefecto(campos, 'Allianz', { ramo: 'moto' }), campos)
  assert.ok((conProductoPorDefecto(campos, 'Allianz', { ramo: 'auto' }) as any).product)
})
