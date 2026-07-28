// Prueba del parser contra los CUATRO correos reales del BOE (uno por variante
// de búsqueda guardada de Alberto). Es la red de seguridad frente al riesgo real
// del proyecto: que el BOE cambie el formato del correo y la ingesta se quede
// muda sin que nadie se entere. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearAlertaBoe } from '../src/email-boe.ts'
import { CORREOS_REALES } from './fixtures-reales.ts'

const todos = CORREOS_REALES.flatMap((c) => parsearAlertaBoe(c.html, c.asunto))

test('los 4 correos reales producen exactamente 4 subastas', () => {
  assert.equal(todos.length, 4)
  for (const r of todos) {
    assert.match(r.subasta.identificador ?? '', /^SUB-JA-2026-\d+$/)
    assert.equal(r.subasta.fuente, 'boe')
    assert.equal(r.subasta.tipo, 'judicial')
    assert.ok(r.subasta.url?.startsWith('https://subastas.boe.es/detalleSubasta.php'))
    assert.ok(r.subasta.fechaFin, 'toda alerta en curso trae fecha de conclusión')
  }
})

test('cada resultado lleva la búsqueda guardada que lo encontró', () => {
  assert.deepEqual(
    todos.map((r) => r.busqueda),
    ['INMUEBLE SEVILLA', 'PUNTA UMBRIA', 'ASTURIAS', 'PUERTO SANTAMARIA'],
  )
})

test('las fechas de cierre se parsean con su hora', () => {
  assert.deepEqual(
    todos.map((r) => r.subasta.fechaFin),
    [
      '2026-08-13T18:00:00.000Z',
      '2026-08-10T18:00:00.000Z',
      '2026-08-10T18:00:00.000Z',
      '2026-08-03T18:00:00.000Z',
    ],
  )
})

test('se extrae la referencia catastral cuando la descripción la trae', () => {
  const porId = new Map(todos.map((r) => [r.subasta.identificador, r]))
  // Asturias: en mayúsculas, embebida en el texto.
  assert.equal(porId.get('SUB-JA-2026-264269')?.refCatastral, 'L00400300QJ30C0001BU')
  // Puerto de Santa María: tras la etiqueta «Referencia Catastral:».
  assert.equal(porId.get('SUB-JA-2026-264154')?.refCatastral, '8342605QA4584A0006YM')
  // Sevilla no la publica en el correo.
  assert.equal(porId.get('SUB-JA-2026-264062')?.refCatastral, null)
})

test('las entidades HTML y los saltos de línea del BOE se limpian', () => {
  const puerto = todos.find((r) => r.subasta.identificador === 'SUB-JA-2026-264154')!
  const d = puerto.subasta.descripcion ?? ''
  assert.match(d, /El Puerto de Santa María/)   // &iacute; resuelto
  assert.match(d, /salón comedor/)              // &oacute; resuelto
  assert.match(d, /baño y cocina/)              // &ntilde; resuelto
  assert.doesNotMatch(d, /\n/, 'los saltos de línea del <dd> se colapsan')
  assert.doesNotMatch(d, /&[a-z]+;/, 'no queda ninguna entidad sin decodificar')
})

test('LA TRAMPA REAL: una descripción plantilla no permite afirmar que sea inmueble', () => {
  const punta = todos.find((r) => r.subasta.identificador === 'SUB-JA-2026-264600')!
  assert.match(punta.subasta.descripcion ?? '', /CERTIFICACIÓN DE CARGAS/)
  // El BOE manda ese texto cuando no publica la descripción del bien: no se
  // puede deducir nada de él, así que NO se afirma que sea un inmueble.
  assert.equal(punta.pareceInmueble, false)
  assert.equal(punta.refCatastral, null)
  // Las descripciones que sí traen datos sí se reconocen.
  assert.equal(todos.find((r) => r.subasta.identificador === 'SUB-JA-2026-264062')?.pareceInmueble, true)
  assert.equal(todos.find((r) => r.subasta.identificador === 'SUB-JA-2026-264269')?.pareceInmueble, true)
})

test('ninguna cifra se inventa: el correo del BOE no las trae', () => {
  for (const r of todos) {
    assert.equal(r.subasta.valorSubasta, null)
    assert.equal(r.subasta.tasacion, null)
    assert.equal(r.subasta.cargas, null)
    assert.equal(r.subasta.cargasConocidas, false)
  }
})
