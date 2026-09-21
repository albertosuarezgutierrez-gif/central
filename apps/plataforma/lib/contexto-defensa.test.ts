import test from 'node:test'
import assert from 'node:assert/strict'
import { leerContextoDefensa } from './contexto-defensa.ts'

const POLIZA = { id: 'p-1', codigoEntidadDgs: 'C0468', aseguradora: 'Occident' }

const BLOQUE = {
  carteraCompanias: {
    polizas: [
      {
        id: 'p-2',
        codigoEntidadDgs: 'C0058',
        aseguradora: 'Mapfre',
        estado: 'vigente',
        viva: true,
        ramo: 'auto',
        numeroPoliza: '123',
      },
    ],
    catalogo: [{ codigoDgs: 'C0058', nombreComun: 'Mapfre' }],
  },
}

test('lee el bloque del puerto cuando viene entero', () => {
  const r = leerContextoDefensa(BLOQUE, POLIZA)
  assert.notEqual(r, null)
  assert.equal(r!.polizas.length, 1)
  assert.equal(r!.polizas[0]!.codigoEntidadDgs, 'C0058')
  assert.equal(r!.catalogo[0]!.nombreComun, 'Mapfre')
  // La póliza que se está retarificando viaja para distinguir `actual`.
  assert.equal(r!.polizaActualId, 'p-1')
  assert.equal(r!.companiaActualDgs, 'C0468')
})

test('🚨 sin el bloque devuelve null, NUNCA una cartera vacía', () => {
  // Es el caso real: una `apps/asegura` desplegada antes que esto no manda el
  // campo. Un `[]` aquí afirmaría que el cliente no tiene póliza en NINGUNA
  // compañía, y la tabla pintaría las 24 filas como emitibles.
  for (const entrada of [undefined, null, {}, { carteraCompanias: null }, 'texto', 42]) {
    assert.equal(leerContextoDefensa(entrada, POLIZA), null, `con ${JSON.stringify(entrada)}`)
  }
})

test('🚨 una lista con forma rara es null entera, no una lista a medias', () => {
  // Quedarse con las filas legibles y tirar el resto dejaría una cartera
  // INCOMPLETA con cara de completa: la compañía de la fila que se cayó
  // saldría como «libre».
  assert.equal(
    leerContextoDefensa({ carteraCompanias: { polizas: [{ id: 'x' }], catalogo: [] } }, POLIZA),
    null,
  )
  assert.equal(
    leerContextoDefensa({ carteraCompanias: { polizas: 'no-es-lista', catalogo: [] } }, POLIZA),
    null,
  )
})

test('🚨 `viva` tiene que venir declarado: no se supone false', () => {
  // `viva` decide si esa póliza defiende. Suponerla `false` dejaría fuera una
  // póliza real en silencio, que es «no lo sé» disfrazado de «no la tiene».
  const sinViva = {
    carteraCompanias: {
      polizas: [{ id: 'p-2', codigoEntidadDgs: 'C0058', aseguradora: 'Mapfre', estado: 'vigente' }],
      catalogo: [],
    },
  }
  assert.equal(leerContextoDefensa(sinViva, POLIZA), null)
})

test('una fila de catálogo sin código o sin nombre invalida el catálogo', () => {
  const malo = {
    carteraCompanias: { polizas: [], catalogo: [{ codigoDgs: 'C0058' }] },
  }
  assert.equal(leerContextoDefensa(malo, POLIZA), null)
})

test('cartera mirada y vacía SÍ es un resultado válido: `[]`, no null', () => {
  // El otro lado de la moneda: «se ha mirado y no tiene ninguna» es un dato,
  // y confundirlo con «no se ha mirado» apagaría la columna teniendo respuesta.
  const r = leerContextoDefensa({ carteraCompanias: { polizas: [], catalogo: [] } }, POLIZA)
  assert.notEqual(r, null)
  assert.deepEqual(r!.polizas, [])
})
