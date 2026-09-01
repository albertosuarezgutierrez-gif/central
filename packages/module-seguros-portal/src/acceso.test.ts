import test from 'node:test'
import assert from 'node:assert/strict'
import { camposVisibles, NIVELES, type Nivel } from './acceso.ts'

test('el tomador ve prima e IBAN', () => {
  const v = camposVisibles('completo')
  assert.equal(v.prima, true)
  assert.equal(v.iban, true)
})

test('el conductor ve el teléfono de siniestros pero NUNCA la prima ni el IBAN', () => {
  const v = camposVisibles('tarjeta')
  assert.equal(v.telefonoSiniestros, true)
  assert.equal(v.compania, true)
  assert.equal(v.numeroPoliza, true)
  assert.equal(v.prima, false)
  assert.equal(v.iban, false)
  assert.equal(v.dniTomador, false)
})

test('«tarjeta» puede abrir un parte: es el caso del empleado en la cuneta', () => {
  assert.equal(camposVisibles('tarjeta').abrirParte, true)
})

test('solo «administrar» puede autorizar a terceros', () => {
  assert.equal(camposVisibles('administrar').autorizarTerceros, true)
  assert.equal(camposVisibles('gestionar').autorizarTerceros, false)
  assert.equal(camposVisibles('completo').autorizarTerceros, false)
  assert.equal(camposVisibles('tarjeta').autorizarTerceros, false)
})

test('los niveles son crecientes: lo que ve uno lo ve el siguiente', () => {
  const orden: Nivel[] = ['tarjeta', 'completo', 'gestionar', 'administrar']
  for (let i = 1; i < orden.length; i++) {
    const menor = camposVisibles(orden[i - 1])
    const mayor = camposVisibles(orden[i])
    for (const k of Object.keys(menor) as (keyof typeof menor)[]) {
      if (menor[k]) assert.equal(mayor[k], true, `${orden[i]} deberia ver ${k} porque ${orden[i - 1]} lo ve`)
    }
  }
})

test('NIVELES enumera exactamente los cuatro, en orden creciente', () => {
  assert.deepEqual([...NIVELES], ['tarjeta', 'completo', 'gestionar', 'administrar'])
})
