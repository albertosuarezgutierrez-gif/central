import assert from 'node:assert/strict'
import test from 'node:test'

import { BIEN_VACIO, bienTieneAlgo, describirBien } from './bien-asegurado.ts'
import { camposVisibles } from './acceso.ts'
import { camposDeAlcance } from './autorizacion.ts'

test('un vehículo sale como marca, modelo y matrícula, y sin ubicación', () => {
  const b = describirBien('auto', { marca: 'SEAT', modelo: 'Ibiza', matricula: '1234ABC' })
  assert.equal(b.cosa, 'SEAT Ibiza · 1234ABC')
  assert.equal(b.ubicacion, null)
})

test('un inmueble sale como dirección + CP + localidad, y NUNCA como `cosa`', () => {
  const b = describirBien('hogar', { direccion: 'Calle Falsa 1', cp: '41003', localidad: 'Sevilla' })
  assert.equal(b.ubicacion, 'Calle Falsa 1, 41003 Sevilla')
  // 🚨 El cepo: si la dirección se colase por `cosa`, la vería un tercero con
  // el alcance más bajo, porque `bien` es visible desde `tarjeta`.
  assert.equal(b.cosa, null)
})

test('la dirección de un inmueble NO la ve un tercero de una persona física', () => {
  for (const alcance of ['ver', 'ver_economico'] as const) {
    const ve = camposDeAlcance(alcance, 'fisica')
    assert.equal(ve.direccionRiesgo, false, `${alcance} abría la dirección`)
  }
})

test('pero la de una SOCIEDAD sí, desde `ver_economico`', () => {
  assert.equal(camposDeAlcance('ver_economico', 'juridica').direccionRiesgo, true)
})

test('la identificación de la COSA se ve desde el nivel más bajo', () => {
  // El conductor de la furgoneta tiene que saber cuál es la furgoneta.
  assert.equal(camposVisibles('tarjeta').bien, true)
  assert.equal(camposVisibles('tarjeta').direccionRiesgo, false)
  assert.equal(camposVisibles('completo').direccionRiesgo, true)
})

test('las claves internas del volcado (`_algo`) no se leen jamás', () => {
  const b = describirBien('hogar', { _avant: 'REF-INTERNA-9', direccion: 'Calle Falsa 1' })
  assert.equal(b.ubicacion, 'Calle Falsa 1')
  assert.ok(!JSON.stringify(b).includes('REF-INTERNA-9'))
})

test('los valores de cajón se anulan, no se pintan', () => {
  for (const v of ['', '   ', 'n/a', 'no consta', 'desconocido', 'pendiente']) {
    const b = describirBien('auto', { marca: v, modelo: v, matricula: v })
    assert.equal(b.cosa, null, `«${v}» se coló como matrícula`)
  }
})

test('un jsonb que no es un objeto no revienta: sale vacío', () => {
  for (const v of [null, undefined, 42, 'texto', ['a'], true]) {
    assert.deepEqual(describirBien('auto', v), BIEN_VACIO)
  }
})

test('un ramo sin bien descriptible calla, no dice «no tiene»', () => {
  const b = describirBien('vida', {})
  assert.equal(bienTieneAlgo(b), false)
})

test('los metros y el año solo salen si son creíbles', () => {
  assert.deepEqual(describirBien('hogar', { metrosCuadrados: 0, anioConstruccion: 1 }).detalles, [])
  assert.deepEqual(describirBien('hogar', { metrosCuadrados: 92, anioConstruccion: 1975 }).detalles, [
    '92 m²',
    'Construido en 1975',
  ])
})

test('el ramo desconocido se resuelve por las CLAVES, no se pierde', () => {
  // Un ramo que no esté en las dos listas pero traiga matrícula sigue siendo un
  // vehículo: el catálogo de ramos crece y este fichero no puede quedarse atrás
  // en silencio.
  assert.equal(describirBien('lo-que-sea', { matricula: '1234ABC' }).cosa, '1234ABC')
  assert.equal(describirBien('lo-que-sea', { direccion: 'Calle Falsa 1' }).ubicacion, 'Calle Falsa 1')
})
