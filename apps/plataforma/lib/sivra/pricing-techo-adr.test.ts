import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarTechoAdr, HOLGURA_ADR, MIN_NOCHES_ADR, UMBRAL_EVENTO,
} from './pricing-techo-adr.ts'

test('recorta el objetivo que se aleja del ADR probado', () => {
  // Busto: ADR real ~84€ guest. Con el motor pidiendo 244€ el techo muerde.
  const r = aplicarTechoAdr({ objetivo: 244, adrBase: 84, nochesMuestra: 211 })
  assert.equal(r.motivo, 'aplicado')
  assert.equal(r.techo, Math.round(84 * HOLGURA_ADR))
  assert.equal(r.objetivo, Math.round(84 * HOLGURA_ADR))
})

test('no toca el objetivo que ya está en su sitio', () => {
  // House: pide 566 con ADR 560 → dentro de la holgura, no debe moverse.
  const r = aplicarTechoAdr({ objetivo: 566, adrBase: 560, nochesMuestra: 210 })
  assert.equal(r.motivo, 'no_muerde')
  assert.equal(r.objetivo, 566)
})

test('el límite exacto de la holgura no muerde', () => {
  const techo = Math.round(100 * HOLGURA_ADR)
  assert.equal(aplicarTechoAdr({ objetivo: techo, adrBase: 100, nochesMuestra: 100 }).motivo, 'no_muerde')
  assert.equal(aplicarTechoAdr({ objetivo: techo + 1, adrBase: 100, nochesMuestra: 100 }).motivo, 'aplicado')
})

// ── Las tres condiciones de seguridad ────────────────────────────────────────────────────────

test('una fecha de EVENTO no se juzga con el histórico del mes', () => {
  // 20/02/2027, Maratón de Sevilla: el mercado sube x2,5 y el motor le sigue bien.
  const r = aplicarTechoAdr({ objetivo: 1193, adrBase: 400, nochesMuestra: 210, factorEvento: 1.5 })
  assert.equal(r.motivo, 'evento')
  assert.equal(r.techo, null)
  assert.equal(r.objetivo, 1193, 'el precio de evento no se toca')
})

test('el umbral de evento es el mismo que usa el resto del motor', () => {
  assert.equal(aplicarTechoAdr({ objetivo: 500, adrBase: 100, nochesMuestra: 100, factorEvento: UMBRAL_EVENTO }).motivo, 'evento')
  // Justo por debajo del umbral SÍ se juzga: un día casi normal es un día normal.
  assert.equal(aplicarTechoAdr({ objetivo: 500, adrBase: 100, nochesMuestra: 100, factorEvento: 1.14 }).motivo, 'aplicado')
})

test('sin muestra suficiente NO hay techo, y se dice', () => {
  const r = aplicarTechoAdr({ objetivo: 500, adrBase: 100, nochesMuestra: MIN_NOCHES_ADR - 1 })
  assert.equal(r.motivo, 'sin_muestra')
  assert.equal(r.techo, null)
  assert.equal(r.objetivo, 500, 'sin saber, no se recorta')
})

test('sin ADR tampoco se inventa un techo', () => {
  for (const adr of [null, 0, Number.NaN]) {
    const r = aplicarTechoAdr({ objetivo: 500, adrBase: adr as number | null, nochesMuestra: 300 })
    assert.equal(r.motivo, 'sin_muestra', `adr=${adr}`)
    assert.equal(r.objetivo, 500)
  }
})

test('el techo NUNCA perfora el suelo del piso', () => {
  // ADR bajísimo (mes flojo) contra un suelo de coste: manda el suelo.
  const r = aplicarTechoAdr({ objetivo: 90, adrBase: 40, nochesMuestra: 100, suelo: 65 })
  assert.equal(r.motivo, 'suelo_manda')
  assert.equal(r.objetivo, 90, 'el objetivo ya estaba por encima del suelo: no se toca')
  assert.equal(r.techo, 65)
})

test('con suelo por encima, un objetivo por debajo sube al suelo', () => {
  const r = aplicarTechoAdr({ objetivo: 50, adrBase: 40, nochesMuestra: 100, suelo: 65 })
  assert.equal(r.motivo, 'suelo_manda')
  assert.equal(r.objetivo, 65)
})

test('un suelo por debajo del techo no estorba', () => {
  const r = aplicarTechoAdr({ objetivo: 244, adrBase: 84, nochesMuestra: 211, suelo: 65 })
  assert.equal(r.motivo, 'aplicado')
  assert.equal(r.objetivo, Math.round(84 * HOLGURA_ADR))
})

test('la holgura es configurable sin tocar el módulo', () => {
  const r = aplicarTechoAdr({ objetivo: 300, adrBase: 100, nochesMuestra: 100, holgura: 2 })
  assert.equal(r.techo, 200)
  assert.equal(r.objetivo, 200)
})
