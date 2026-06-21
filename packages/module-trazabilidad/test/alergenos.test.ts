import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarAlergenos, alergenosElaboracion } from '../src/alergenos.ts'
import type { ElaboracionTraza } from '../src/types.ts'

test('detecta gluten en tortillas de trigo', () => {
  assert.deepEqual(detectarAlergenos('tortillas de trigo'), ['gluten'])
})

test('detecta huevos en mayonesa/alioli', () => {
  assert.ok(detectarAlergenos('MAYONESA').includes('huevos'))
  assert.ok(detectarAlergenos('alioli').includes('huevos'))
})

test('detecta lácteos en queso de cabra', () => {
  assert.ok(detectarAlergenos('QUESO DE CABRA').includes('lacteos'))
})

test('detecta pescado en mojama y atún', () => {
  assert.ok(detectarAlergenos('TAQUITOS DE MOJAMA').includes('pescado'))
  assert.ok(detectarAlergenos('atún rojo').includes('pescado'))
})

test('detecta cacahuetes', () => {
  assert.deepEqual(detectarAlergenos('cacahuetes repelados fritos'), ['cacahuetes'])
})

test('ignora tildes y mayúsculas (normaliza)', () => {
  assert.deepEqual(detectarAlergenos('MOSTAZA'), ['mostaza'])
  assert.ok(detectarAlergenos('Sésamo').includes('sesamo'))
})

test('texto sin alérgenos conocidos → vacío', () => {
  assert.deepEqual(detectarAlergenos('agua mineral'), [])
})

test('alergenosElaboracion une nombre + ingredientes + sub-elaboraciones, en orden estable y sin duplicados', () => {
  const e: ElaboracionTraza = {
    id: 'x',
    nombre: 'Antojito de queso de cabra',
    ubicaciones: [],
    depende_de: ['MEDALLÓN caramelizado', 'QUESO DE CABRA'],
    ingredientes: [{ nombre: 'tortillas de trigo' }],
    controles: [],
  }
  const al = alergenosElaboracion(e)
  assert.ok(al.includes('gluten'))   // de las tortillas
  assert.ok(al.includes('lacteos')) // del queso (nombre + sub)
  // sin duplicados
  assert.equal(new Set(al).size, al.length)
  // orden estable: gluten antes que lacteos según el catálogo
  assert.ok(al.indexOf('gluten') < al.indexOf('lacteos'))
})
