// Tests del parser BORME. Runner: `node --test` (Node 22, type-stripping nativo).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarActo, normalizarEmpresa, parseAnuncio } from './borme.ts'

test('clasificarActo detecta concurso', () => {
  assert.equal(clasificarActo('Declaración de concurso de acreedores'), 'concurso')
})
test('clasificarActo detecta disolución/extinción', () => {
  assert.equal(clasificarActo('Disolución. Extinción'), 'disolucion')
})
test('clasificarActo detecta ampliación de capital', () => {
  assert.equal(clasificarActo('Ampliación de capital. Suscripción'), 'ampliacion_capital')
})
test('clasificarActo: nombramientos → cese; genérico → otro', () => {
  assert.equal(clasificarActo('Nombramientos. Administrador único'), 'cese')
  assert.equal(clasificarActo('Datos registrales'), 'otro')
})

test('normalizarEmpresa: mayúsculas sin puntuación ni forma societaria', () => {
  assert.equal(normalizarEmpresa('Talleres López, S.L.'), 'TALLERES LOPEZ')
  assert.equal(normalizarEmpresa('Construcciones Pepe S.A.U.'), 'CONSTRUCCIONES PEPE')
})

test('parseAnuncio: un anuncio con varios actos → varios eventos con dedupeKey', () => {
  const evs = parseAnuncio(
    { titulo: 'Talleres López SL', provincia: 'Sevilla', id: 'B-123', url: 'http://x', actos: ['Declaración de concurso', 'Datos registrales'] },
    '2026-07-15',
  )
  assert.equal(evs.length, 2)
  const concurso = evs.find((e) => e.tipo === 'concurso')!
  assert.ok(concurso)
  assert.equal(concurso.empresaNorm, 'TALLERES LOPEZ')
  assert.equal(concurso.provincia, 'Sevilla')
  assert.equal(concurso.fecha, '2026-07-15')
  assert.ok(concurso.dedupeKey.includes('concurso'))
  assert.ok(concurso.dedupeKey.length > 0)
})

test('parseAnuncio: sin nombre de empresa → sin eventos', () => {
  assert.equal(parseAnuncio({ actos: ['Concurso'] }, '2026-07-15').length, 0)
})
