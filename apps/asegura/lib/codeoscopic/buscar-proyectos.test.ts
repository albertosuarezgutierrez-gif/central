// Cepos de la búsqueda de proyectos por DNI del tomador: una forma de respuesta desconocida no puede
// leerse como «no tiene proyectos», y cada candidato tiene que pasar la comprobación del número de póliza.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { idsDeBusqueda, normalizarDni } from './buscar-proyectos.ts'

test('lee ids de array suelto y de sobre, sin duplicados', () => {
  assert.deepEqual(idsDeBusqueda([{ id: 40841279 }, { id: '40841279' }, { id: 'X' }]), ['40841279', 'X'])
  assert.deepEqual(idsDeBusqueda({ items: [{ id: 1 }] }), ['1'])
  assert.deepEqual(idsDeBusqueda({ content: [{ id: 2 }] }), ['2'])
})

test('forma desconocida = null, nunca lista vacía', () => {
  assert.equal(idsDeBusqueda({ total: 3 }), null)
  assert.equal(idsDeBusqueda('texto'), null)
  assert.deepEqual(idsDeBusqueda(null), [])
})

test('normaliza el DNI', () => {
  assert.equal(normalizarDni(' 12.345.678-z '), '12345678Z')
})

test('la ruta prueba cada candidato con el número esperado', () => {
  const src = readFileSync(new URL('../../app/api/operador/poliza/traer-pdf/route.ts', import.meta.url), 'utf8')
  assert.match(src, /for \(const id of candidatos\) \{\s*const t = await traerPdfEmitido\(correduria\.id, id, polizaId, \{ numeroPolizaEsperado: p\.numero \}\)/)
})
