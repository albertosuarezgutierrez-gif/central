import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoCivilAPersistir } from './estado-civil-cotizador-ficha.ts'

// Catálogo SINTÉTICO.
const CIVILES = [{ id: 'Single', nombre: 'Soltero' }, { id: 'Married', nombre: 'Casado' }, { id: 'Other', nombre: 'Otro' }]
const base = { precargado: null, precalificado: true, catalogo: CIVILES }

test('ficha sin estado civil (o que no casa) + opción del catálogo → se guarda; el primero, «solo si no casa»', () => {
  assert.deepEqual(estadoCivilAPersistir({ ...base, elegidoId: 'Married' }), { estadoCivil: 'Married', soloSiNoCasa: true })
  // Corregir lo que acabamos de guardar en esta pantalla: sin la guarda (es nuestro propio dato).
  assert.deepEqual(estadoCivilAPersistir({ ...base, elegidoId: 'Single', yaGuardadoId: 'Married' }), { estadoCivil: 'Single', soloSiNoCasa: false })
})

test('nunca se guarda: ficha que ya casa, sin precalificar, empresa, vacío, fuera de catálogo, cajón o repetido', () => {
  assert.equal(estadoCivilAPersistir({ ...base, precargado: CIVILES[1], elegidoId: 'Single' }), null, 'la ficha ya lo tiene: no se pisa')
  assert.equal(estadoCivilAPersistir({ ...base, precalificado: false, elegidoId: 'Married' }), null, 'no se sabe qué tiene la ficha')
  assert.equal(estadoCivilAPersistir({ ...base, empresa: true, elegidoId: 'Married' }), null)
  assert.equal(estadoCivilAPersistir({ ...base, elegidoId: '' }), null)
  assert.equal(estadoCivilAPersistir({ ...base, elegidoId: 'Widowed' }), null)
  assert.equal(estadoCivilAPersistir({ ...base, elegidoId: 'Other' }), null, 'valor de cajón')
  assert.equal(estadoCivilAPersistir({ ...base, elegidoId: 'Married', yaGuardadoId: 'Married' }), null)
})
