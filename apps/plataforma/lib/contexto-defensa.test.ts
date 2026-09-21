import test from 'node:test'
import assert from 'node:assert/strict'
import { leerContextoDefensa, motivoSinCartera } from './contexto-defensa.ts'
import { leerCarteraCompanias } from './retarificar-asegura.ts'

const POLIZA = { id: 'p-1', codigoEntidadDgs: 'C0468', aseguradora: 'Occident' }

const BLOQUE = {
  estado: 'ok',
  polizas: [
    {
      id: 'p-2',
      codigoEntidadDgs: 'C0058',
      aseguradora: 'Mapfre',
      estado: 'activa',
      viva: true,
      ramo: 'auto',
      numeroPoliza: '123',
    },
  ],
  catalogo: [{ codigoDgs: 'C0058', nombreComun: 'Mapfre' }],
  polizaActualId: 'p-1',
}

test('compone el contexto cuando la cartera se ha podido mirar', () => {
  const r = leerContextoDefensa(leerCarteraCompanias(BLOQUE), POLIZA)
  assert.notEqual(r, null)
  assert.equal(r!.polizas.length, 1)
  assert.equal(r!.polizas[0]!.codigoEntidadDgs, 'C0058')
  assert.equal(r!.catalogo[0]!.nombreComun, 'Mapfre')
  assert.equal(r!.polizaActualId, 'p-1')
  assert.equal(r!.companiaActualDgs, 'C0468')
  assert.equal(motivoSinCartera(leerCarteraCompanias(BLOQUE)), null)
})

test('🚨 cartera no mirada → null, NUNCA una cartera vacía', () => {
  // El caso real: una `apps/asegura` anterior a esto no manda el bloque. Si
  // esto devolviera un contexto con `polizas: []`, la tabla afirmaría que el
  // cliente no está en ninguna compañía y pintaría las 24 filas emitibles.
  for (const entrada of [undefined, null, {}, { carteraCompanias: null }, 'texto', 42]) {
    const c = leerCarteraCompanias(entrada)
    assert.equal(leerContextoDefensa(c, POLIZA), null, `con ${JSON.stringify(entrada)}`)
    assert.notEqual(motivoSinCartera(c), null, 'y se puede decir POR QUÉ')
  }
})

test('🚨 cartera mirada y vacía SÍ es un resultado: `[]`, no null', () => {
  // El otro lado de la moneda. Confundir «mirada, no tiene ninguna» con «no se
  // ha mirado» apagaría la columna teniendo la respuesta.
  const r = leerContextoDefensa(
    leerCarteraCompanias({ estado: 'ok', polizas: [], catalogo: [], polizaActualId: 'p-1' }),
    POLIZA,
  )
  assert.notEqual(r, null)
  assert.deepEqual(r!.polizas, [])
})

test('sin `polizaActualId` del puerto vale la póliza de la pantalla', () => {
  // Sin ella, la compañía que se está retarificando saldría como `ocupada`
  // («ya es cliente») en vez de `actual` («aquí se renueva»), que es otra cosa.
  const r = leerContextoDefensa(
    leerCarteraCompanias({ ...BLOQUE, polizaActualId: null }),
    POLIZA,
  )
  assert.equal(r!.polizaActualId, 'p-1')
})
