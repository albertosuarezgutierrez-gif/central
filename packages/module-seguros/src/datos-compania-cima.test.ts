import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerDatosCompaniaCima, leerDatosCompaniaPuerto, rotuloAnulacionCima } from './datos-compania-cima.ts'

test('sin nada de CIMA (auto normal) → null, no una ficha vacía', () => {
  assert.equal(leerDatosCompaniaCima({ matricula: '1234ABC', marca: 'SEAT' }), null)
  assert.equal(leerDatosCompaniaCima(null), null)
  assert.equal(leerDatosCompaniaCima('x'), null)
})

test('lee anulación, reemplazada, suplementos (más reciente arriba), otros datos e inmueble', () => {
  const r = leerDatosCompaniaCima({
    anulacion: { fecha: '2026-04-30', motivo: 'EX', detalle: 'Anulación por vencimiento' },
    polizaReemplazada: { numero: 'GPAED1700425', codigoDgs: 'C0468', ramoDgs: '241', descripcionRamo: 'AUTOMATIC PLUS' },
    suplementos: [
      { id: '1', detalle: 'Alta', fechaEfecto: '2024-01-01' },
      { id: '2', detalle: 'Renovación', fechaEfecto: '2026-01-01' },
    ],
    otrosDatos: [{ id: 'Anualidades', descripcion: 'Anualidades', valor: '8' }],
    claseInmueble: 'PP',
    antiguedadCima: '1994',
    medidasProteccion: [{ medida: 'Puerta', valor: 'Blindada' }],
  })
  assert.equal(r?.anulacion?.detalle, 'Anulación por vencimiento')
  assert.equal(r?.polizaReemplazada?.numero, 'GPAED1700425')
  assert.deepEqual(r?.suplementos.map((s) => s.id), ['2', '1'])
  assert.equal(r?.otrosDatos[0].valor, '8')
  assert.equal(r?.inmueble?.claseInmueble, 'PP')
  assert.equal(r?.inmueble?.antiguedad, '1994')
  assert.deepEqual(r?.inmueble?.medidasProteccion, [{ medida: 'Puerta', valor: 'Blindada' }])
})

test('formas raras se descartan, no se inventan', () => {
  const r = leerDatosCompaniaCima({
    anulacion: { fecha: '30/04/2026', motivo: 7 },
    polizaReemplazada: { codigoDgs: 'C0468' },
    suplementos: 'no es una lista',
    otrosDatos: [null, 3, { valor: 'suelto' }],
  })
  assert.deepEqual(r?.anulacion, { fecha: null, motivo: '7', detalle: null })
  assert.equal(r?.polizaReemplazada, null)
  assert.deepEqual(r?.suplementos, [])
  assert.deepEqual(r?.otrosDatos, [])
})

test('rotuloAnulacionCima: con la póliza vigente NO afirma que esté anulada', () => {
  const a = { fecha: '2024-06-22', motivo: 'IM', detalle: '0014-IMPAGO DEL RECIBO' }
  assert.match(rotuloAnulacionCima(a, true), /^Consta una anulación anterior .*sigue en vigor/)
  assert.match(rotuloAnulacionCima(a, false), /^Anulada con fecha 2024-06-22: 0014-IMPAGO/)
  assert.match(rotuloAnulacionCima({ fecha: null, motivo: null, detalle: null }, false), /sin motivo informado/)
})

test('leerDatosCompaniaPuerto: lo servido por el puerto se lee igual que lo guardado', () => {
  const guardado = {
    anulacion: { fecha: '2026-04-30', motivo: 'EX', detalle: 'Vencimiento' },
    claseInmueble: 'PP',
    antiguedadCima: '1994',
    medidasProteccion: [{ medida: 'Puerta', valor: 'Blindada' }],
    embarcacion: { nombre: 'Barco', eslora: '9.00' },
  }
  const servido = JSON.parse(JSON.stringify(leerDatosCompaniaCima(guardado)))
  assert.deepEqual(leerDatosCompaniaPuerto(servido), leerDatosCompaniaCima(guardado))
  assert.equal(leerDatosCompaniaPuerto(null), null)
})
