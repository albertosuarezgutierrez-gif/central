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
  const d = (hash: string | null, tieneDni = hash !== null) => ({ hash, tieneDni })
  assert.equal(identidadFusion(d('h1'), d('h1')), 'mismo_dni')
  assert.equal(identidadFusion(d('h1'), d('h2')), 'dni_distinto')
  assert.equal(identidadFusion(d('h1'), d(null, false)), 'sin_comprobar')
  assert.equal(identidadFusion(d(null, false), d(null, false)), 'sin_comprobar')
  // Las dos con DNI y a una le falta el índice: podrían ser padre e hijo.
  assert.equal(identidadFusion(d('h1'), d(null, true)), 'dni_sin_indice')
})

test('una cuenta enmascarada se compara por su valor completo', () => {
  const c = compararFichas(
    { cuenta_bancaria: { valor: '•••• 1234', ilegible: false, clave: 'ES1100001234' } },
    { cuenta_bancaria: { valor: '•••• 1234', ilegible: false, clave: 'ES9900001234' } },
  )
  assert.equal(c.find((x) => x.grupo === 'cuenta_bancaria')!.estado, 'distinto')
})

test('solo se puede elegir donde hay dos valores distintos', () => {
  const c = compararFichas({ nombre: v('A'), notas: v('x') }, { nombre: v('B'), notas: v('x') })
  assert.deepEqual(revisarElecciones(['nombre'], c), { ok: true, deAbsorbida: ['nombre'] })
  assert.equal(revisarElecciones(['notas'], c).ok, false) // iguales: elegir no cambia nada
  assert.equal(revisarElecciones(['dni'], c).ok, false) // el DNI no se elige
  assert.deepEqual(revisarElecciones(undefined, c), { ok: true, deAbsorbida: [] })
})
