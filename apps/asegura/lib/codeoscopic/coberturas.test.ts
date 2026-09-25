import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerOpcionesLegibles, leerCoberturas } from './coberturas.ts'

test('leerOpcionesLegibles: saca etiqueta y valor (ejemplo público Mapfre Hogar)', () => {
  const q = {
    formattedOptions: [
      { label: 'Alarma de agua conectada', formattedValue: 'No' },
      { label: 'Metros recinto', formattedValue: '0' },
      { label: 'sin valor' },
    ],
  }
  assert.deepEqual(leerOpcionesLegibles(q), [
    { etiqueta: 'Alarma de agua conectada', valor: 'No' },
    { etiqueta: 'Metros recinto', valor: '0' },
  ])
})

test('leerOpcionesLegibles: sin el campo es null (no se sabe), no [] (no hay)', () => {
  assert.equal(leerOpcionesLegibles({}), null)
  assert.deepEqual(leerOpcionesLegibles({ formattedOptions: [] }), [])
})

test('leerCoberturas: included ausente es null (ver texto), nunca false', () => {
  const r = leerCoberturas([
    { id: 1, name: 'Lunas', included: true },
    { id: 2, name: 'Vehículo de sustitución', included: false },
    { id: 3, name: 'Asistencia en viaje', text: 'Desde km 0' },
    { id: 4 },
  ])
  assert.deepEqual(r, [
    { nombre: 'Lunas', incluida: true, texto: null },
    { nombre: 'Vehículo de sustitución', incluida: false, texto: null },
    { nombre: 'Asistencia en viaje', incluida: null, texto: 'Desde km 0' },
  ])
  assert.deepEqual(leerCoberturas({ items: [{ name: 'Robo', included: true }] }), [
    { nombre: 'Robo', incluida: true, texto: null },
  ])
})
