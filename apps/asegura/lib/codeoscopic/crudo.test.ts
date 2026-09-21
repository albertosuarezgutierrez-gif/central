// Cepos de `crudo.ts`. Lo que vigilan no es el formato del resumen: es que el
// resumen no pueda AFIRMAR una ausencia que no ha medido — que es justo el
// error que se quiere evitar al preguntarle al vendor si manda años.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resumirCrudo, extraerLista, MUESTRA } from './crudo.ts'

test('`claves` es la UNIÓN de todas las entradas, no las de la primera', () => {
  // El campo que decide (`yearFrom`) lo trae UNA de tres versiones. Con las
  // claves de la primera entrada desaparecería, y se concluiría que el vendor
  // no manda años teniéndolos delante.
  const r = resumirCrudo([
    { id: '1', name: 'A' },
    { id: '2', name: 'B', yearFrom: 2012, yearTo: 2016 },
    { id: '3', name: 'C' },
  ])
  assert.deepEqual(r.claves, ['id', 'name', 'yearFrom', 'yearTo'])
  assert.equal(r.total, 3)
})

test('sin lista, `total` es null y NUNCA 0', () => {
  // `0` se leería como «el vendor devolvió cero versiones». Aquí no se ha
  // contado nada: no había lista que contar.
  const r = resumirCrudo({ error: 'engine is required' })
  assert.equal(r.total, null)
  assert.equal(r.forma, 'objeto')
  assert.deepEqual(r.muestra, [{ error: 'engine is required' }])
})

test('una lista VACÍA sí cuenta 0: eso es «se miró y no hay»', () => {
  const r = resumirCrudo([])
  assert.equal(r.total, 0)
  assert.deepEqual(r.claves, [])
})

test('reconoce las MISMAS envolturas que producción, leídas de `catalogos.ts`', () => {
  // 🚨 La lista NO se teclea aquí: se lee del fuente de `catalogos.ts`. Con una
  // copia literal, añadir allí una envoltura nueva («payload», «records»…)
  // dejaría este cepo VERDE mientras el resumen mide un payload que la app ya
  // no usa — o sea, mintiendo sobre lo que se está tirando, que es justo lo
  // único que este módulo existe para no hacer.
  const fuente = readFileSync(join(import.meta.dirname, 'catalogos.ts'), 'utf8')
  const m = fuente.match(/for \(const k of \[([^\]]+)\]\)/)
  assert.ok(m, 'no se encontró el bucle de envolturas en catalogos.ts: el cepo se ha quedado ciego')
  const envolturas = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  assert.ok(envolturas.length > 0, 'la lista de envolturas de catalogos.ts salió vacía')

  for (const k of envolturas) {
    const r = resumirCrudo({ [k]: [{ id: '1', base7: 'X' }] })
    assert.equal(r.forma, 'objeto_con_lista', k)
    assert.equal(r.total, 1, k)
    assert.deepEqual(r.claves, ['base7', 'id'], k)
  }
})

test('la muestra devuelve las entradas ÍNTEGRAS, no recortadas a id+nombre', () => {
  // El recorte a `{id, nombre}` es precisamente lo que oculta la respuesta.
  const entrada = { id: '7', name: 'CLIO 1.5 DCI', yearFrom: 2012, cv: 90, anidado: { x: 1 } }
  const r = resumirCrudo([entrada])
  assert.deepEqual(r.muestra, [entrada])
})

test('la muestra se corta en MUESTRA entradas', () => {
  const r = resumirCrudo(Array.from({ length: 50 }, (_, i) => ({ id: String(i) })))
  assert.equal(r.muestra.length, MUESTRA)
  assert.equal(r.total, 50)
})

test('`clavesQueSuenanAAnio` es siempre un subconjunto de `claves`', () => {
  // Es un atajo para mirar, no una fuente aparte. Si pudiera traer una clave
  // que no está en `claves`, se convertiría en un veredicto propio.
  const r = resumirCrudo([{ id: '1', yearFrom: 2012, productionStart: '2012-01', cv: 90 }])
  for (const k of r.clavesQueSuenanAAnio) assert.ok(r.claves.includes(k), k)
  assert.ok(r.clavesQueSuenanAAnio.includes('yearFrom'))
  assert.ok(!r.clavesQueSuenanAAnio.includes('cv'))
})

test('un payload que no es ni lista ni objeto se declara `otro`, no vacío', () => {
  const r = resumirCrudo('502 Bad Gateway')
  assert.equal(r.forma, 'otro')
  assert.equal(r.total, null)
  assert.deepEqual(r.muestra, [])
})

test('extraerLista distingue las cuatro formas', () => {
  assert.equal(extraerLista([]).forma, 'lista')
  assert.equal(extraerLista({ items: [] }).forma, 'objeto_con_lista')
  assert.equal(extraerLista({ a: 1 }).forma, 'objeto')
  assert.equal(extraerLista(null).forma, 'otro')
})
