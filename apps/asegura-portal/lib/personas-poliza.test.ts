import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarPersonas } from './personas-poliza.ts'

test('respuesta que no es «ok» (o sin forma) → null: la ficha se calla, no dice «no hay nadie»', () => {
  assert.equal(interpretarPersonas(null), null)
  assert.equal(interpretarPersonas({ estado: 'no_visible' }), null)
  assert.equal(interpretarPersonas({ estado: 'error', causa: 'x' }), null)
})

test('un asegura roto que mande de más NO lo cuela: el portal re-filtra por lista blanca', () => {
  const r = interpretarPersonas({
    estado: 'ok',
    propias: [{ papel: 'tomador', etiqueta: 'Tomador', nombre: 'Víctor', telefono: '600', documentoCifrado: 'v1:zz', documento: '11111111H', tipoDocumento: 'NI' }],
    otras: [{ papel: 'conductor_habitual', etiqueta: 'Conductor habitual', nombre: 'Nieves', telefono: '611', email: 'n@x.es' }],
    siniestros: [
      { siniestroId: 's1', terceros: [{ papel: 'contrario', etiqueta: 'Contrario', nombre: 'Pepe', matricula: '1234ABC', compania: 'AXA', telefono: '699', email: 'p@x.es', domicilio: { direccion: 'Sierpes 1' }, documentoFinal: '333P' }] },
      { siniestroId: 's2', terceros: [] },
    ],
  })!
  assert.equal(r.propias?.[0].telefono, '600')
  assert.ok(!('documento' in r.propias![0]) && !('documentoCifrado' in r.propias![0]) && !('tipoDocumento' in r.propias![0]))
  assert.deepEqual(r.otras, [{ papel: 'conductor_habitual', etiqueta: 'Conductor habitual', nombre: 'Nieves' }])
  assert.deepEqual(r.terceros?.get('s1'), [{ papel: 'contrario', etiqueta: 'Contrario', nombre: 'Pepe', matricula: '1234ABC', compania: 'AXA' }])
  assert.equal(r.terceros?.has('s2'), false)
  const json = JSON.stringify({ ...r, terceros: [...(r.terceros ?? [])] })
  for (const v of ['611', 'n@x.es', '699', 'p@x.es', 'Sierpes', '333P', '11111111H', 'v1:']) assert.ok(!json.includes(v), v)
})

test('póliza anterior a #880: propias null (no consta) ≠ []', () => {
  const r = interpretarPersonas({ estado: 'ok', propias: null, otras: [], siniestros: null })!
  assert.equal(r.propias, null)
  assert.equal(r.terceros, null)
})
