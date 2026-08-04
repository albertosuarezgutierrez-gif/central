import { test } from 'node:test'
import assert from 'node:assert/strict'
import { factorLastMinute } from './pricing-lastminute.ts'

const BASE = { muestra: 50, factorEvento: 1 }

test('con la palanca apagada no hace absolutamente nada', () => {
  const r = factorLastMinute({ ...BASE, diasVista: 1, antelacionMediana: 108 })
  assert.equal(r.factor, 1)
  assert.equal(r.evaluado, false)
})

test('lejos de la mediana no toca el precio', () => {
  // Busto vende con 108 días de mediana: a 120 días aún no ha empezado su ventana.
  const r = factorLastMinute({ ...BASE, diasVista: 120, antelacionMediana: 108 }, { k: 1 })
  assert.equal(r.factor, 1)
  assert.equal(r.evaluado, true)
})

test('el descuento crece según se acerca la fecha, despacio al principio', () => {
  const a = { ...BASE, antelacionMediana: 108 }
  const mitad = factorLastMinute({ ...a, diasVista: 54 }, { k: 1 }).factor
  const cerca = factorLastMinute({ ...a, diasVista: 27 }, { k: 1 }).factor
  const vispera = factorLastMinute({ ...a, diasVista: 1 }, { k: 1 }).factor

  assert.ok(mitad > cerca && cerca > vispera, 'debe bajar de forma monótona')
  assert.ok(mitad > 0.93 && mitad < 0.95, `a media ventana ~-6%, salió ${mitad}`)
  assert.ok(vispera > 0.75 && vispera < 0.78, `en vísperas ~-24%, salió ${vispera}`)
})

test('nunca pasa del descuento máximo', () => {
  const r = factorLastMinute({ ...BASE, diasVista: 0, antelacionMediana: 108 }, { k: 1 })
  assert.equal(r.factor, 0.75)
})

test('k gradúa la intensidad sin cambiar la forma', () => {
  const pleno = factorLastMinute({ ...BASE, diasVista: 0, antelacionMediana: 32 }, { k: 1 }).factor
  const suave = factorLastMinute({ ...BASE, diasVista: 0, antelacionMediana: 32 }, { k: 0.4 }).factor
  assert.equal(pleno, 0.75)
  assert.ok(suave > pleno && suave < 1, `k=0,4 debe descontar menos, salió ${suave}`)
  assert.ok(Math.abs((1 - suave) - 0.4 * (1 - pleno)) < 1e-9, 'k debe escalar el descuento linealmente')
})

test('cada piso usa SU ventana: a 20 días Dúplex ya la ha pasado y Busto no', () => {
  // Dúplex vende con 7 días de mediana; Busto con 108. A 20 días de la fecha son mundos distintos.
  const duplex = factorLastMinute({ ...BASE, diasVista: 20, antelacionMediana: 7 }, { k: 1 })
  const busto = factorLastMinute({ ...BASE, diasVista: 20, antelacionMediana: 108 }, { k: 1 })
  assert.equal(duplex.factor, 1, 'a Dúplex ni le ha llegado su ventana de venta')
  assert.ok(busto.factor < 0.85, `Busto ya va muy tarde, salió ${busto.factor}`)
})

test('una noche de evento NO se rebaja aunque esté encima', () => {
  const r = factorLastMinute(
    { ...BASE, diasVista: 2, antelacionMediana: 108, factorEvento: 2.5 }, { k: 1 })
  assert.equal(r.factor, 1)
  assert.equal(r.evaluado, true)
  assert.match(r.motivo, /se vende sola/)
})

test('sin antelación medida no se inventa urgencia', () => {
  const r = factorLastMinute({ ...BASE, diasVista: 1, antelacionMediana: null }, { k: 1 })
  assert.equal(r.factor, 1)
  assert.equal(r.evaluado, false)
})

test('con muestra corta tampoco: 3 noches no hacen una mediana', () => {
  const r = factorLastMinute({ ...BASE, muestra: 3, diasVista: 1, antelacionMediana: 108 }, { k: 1 })
  assert.equal(r.factor, 1)
  assert.equal(r.evaluado, false)
  assert.match(r.motivo, /muestra insuficiente/)
})

test('solo baja: el factor nunca supera 1', () => {
  for (const dias of [0, 1, 5, 10, 30, 60, 107, 108, 200]) {
    const f = factorLastMinute({ ...BASE, diasVista: dias, antelacionMediana: 108 }, { k: 1 }).factor
    assert.ok(f <= 1 && f >= 0.75, `dias=${dias} dio ${f}`)
  }
})
