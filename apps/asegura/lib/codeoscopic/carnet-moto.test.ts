import { test } from 'node:test'
import assert from 'node:assert/strict'
import { limitesDeCarnets, motorDeVersion, choqueCarnetVersion } from './carnet-moto.ts'

// Forma del catálogo según la referencia y el snapshot del portal. SOLO el A1 está medido
// (`{"id":"A1","minAge":16,"maxDisplacement":125}`); AM, A2 y A son supuestos hasta
// tener un `/motorcycle/driving-licenses` real delante.
const CARNETS = [
  { id: 'AM', minAge: 15, maxDisplacement: 50 },
  { id: 'A1', minAge: 16, maxDisplacement: 125, maxEnginePower: 11 },
  { id: 'A2', minAge: 18, maxEnginePower: 35 },
  { id: 'A', minAge: 20 },
  { name: 'sin id', maxDisplacement: 10 },
]

test('limitesDeCarnets: cc y kW por tipo; sin límite = null; entradas sin id fuera', () => {
  assert.deepEqual(limitesDeCarnets(CARNETS), [
    { id: 'AM', maxCc: 50, maxKw: null },
    { id: 'A1', maxCc: 125, maxKw: 11 },
    { id: 'A2', maxCc: null, maxKw: 35 },
    { id: 'A', maxCc: null, maxKw: null },
  ])
  assert.deepEqual(limitesDeCarnets({ items: [{ id: 'A1', maxDisplacement: '125' }] }), [
    { id: 'A1', maxCc: 125, maxKw: null },
  ])
})

test('motorDeVersion: engine.displacement y engine.powerKw de la versión con ese código', () => {
  const versiones = [
    { id: '111', engine: { displacement: 125, powerKw: 11 } },
    { id: '222', engine: { displacement: 689, powerKw: 54, powerCv: 73 } },
  ]
  assert.deepEqual(motorDeVersion(versiones, '222'), { cc: 689, kw: 54 })
  assert.equal(motorDeVersion(versiones, '999'), null, 'código que no está = no se ha podido mirar')
  // Sin kW NO se deriva de los CV: la potencia queda como «no se sabe».
  assert.deepEqual(motorDeVersion([{ id: '3', engine: { displacement: 300, powerCv: 40 } }], '3'), {
    cc: 300,
    kw: null,
  })
})

test('choqueCarnetVersion: un A1 no cubre una 689 cc / 54 kW', () => {
  const [, a1, a2, a] = limitesDeCarnets(CARNETS)
  assert.equal(
    choqueCarnetVersion(a1, { cc: 689, kw: 54 }),
    'el carné A1 no cubre esta versión: 689 cc (máximo 125 cc) y 54 kW (máximo 11 kW)',
  )
  assert.match(choqueCarnetVersion(a2, { cc: 689, kw: 54 }) ?? '', /54 kW \(máximo 35 kW\)/)
  assert.equal(choqueCarnetVersion(a, { cc: 1300, kw: 130 }), null)
  assert.equal(choqueCarnetVersion(a1, { cc: 125, kw: 11 }), null, 'el límite es inclusivo')
  // 48 CV = 35,3 kW: una A2 homologada no puede quedarse sin precio por el redondeo.
  assert.equal(choqueCarnetVersion(a2, { cc: 689, kw: 35.3 }), null, 'redondeo CV→kW dentro del margen')
  assert.match(choqueCarnetVersion(a2, { cc: 689, kw: 35.6 }) ?? '', /35.6 kW/)
  assert.match(choqueCarnetVersion(a1, { cc: 127, kw: 11 }) ?? '', /127 cc/)
})

test('choqueCarnetVersion: sin dato NO hay choque (no se bloquea lo que no se ha podido mirar)', () => {
  const a1 = { id: 'A1', maxCc: 125, maxKw: 11 }
  assert.equal(choqueCarnetVersion(a1, { cc: null, kw: null }), null)
  assert.match(choqueCarnetVersion(a1, { cc: null, kw: 20 }) ?? '', /20 kW/)
})

// ─── Regla de tráfico fija (caso Kymco Grand Dink 300, base7 02770680002) ────
import { avisoCilindradaDesconocida, choqueReglaTrafico, traducirMotoNoApta400 } from './carnet-moto.ts'
import { respuestaFalloCotizacion } from './fallo-cotizacion.ts'

test('regla de tráfico: B + 299 cc corta con la frase de la ficha', () => {
  const m = choqueReglaTrafico('B', { cc: 299, kw: null })
  assert.equal(
    m,
    'La moto tiene 299 cc y exige carné A2 o A; en la ficha del conductor solo consta el B. ' +
      'Añade su carné de moto (con fecha) y vuelve a pedir precio.',
  )
})
test('regla de tráfico: A2 + 299 cc pasa; B + 125 cc pasa; A sin límite', () => {
  assert.equal(choqueReglaTrafico('A2', { cc: 299, kw: 20 }), null)
  assert.equal(choqueReglaTrafico('B', { cc: 125, kw: 11 }), null)
  assert.equal(choqueReglaTrafico('A', { cc: 1300, kw: 130 }), null)
  assert.match(choqueReglaTrafico('B', { cc: null, kw: 20 }) ?? '', /20 kW/)
  assert.match(choqueReglaTrafico('AM', { cc: 125, kw: null }) ?? '', /AM/)
  assert.match(choqueReglaTrafico('A2', { cc: 600, kw: 50 }) ?? '', /50 kW/)
  assert.equal(choqueReglaTrafico('B', { cc: null, kw: null }), null, 'sin dato no se afirma choque')
})
test('cilindrada desconocida con B supuesto avisa; con B de ficha o con dato no', () => {
  assert.match(avisoCilindradaDesconocida('B', true, { cc: null, kw: null }) ?? '', /AVISO/)
  assert.match(avisoCilindradaDesconocida('B', true, null) ?? '', /cilindrada/)
  assert.equal(avisoCilindradaDesconocida('B', true, { cc: 125, kw: null }), null)
  assert.equal(avisoCilindradaDesconocida('B', false, null), null)
  assert.equal(avisoCilindradaDesconocida('A2', true, null), null)
})
test('el 400 «cannot be used by the primary driver» se traduce; otros 400 no', () => {
  const t = traducirMotoNoApta400(
    'codeoscopic_validacion: {"message":"The motorbike with base7 code 02770680002 cannot be used by the primary driver"}',
  )
  assert.match(t ?? '', /02770680002/)
  assert.match(t ?? '', /No se ha cobrado nada/)
  assert.equal(traducirMotoNoApta400('{"message":"The phone of the holder is mandatory."}'), null)
})
test('respuestaFalloCotizacion: 400 sin cargo = 422 validacion con gastado; timeout/5xx sin cifra', () => {
  const v = respuestaFalloCotizacion({ ok: false, razon: 'vendor', mensaje: 'x', sinCargo: true, claveVendor: 'validacion' })
  assert.equal(v.status, 422)
  assert.equal(v.cuerpo.gastado, '0,00€')
  assert.equal(v.cuerpo.causa, 'validacion')
  const c = respuestaFalloCotizacion({ ok: false, razon: 'vendor', mensaje: 'x', sinCargo: true, claveVendor: 'conexion' })
  assert.equal(c.status, 502)
  assert.equal(c.cuerpo.gastado, '0,00€')
  const t = respuestaFalloCotizacion({ ok: false, razon: 'vendor', mensaje: 'timeout' })
  assert.equal(t.status, 502)
  assert.equal('gastado' in t.cuerpo, false)
})
