// Cepo de «carnés por titular» en el portal (`carnets-titulares.ts`): con varias fichas vinculadas los carnés
// llegan SEPARADOS y, hacia la campana y la precarga, cada uno con el nombre de su titular; nunca se
// convierte un «no se ha podido mirar» en «no tienes carné».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { carnetsParaAviso, interpretarCarnets } from './carnets-titulares.ts'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const cA = { id: 'c-a', tipo: 'B', fechaCaducidad: '2030-01-01' }
const cB = { id: 'c-b', tipo: 'A2', fechaCaducidad: '2031-01-01' }

test('🪤 varios titulares: cada carné con SU titular, separados', () => {
  const t = interpretarCarnets(200, {
    estado: 'varios_titulares',
    titulares: [
      { fichaId: A, nombre: 'Ana Pérez', carnets: [cA] },
      { fichaId: B, nombre: 'Blas Gómez', carnets: [cB, { id: 'roto' }] },
    ],
  })
  assert.deepEqual(t, [
    { fichaId: A, nombre: 'Ana Pérez', carnets: [cA] },
    { fichaId: B, nombre: 'Blas Gómez', carnets: [cB] },
  ])
  assert.deepEqual(carnetsParaAviso(t!), [
    { ...cA, titular: 'Ana Pérez' },
    { ...cB, titular: 'Blas Gómez' },
  ])
})

test('un solo titular: «tu carné» como siempre (sin nombre), con el puente nuevo y con el anterior', () => {
  const nuevo = interpretarCarnets(200, { estado: 'ok', carnets: [cA], titulares: [{ fichaId: A, nombre: 'Ana Pérez', carnets: [cA] }] })
  assert.deepEqual(carnetsParaAviso(nuevo!), [{ ...cA, titular: null }])
  const viejo = interpretarCarnets(200, { estado: 'ok', carnets: [cA] })
  assert.deepEqual(carnetsParaAviso(viejo!), [{ ...cA, titular: null }])
})

test('entre varios, un titular sin nombre visible NO pasa a ser «tu carné»', () => {
  const t = interpretarCarnets(200, { estado: 'varios_titulares', titulares: [{ fichaId: A, nombre: 'Ana', carnets: [] }, { fichaId: B, nombre: ' ', carnets: [cB] }] })
  assert.deepEqual(carnetsParaAviso(t!), [{ ...cB, titular: 'otra ficha vinculada' }])
})

test('🚨 no se ha podido mirar → null (nunca []): error, puente viejo con varias_fichas, forma rara, titular sin dueño', () => {
  assert.equal(interpretarCarnets(503, { estado: 'error', causa: 'fecha_nacimiento_ilegible' }), null)
  assert.equal(interpretarCarnets(409, { estado: 'varias_fichas' }), null)
  assert.equal(interpretarCarnets(200, null), null)
  assert.equal(interpretarCarnets(200, { estado: 'varios_titulares' }), null)
  assert.equal(interpretarCarnets(200, { estado: 'varios_titulares', titulares: [{ nombre: 'Ana', carnets: [cA] }] }), null)
  assert.equal(interpretarCarnets(500, { estado: 'ok', carnets: [cA] }), null)
})

test('sin_ficha = mirado, no hay ficha: []', () => {
  assert.deepEqual(interpretarCarnets(409, { estado: 'sin_ficha' }), [])
})

test('🚨 estado no reconocido (2xx) → null, nunca []: un estado nuevo del puente no se lee como «mirado, no hay»', () => {
  assert.equal(interpretarCarnets(200, { estado: 'error' }), null)
  assert.equal(interpretarCarnets(200, { estado: 'estado_nuevo_del_puente', carnets: [cA] }), null)
  assert.equal(interpretarCarnets(200, { estado: 42 }), null)
  assert.equal(interpretarCarnets(200, {}), null)
})
