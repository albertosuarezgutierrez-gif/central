import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CATALOGO_MODULOS, MODULOS_PORTAL } from './modulos.ts'
import { MANUALES_MODULOS, manualDeModulo, modulosSinManual, rutaManual } from './manuales.ts'

test('TODO módulo del catálogo tiene su manual «Cómo funciona»', () => {
  for (const id of MODULOS_PORTAL) {
    assert.ok(MANUALES_MODULOS[id], `el módulo «${id}» no tiene manual en manuales.ts`)
    assert.equal(MANUALES_MODULOS[id].modulo, id)
    assert.ok(manualDeModulo(id), `manualDeModulo('${id}') devuelve null`)
  }
  assert.deepEqual(Object.keys(MANUALES_MODULOS).sort(), [...MODULOS_PORTAL].sort(), 'hay manuales de módulos que no están en el catálogo')
  assert.deepEqual(modulosSinManual(), [])
})

test('el cepo ve lo que dice ver: un módulo sin manual, o con uno vacío, se detecta', () => {
  const { alquileres: _quitado, ...sinUno } = MANUALES_MODULOS
  assert.deepEqual(modulosSinManual(sinUno), ['alquileres'])
  assert.deepEqual(modulosSinManual({ ...MANUALES_MODULOS, flota: { ...MANUALES_MODULOS.flota, empezar: [] } }), ['flota'])
  assert.deepEqual(modulosSinManual({ ...MANUALES_MODULOS, rrhh: { ...MANUALES_MODULOS.rrhh, queEs: '  ' } }), ['rrhh'])
})

test('Patrimonio y Flota trabajan por elemento (inmueble / vehículo); el resto, breve pero real', () => {
  assert.ok((MANUALES_MODULOS.alquileres.porElemento?.pasos.length ?? 0) >= 5)
  assert.ok((MANUALES_MODULOS.flota.porElemento?.pasos.length ?? 0) >= 5)
  for (const id of MODULOS_PORTAL) assert.ok(MANUALES_MODULOS[id].empezar.length >= 2)
})

test('el titular del manual coincide con el nombre del catálogo', () => {
  for (const id of MODULOS_PORTAL) assert.equal(MANUALES_MODULOS[id].titulo, CATALOGO_MODULOS[id].nombre)
})

test('un id que no es del catálogo no tiene manual', () => {
  assert.equal(manualDeModulo('nada'), null)
  assert.equal(manualDeModulo(undefined), null)
})

test('la ruta del manual cuelga de Herramientas y se escribe «Grupo ASegura»', () => {
  for (const id of MODULOS_PORTAL) assert.equal(rutaManual(id), `/herramientas/como-funciona/${id}`)
  const todo = JSON.stringify(MANUALES_MODULOS)
  assert.doesNotMatch(todo, /Grupo\s+(?!ASegura)[Aa]segura/)
  assert.doesNotMatch(todo, /\bGrupo ASEGURA\b/)
})
