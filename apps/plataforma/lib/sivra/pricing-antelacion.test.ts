import { test } from 'node:test'
import assert from 'node:assert/strict'
import { factorAntelacion } from './pricing-antelacion.ts'

// House Sevillana vende enero con 28 días de mediana (n=12 desde 2024, `incomes.reserved_at`).
const ENERO_HOUSE = { antelacionMediana: 28, muestra: 12 }
const BASE = { ...ENERO_HOUSE, factorEvento: 1 }

test('con la palanca apagada no hace absolutamente nada', () => {
  const r = factorAntelacion({ ...BASE, diasVista: 135 })
  assert.equal(r.factor, 1)
  assert.equal(r.evaluado, false)
})

test('dentro de la antelación normal no toca el precio', () => {
  const r = factorAntelacion({ ...BASE, diasVista: 20 }, { k: 1 })
  assert.equal(r.factor, 1)
  assert.equal(r.evaluado, true)
})

test('el caso que lo motivó: 8-9 enero vendidos a 135 días vista', () => {
  // 135 días con mediana 28 es 4,8× lo normal: premio al tope.
  const r = factorAntelacion({ ...BASE, diasVista: 135 }, { k: 1 })
  assert.equal(r.factor, 1.25)
  // Sobre los 342€ publicados esa noche → 428€.
  assert.equal(Math.round(342 * r.factor), 428)
})

test('el premio crece con la antelación, despacio al principio', () => {
  const a30 = factorAntelacion({ ...BASE, diasVista: 30 }, { k: 1 }).factor
  const a60 = factorAntelacion({ ...BASE, diasVista: 60 }, { k: 1 }).factor
  const a90 = factorAntelacion({ ...BASE, diasVista: 90 }, { k: 1 }).factor

  assert.ok(a30 < a60 && a60 < a90, 'debe subir de forma monótona')
  assert.ok(a30 < 1.005, `justo pasada la mediana casi no cobra premio, salió ${a30}`)
  assert.ok(a60 > 1.03 && a60 < 1.04, `a 60 días ~+3,6%, salió ${a60}`)
  assert.ok(a90 > 1.13 && a90 < 1.14, `a 90 días ~+13,6%, salió ${a90}`)
})

test('nunca pasa del premio máximo por lejos que esté la fecha', () => {
  const r = factorAntelacion({ ...BASE, diasVista: 365 }, { k: 1 })
  assert.equal(r.factor, 1.25)
})

test('nunca BAJA el precio: eso es cosa de la palanca de urgencia', () => {
  for (const diasVista of [0, 1, 14, 28, 29, 60, 200]) {
    const r = factorAntelacion({ ...BASE, diasVista }, { k: 1 })
    assert.ok(r.factor >= 1, `${diasVista} días vista devolvió ${r.factor}`)
  }
})

test('k gradúa la intensidad sin cambiar la forma', () => {
  const pleno = factorAntelacion({ ...BASE, diasVista: 135 }, { k: 1 }).factor
  const suave = factorAntelacion({ ...BASE, diasVista: 135 }, { k: 0.4 }).factor
  assert.equal(pleno, 1.25)
  assert.ok(suave < pleno && suave > 1, `k=0,4 debe premiar menos, salió ${suave}`)
  assert.equal(Math.round((suave - 1) * 1000) / 1000, 0.1)
})

test('la mediana es POR MES: los mismos 135 días no son anticipación en Semana Santa', () => {
  // Un mes que se vende con 150 días de mediana (Feria/S.Santa) no premia a los 135.
  const feria = factorAntelacion({ diasVista: 135, antelacionMediana: 150, muestra: 20, factorEvento: 1 }, { k: 1 })
  assert.equal(feria.factor, 1)
  assert.equal(feria.evaluado, true)
})

test('sin mediana medida se queda quieta, y lo DICE (no es «no hace falta premio»)', () => {
  const r = factorAntelacion({ diasVista: 200, antelacionMediana: null, muestra: 0 }, { k: 1 })
  assert.equal(r.factor, 1)
  assert.equal(r.evaluado, false)
  assert.match(r.motivo, /sin antelación medida/)
})

test('con muestra corta no se inventa una anticipación', () => {
  const r = factorAntelacion({ diasVista: 200, antelacionMediana: 30, muestra: 4 }, { k: 1 })
  assert.equal(r.factor, 1)
  assert.equal(r.evaluado, false)
  assert.match(r.motivo, /muestra insuficiente/)
})

test('las noches de evento quedan fuera: ya llevan su propio factor', () => {
  const r = factorAntelacion({ ...BASE, diasVista: 200, factorEvento: 1.55 }, { k: 1 })
  assert.equal(r.factor, 1)
  assert.equal(r.evaluado, true)
  assert.match(r.motivo, /evento/)
})

test('días vista inválidos no mueven el precio', () => {
  for (const diasVista of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = factorAntelacion({ ...BASE, diasVista }, { k: 1 })
    assert.equal(r.factor, 1)
    assert.equal(r.evaluado, false)
  }
})

test('una saturación mal configurada no dispara el premio', () => {
  const r = factorAntelacion({ ...BASE, diasVista: 300 }, { k: 1, saturacion: 1 })
  assert.equal(r.factor, 1)
  assert.equal(r.evaluado, false)
})

test('el tope no llega a la vuelta de la esquina: suelo de 60 días en la saturación', () => {
  // Busto Reform / Dúplex Center venden con 12 días de mediana. Sin suelo, 4×12 = día 48 → TODO el
  // calendario más allá de mes y medio quedaría al +25% fijo, que no es un premio por anticipación.
  const duplex = { antelacionMediana: 12, muestra: 30, factorEvento: 1 }
  const a30 = factorAntelacion({ ...duplex, diasVista: 30 }, { k: 1 }).factor
  const a48 = factorAntelacion({ ...duplex, diasVista: 48 }, { k: 1 }).factor
  const a60 = factorAntelacion({ ...duplex, diasVista: 60 }, { k: 1 }).factor

  assert.ok(a30 > 1.03 && a30 < 1.04, `a 30 días ~+3,5%, salió ${a30}`)
  assert.ok(a48 < 1.18, `a 48 días (4× la mediana) NO puede estar ya en el tope, salió ${a48}`)
  assert.equal(a60, 1.25)
})

test('un mes que se vende en 2 días tampoco topa el día 8', () => {
  const r = factorAntelacion({ diasVista: 8, antelacionMediana: 2, muestra: 12, factorEvento: 1 }, { k: 1 })
  assert.ok(r.factor < 1.02, `salió ${r.factor}`)
})

test('el suelo no toca a los pisos que ya venden con antelación', () => {
  // House en enero: 4×28 = 112 días, muy por encima del suelo → la curva no cambia.
  const conSuelo = factorAntelacion({ ...BASE, diasVista: 90 }, { k: 1 }).factor
  const sinSuelo = factorAntelacion({ ...BASE, diasVista: 90 }, { k: 1, saturacionMinDias: 0 }).factor
  assert.equal(conSuelo, sinSuelo)
})
