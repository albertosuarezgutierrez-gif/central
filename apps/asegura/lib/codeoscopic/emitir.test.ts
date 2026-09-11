import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerOferta, encontrarPrecio } from './emitir.ts'
import type { Cotizacion } from './respuesta.ts'

// `leerOferta` es defensiva a propósito: la forma de `POST .../offers` no
// está verificada contra el fabricante (sin fixture, sin sandbox). Estos
// tests fijan lo mínimo que SÍ se sabe: tiene que devolver un `id`, y la
// firmeza se decide con la misma regla que `firmezaDe()` de `respuesta.ts`.

test('leerOferta: acepta la respuesta envuelta en mainQuote', () => {
  const o = leerOferta({ mainQuote: { id: 'OF123', premium: 319.02, estimate: false, messages: [] } })
  assert.equal(o.offerId, 'OF123')
  assert.equal(o.primaEur, 319.02)
  assert.equal(o.firmeza, 'firme')
  assert.deepEqual(o.avisos, [])
})

test('leerOferta: acepta la respuesta PELADA, sin mainQuote', () => {
  const o = leerOferta({ id: 42, premium: 100 })
  assert.equal(o.offerId, '42')
  assert.equal(o.primaEur, 100)
})

test('leerOferta: estimate=true manda sobre cualquier otra señal', () => {
  const o = leerOferta({ mainQuote: { id: 'OF1', estimate: true, messages: [] } })
  assert.equal(o.firmeza, 'estimado')
})

test('leerOferta: sin estimate pero con avisos → condicionado', () => {
  const o = leerOferta({
    mainQuote: { id: 'OF1', messages: [{ type: 'warning', text: 'riesgo condicionado' }] },
  })
  assert.equal(o.firmeza, 'condicionado')
  assert.deepEqual(o.avisos, ['riesgo condicionado'])
})

test('leerOferta: sin id reconocible, lanza con el crudo en el mensaje', () => {
  assert.throws(() => leerOferta({ foo: 'bar' }), /codeoscopic_oferta_sin_id/)
})

test('encontrarPrecio: casa por compañía y categoría, sin distinguir mayúsculas', () => {
  const cotizacion: Cotizacion = {
    projectId: '1',
    fechaEfecto: null,
    fallos: [],
    precios: [
      {
        id: 'Q1',
        compania: 'Allianz',
        producto: 'Allianz Autos 2025',
        modalidad: null,
        categoria: 'Terceros Ampliado',
        franquiciaEur: null,
        primaEur: 319.02,
        entradaEur: null,
        meses: null,
        formaPago: null,
        frecuenciaPago: null,
        referenciaVendor: null,
        firmeza: 'estimado',
        avisos: [],
        requiereReRate: true,
      },
    ],
  }
  const p = encontrarPrecio(cotizacion, 'allianz', 'terceros ampliado')
  assert.ok(p)
  assert.equal(p?.id, 'Q1')
  assert.equal(encontrarPrecio(cotizacion, 'Allianz', 'Todo Riesgo'), null)
})
