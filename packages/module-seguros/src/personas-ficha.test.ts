import test from 'node:test'
import assert from 'node:assert/strict'
import { unificarPersonas, saleEnPolizas, type VinculoUnible } from './personas-ficha.ts'
import type { PersonaDePolizas } from './intervinientes.ts'

const persona = (p: Partial<PersonaDePolizas>): PersonaDePolizas => ({
  clave: 'k',
  nombre: 'Juan Pérez',
  nombreIlegible: false,
  fichaId: null,
  telefono: null,
  email: null,
  papeles: [{ rol: 'conductor', polizas: ['2922BNJ'] }],
  relacionDeclarada: null,
  homonimia: null,
  ...p,
})

type V = VinculoUnible & { autoriza?: boolean }
const vinculo = (v: Partial<V>): V => ({ relacionadoId: 'f1', nombre: 'Juan Pérez', tipo: 'Administración', ...v })

test('la misma persona en las dos fuentes es UNA fila, con sus dos caras', () => {
  const { lista } = unificarPersonas([persona({ clave: 'k1', fichaId: 'f1', telefono: '600111222' })], [vinculo({})])
  assert.equal(lista.length, 1)
  assert.equal(lista[0].fichaId, 'f1')
  assert.equal(lista[0].telefono, '600111222')
  assert.equal(lista[0].papeles.length, 1, 'lo que dice CIMA se conserva')
  assert.equal(lista[0].vinculo?.tipo, 'Administración', 'lo que hemos anotado también')
})

test('🚨 dos fichas DISTINTAS con el mismo nombre no se funden jamás', () => {
  const { lista } = unificarPersonas(
    [persona({ clave: 'k1', fichaId: 'f1', telefono: '600111222', homonimia: 'distinta_persona' })],
    [vinculo({ relacionadoId: 'f2', nombre: 'Juan Pérez' })],
  )
  assert.equal(lista.length, 2)
  assert.deepEqual(lista.map((p) => p.fichaId), ['f1', 'f2'])
  assert.equal(lista[0].vinculo, null, 'el vínculo de f2 no se le cuelga a f1 por llamarse igual')
})

test('🚨 una persona SIN ficha no se funde con un vínculo del mismo nombre', () => {
  const { lista } = unificarPersonas([persona({ clave: 'k1', fichaId: null })], [vinculo({ relacionadoId: 'f9' })])
  assert.equal(lista.length, 2)
  assert.equal(lista[0].fichaId, null)
  assert.equal(lista[0].vinculo, null)
  assert.equal(lista[1].fichaId, 'f9')
})

test('un vínculo que no sale en ninguna póliza se anexa al final, sin inventarle contacto', () => {
  const { lista } = unificarPersonas(
    [persona({ clave: 'k1', fichaId: 'f1' })],
    [vinculo({ relacionadoId: 'f1' }), vinculo({ relacionadoId: 'f2', nombre: 'María' })],
  )
  assert.deepEqual(lista.map((p) => p.nombre), ['Juan Pérez', 'María'])
  assert.equal(lista[1].papeles.length, 0)
  assert.equal(lista[1].telefono, null)
  assert.equal(saleEnPolizas(lista[0]), true)
  assert.equal(saleEnPolizas(lista[1]), false)
})

test('se conserva el orden de las personas de pólizas y los vínculos sueltos van detrás', () => {
  const { lista } = unificarPersonas(
    [persona({ clave: 'a', fichaId: 'fa', nombre: 'A' }), persona({ clave: 'b', fichaId: null, nombre: 'B' })],
    [vinculo({ relacionadoId: 'fz', nombre: 'Z' }), vinculo({ relacionadoId: 'fa', nombre: 'A' })],
  )
  assert.deepEqual(lista.map((p) => p.nombre), ['A', 'B', 'Z'])
})

test('«no se ha podido leer» no se convierte en «no hay»', () => {
  const a = unificarPersonas(null, [vinculo({})])
  assert.equal(a.sinLeerPolizas, true)
  assert.equal(a.sinLeerVinculos, false)
  assert.equal(a.lista.length, 1, 'lo que sí se pudo leer se sigue enseñando')

  const b = unificarPersonas([persona({ clave: 'k1', fichaId: 'f1' })], null)
  assert.equal(b.sinLeerPolizas, false)
  assert.equal(b.sinLeerVinculos, true)
  assert.equal(b.lista[0].vinculo, null)

  const c = unificarPersonas(null, null)
  assert.deepEqual(c, { lista: [], sinLeerPolizas: true, sinLeerVinculos: true })
})

test('un vínculo repetido no duplica la fila', () => {
  const { lista } = unificarPersonas([], [vinculo({ relacionadoId: 'f1' }), vinculo({ relacionadoId: 'f1', tipo: 'Empleado/a' })])
  assert.equal(lista.length, 1)
  assert.equal(lista[0].vinculo?.tipo, 'Administración', 'gana el primero, no se mezclan dos tipos')
})

test('la clave es estable y única por fila', () => {
  const { lista } = unificarPersonas(
    [persona({ clave: 'k1', fichaId: 'f1' }), persona({ clave: 'k2', fichaId: null })],
    [vinculo({ relacionadoId: 'f3', nombre: 'Otra' })],
  )
  assert.deepEqual(lista.map((p) => p.clave), ['f1', 'k2', 'f3'])
  assert.equal(new Set(lista.map((p) => p.clave)).size, 3)
})
