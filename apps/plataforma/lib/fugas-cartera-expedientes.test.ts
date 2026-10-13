import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expedientesAutoFallidos } from './fugas-cartera.ts'

// El paso de expedientes automáticos es la única vía de las renovaciones a «Mi mesa» (13/10/2026):
// su fallo tiene que llegar al latido. `null` EXPLÍCITO = falló; clave ausente = asegura viejo (no se sabe, no se grita).
test('null explícito en expedientesAbiertos o expedientesCerrados = el paso falló', () => {
  assert.equal(expedientesAutoFallidos({ expedientesAbiertos: null, expedientesCerrados: null }), true)
  assert.equal(expedientesAutoFallidos({ expedientesAbiertos: 2, expedientesCerrados: null }), true)
  assert.equal(expedientesAutoFallidos({ expedientesAbiertos: null, expedientesCerrados: 0 }), true)
})

test('con números (también 0) no ha fallado; sin la clave tampoco se afirma un fallo', () => {
  assert.equal(expedientesAutoFallidos({ expedientesAbiertos: 0, expedientesCerrados: 0 }), false)
  assert.equal(expedientesAutoFallidos({}), false)
})
