// Cepo de «carnés por titular» (`carnets-titulares.ts`): con varias fichas vinculadas el puente devuelve los
// carnés SEPARADOS por su ficha dueña, nunca cuelga uno de otra persona y deja de contestar `varias_fichas`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { agruparCarnetsPorTitular, fichasLegiblesDeCarnets } from './carnets-titulares.ts'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const AJENA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const ana = { id: A, nombre: 'Ana Pérez', tipoPersona: 'fisica' }
const blas = { id: B, nombre: 'Blas Gómez ', tipoPersona: null }
const empresa = { id: SL, nombre: 'Talleres Ana SL', tipoPersona: 'juridica' }

test('solo son legibles las fichas con vínculo que opera (gestionar/administrar); sin repetir ni vacías', () => {
  assert.deepEqual(
    fichasLegiblesDeCarnets([
      { clienteId: B, nivel: 'administrar' },
      { clienteId: ` ${A} `, nivel: 'gestionar' },
      { clienteId: A, nivel: 'gestionar' },
      { clienteId: '', nivel: 'gestionar' },
    ]),
    [A, B],
  )
  assert.deepEqual(fichasLegiblesDeCarnets([]), [])
})

test('🪤 el carné es dato de la persona: tarjeta, completo y niveles raros NO exponen la ficha', () => {
  assert.deepEqual(fichasLegiblesDeCarnets([{ clienteId: AJENA, nivel: 'tarjeta' }]), [])
  assert.deepEqual(fichasLegiblesDeCarnets([{ clienteId: AJENA, nivel: 'completo' }]), [])
  assert.deepEqual(fichasLegiblesDeCarnets([{ clienteId: AJENA, nivel: 'root' }, { clienteId: AJENA, nivel: '' }]), [])
  assert.deepEqual(
    fichasLegiblesDeCarnets([
      { clienteId: A, nivel: 'gestionar' },
      { clienteId: AJENA, nivel: 'completo' },
    ]),
    [A],
  )
})

test('🪤 dos fichas vinculadas → dos titulares, cada carné con SU dueña (A y B)', () => {
  const t = agruparCarnetsPorTitular(
    [ana, blas],
    [
      { clienteId: B, id: 'c-b', tipo: 'B', fechaCaducidad: '2030-01-01' },
      { clienteId: A, id: 'c-a2', tipo: 'A2', fechaCaducidad: '2031-05-05' },
      { clienteId: A, id: 'c-a1', tipo: 'B', fechaCaducidad: '2029-02-02' },
    ],
  )
  assert.deepEqual(t, [
    { fichaId: A, nombre: 'Ana Pérez', carnets: [
      { id: 'c-a1', tipo: 'B', fechaCaducidad: '2029-02-02' },
      { id: 'c-a2', tipo: 'A2', fechaCaducidad: '2031-05-05' },
    ] },
    { fichaId: B, nombre: 'Blas Gómez', carnets: [{ id: 'c-b', tipo: 'B', fechaCaducidad: '2030-01-01' }] },
  ])
})

test('🪤 un carné de una ficha NO leída (no vinculada / fusionada) se descarta, nunca se cuelga de otra', () => {
  const t = agruparCarnetsPorTitular([ana], [{ clienteId: AJENA, id: 'c-x', tipo: 'B', fechaCaducidad: '2030-01-01' }])
  assert.deepEqual(t, [{ fichaId: A, nombre: 'Ana Pérez', carnets: [] }])
})

test('la empresa sin carnés no es titular (persona + su SL se pinta como hoy); con carnés, sí cuenta', () => {
  assert.equal(agruparCarnetsPorTitular([ana, empresa], []).length, 1)
  const conCarne = agruparCarnetsPorTitular([ana, empresa], [{ clienteId: SL, id: 'c-sl', tipo: 'C', fechaCaducidad: '2030-01-01' }])
  assert.deepEqual(conCarne.map((x) => x.fichaId), [A, SL])
})

test('una ficha repetida no duplica titular', () => {
  assert.equal(agruparCarnetsPorTitular([ana, { ...ana }], []).length, 1)
})

test('🪤 el puente de carnés ya no contesta varias_fichas ni resuelve con fichaPropiaDe', () => {
  const src = readFileSync(new URL('./carnets-portal.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /'varias_fichas'/)
  assert.doesNotMatch(src, /fichaPropiaDe\(/)
  assert.match(src, /agruparCarnetsPorTitular\(/)
})
