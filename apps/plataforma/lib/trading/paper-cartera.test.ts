import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COHORTES_PAPER, COHORTE_ULTIMA, CARTERA_PAPER, DIAS_ENTRE_COHORTES } from './paper-cartera.ts'

// Guarda de integridad de las cohortes: al añadir una a mano cada ~mes es fácil colar una versión
// repetida, una fecha mal escrita o romper el orden. Estos invariantes lo evitan (fallan el build).

test('hay al menos una cohorte', () => {
  assert.ok(COHORTES_PAPER.length >= 1)
})

test('cada cohorte está bien formada', () => {
  for (const c of COHORTES_PAPER) {
    assert.match(c.fechaInicio, /^\d{4}-\d{2}-\d{2}$/, `fechaInicio ISO en ${c.version}`)
    assert.ok(!Number.isNaN(Date.parse(c.fechaInicio)), `fecha parseable en ${c.version}`)
    assert.ok(c.version.length > 0, 'version no vacía')
    assert.ok(c.benchmark.length > 0, 'benchmark no vacío')
    assert.ok(c.simbolos.length > 0, `cesta no vacía en ${c.version}`)
    // sin símbolos duplicados dentro de una cohorte (equiponderada → un duplicado la sesga)
    assert.equal(new Set(c.simbolos).size, c.simbolos.length, `símbolos únicos en ${c.version}`)
  }
})

test('las versiones de cohorte son únicas (clave de persistencia)', () => {
  const versiones = COHORTES_PAPER.map(c => c.version)
  assert.equal(new Set(versiones).size, versiones.length)
})

test('las cohortes van de más antigua a más reciente', () => {
  for (let i = 1; i < COHORTES_PAPER.length; i++) {
    assert.ok(
      Date.parse(COHORTES_PAPER[i].fechaInicio) >= Date.parse(COHORTES_PAPER[i - 1].fechaInicio),
      'orden por fechaInicio ascendente',
    )
  }
})

test('COHORTE_ULTIMA es la más reciente y CARTERA_PAPER la primera (compat)', () => {
  assert.equal(COHORTE_ULTIMA, COHORTES_PAPER[COHORTES_PAPER.length - 1])
  assert.equal(CARTERA_PAPER, COHORTES_PAPER[0])
})

test('la cadencia entre cohortes es un umbral razonable en días', () => {
  assert.ok(DIAS_ENTRE_COHORTES >= 7 && DIAS_ENTRE_COHORTES <= 92)
})
