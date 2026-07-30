import assert from 'node:assert/strict'
import { test } from 'node:test'
import { esPlayaHuelva } from '../src/playa.ts'
import { analisisDocumental } from '../src/analisis.ts'
import type { SubastaInmueble } from '../src/types.ts'

test('playa Huelva por municipio (con y sin tildes)', () => {
  assert.ok(esPlayaHuelva('PUNTA UMBRÍA'))
  assert.ok(esPlayaHuelva('Isla Cristina'))
  assert.ok(esPlayaHuelva('LEPE'))
  assert.equal(esPlayaHuelva('SEVILLA'), false)
  assert.equal(esPlayaHuelva('HUELVA'), false) // la capital no es la costa que busca
})

test('playa Huelva por núcleo citado en la descripción (Matalascañas es Almonte)', () => {
  assert.ok(esPlayaHuelva(null, 'URBANA. Apartamento en MATALASCAÑAS, sector M.'))
  assert.ok(esPlayaHuelva(null, 'Vivienda en LA ANTILLA, término de Lepe', 'HUELVA'))
  assert.ok(esPlayaHuelva(null, 'Adosado en EL ROMPIDO'))
  // Municipio costero citado en texto pero provincia contradictoria: NO
  assert.equal(esPlayaHuelva(null, 'calle Ayamonte 3', 'SEVILLA'), false)
})

function base(extra: Partial<SubastaInmueble> = {}): SubastaInmueble {
  return {
    dedupeKey: 'X', fuente: 'boe', tipo: 'judicial',
    situacionPosesoria: 'desconocida', cargasConocidas: false,
    refCatastral: '1234567AB1234C0001XX', tasacion: 100000,
    ...extra,
  }
}

test('semáforo rojo: ocupada, proindiviso o cargas vivas', () => {
  assert.equal(analisisDocumental(base({ situacionPosesoria: 'ocupada' }), '').semaforo, 'rojo')
  assert.equal(analisisDocumental(base({ porcentajeSubastado: 50 }), '').semaforo, 'rojo')
  assert.equal(analisisDocumental(base({ cargasConocidas: true, cargas: 20000 }), '').semaforo, 'rojo')
})

test('semáforo verde: libre, sin cargas subsistentes, docs procesados, con tasación y RC', () => {
  const a = analisisDocumental(
    base({ situacionPosesoria: 'libre', cargasConocidas: true, cargas: 0 }),
    '',
  )
  assert.equal(a.semaforo, 'verde')
})

test('semáforo ámbar: posesión desconocida o documentos sin procesar', () => {
  const a = analisisDocumental(base({ cargasConocidas: true, cargas: 0 }), null)
  assert.equal(a.semaforo, 'ambar')
  const claves = a.puntos.map((p) => p.clave)
  assert.ok(claves.includes('documentacion'))
  assert.ok(claves.includes('posesion'))
})

test('herencia yacente y vivienda habitual del edicto suman puntos ámbar', () => {
  const notas = '⚖️ Ejecución contra herencia yacente (titular fallecido)\nVivienda habitual del demandado: SÍ'
  const a = analisisDocumental(base({ situacionPosesoria: 'libre', cargasConocidas: true, cargas: 0 }), notas)
  const claves = a.puntos.map((p) => p.clave)
  assert.ok(claves.includes('herencia'))
  assert.ok(claves.includes('vivienda_habitual'))
  assert.equal(a.semaforo, 'ambar')
})

test('«no consta» de vivienda habitual NO cuenta como vivienda habitual', () => {
  const a = analisisDocumental(
    base({ situacionPosesoria: 'libre', cargasConocidas: true, cargas: 0 }),
    'Vivienda habitual del demandado: no consta',
  )
  assert.equal(a.puntos.some((p) => p.clave === 'vivienda_habitual'), false)
})

test('anotación de embargo en la certificación suma punto ámbar (no queda verde tapado)', () => {
  const notas = 'Certificación: sin cargas de procedencia registradas\n⚠️ Certificación: anotación de EMBARGO — revisar importe, vigencia y si es posterior (se cancelaría)'
  const a = analisisDocumental(base({ situacionPosesoria: 'libre', cargasConocidas: true, cargas: 0 }), notas)
  assert.ok(a.puntos.some((p) => p.clave === 'embargo' && p.nivel === 'ambar'))
  assert.equal(a.semaforo, 'ambar')
})

test('sin tasación ni valor de referencia → punto de valoración', () => {
  const a = analisisDocumental(base({ tasacion: null }), '')
  assert.ok(a.puntos.some((p) => p.clave === 'valoracion'))
})
