import test from 'node:test'
import assert from 'node:assert/strict'
import { compararFichas, identidadFusion, revisarElecciones } from './fusion-fichas.ts'

const v = (valor: string | null, ilegible = false) => ({ valor, ilegible })

test('distinto solo cuando los dos tienen valor y no coincide', () => {
  const c = compararFichas(
    { nombre: v('PABLO JUAN'), apellidos: v('Guzmán Lozano'), direccion: v('CL SAN VICENTE, 40') },
    { nombre: v('Pablo'), apellidos: v('GUZMAN LOZANO'), direccion: v('Cl. San Vicente 40'), notas: v('lead web') },
  )
  const e = Object.fromEntries(c.map((x) => [x.grupo, x.estado]))
  assert.equal(e.nombre, 'distinto')
  assert.equal(e.apellidos, 'igual') // mayúsculas y tildes no piden elegir
  assert.equal(e.direccion, 'igual') // signos tampoco
  assert.equal(e.notas, 'solo_absorbida')
  assert.equal(e.fecha_nacimiento, 'igual') // los dos vacíos
})

test('un cifrado que no abre no se compara ni se da por igual', () => {
  const c = compararFichas({ cuenta_bancaria: v(null, true) }, { cuenta_bancaria: v('ES12…') })
  assert.equal(c.find((x) => x.grupo === 'cuenta_bancaria')!.estado, 'ilegible')
})

test('identidad: solo el DNI decide, y sin uno de los dos no se afirma nada', () => {
  assert.equal(identidadFusion('h1', 'h1'), 'mismo_dni')
  assert.equal(identidadFusion('h1', 'h2'), 'dni_distinto')
  assert.equal(identidadFusion('h1', null), 'sin_comprobar')
  assert.equal(identidadFusion(null, null), 'sin_comprobar')
})

test('solo se puede elegir donde hay dos valores distintos', () => {
  const c = compararFichas({ nombre: v('A'), notas: v('x') }, { nombre: v('B'), notas: v('x') })
  assert.deepEqual(revisarElecciones(['nombre'], c), { ok: true, deAbsorbida: ['nombre'] })
  assert.equal(revisarElecciones(['notas'], c).ok, false) // iguales: elegir no cambia nada
  assert.equal(revisarElecciones(['dni'], c).ok, false) // el DNI no se elige
  assert.deepEqual(revisarElecciones(undefined, c), { ok: true, deAbsorbida: [] })
})
