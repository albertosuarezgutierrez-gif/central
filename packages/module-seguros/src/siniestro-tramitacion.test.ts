import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tramitacionCompania, textoClave } from './siniestro-tramitacion.ts'

const vacio = { situaciones: null, acciones: null, pagos: null, reserva: null, indemnizacion: null, totalPagos: null, posicion: null }

test('sin nada de la compañía → null, no una tarjeta vacía', () => {
  assert.equal(tramitacionCompania(vacio), null)
})

test('el corredor ve TODO: descripción, figuras, reserva y posición de culpa', () => {
  const t = tramitacionCompania({
    situaciones: [{ codigo: 'AP', fecha: '2024-01-01', descripcion: 'Apertura' }],
    acciones: [{ accion: 'EP', fecha: '2024-01-02', situacion: 'EC', descripcion: 'Perito asignado', figuras: ['PE'] }],
    pagos: [{ fecha: '2024-01-05', importe: '500.00', descripcion: 'Honorarios', receptor: 'PE' }],
    reserva: '1000.00',
    indemnizacion: null,
    totalPagos: '500.00',
    posicion: 'IN',
  })
  assert.ok(t)
  assert.equal(t.reserva, 1000)
  assert.equal(t.totalPagado, 500)
  assert.equal(t.indemnizacion, null)
  assert.deepEqual(t.posicion, { codigo: 'IN', texto: 'Indeterminado' })
  assert.deepEqual(t.pasos.map((p) => [p.fecha, p.tipo, textoClave(p.clave)]), [
    ['2024-01-01', 'situacion', 'Abierto'],
    ['2024-01-02', 'accion', 'Peritación'],
    ['2024-01-05', 'pago', 'Perito'],
  ])
  const accion = t.pasos[1]!
  assert.equal(textoClave(accion.estadoAccion), 'En curso')
  assert.deepEqual(accion.figuras, [{ codigo: 'PE', texto: 'Perito' }])
  assert.equal(accion.descripcion, 'Perito asignado')
})

test('una clave fuera de tabla se enseña como código, no se inventa ni se pierde', () => {
  const t = tramitacionCompania({ ...vacio, situaciones: [{ codigo: 'zz', fecha: '2024-01-01' }], posicion: 'QQ' })
  assert.deepEqual(t?.pasos[0]?.clave, { codigo: 'ZZ', texto: null })
  assert.equal(textoClave(t?.pasos[0]?.clave ?? null), 'código ZZ')
  assert.deepEqual(t?.posicion, { codigo: 'QQ', texto: null })
})

test('la misma acción en dos fotos se pinta una vez, la más avanzada', () => {
  const t = tramitacionCompania({
    ...vacio,
    acciones: [
      { accion: 'ER', fecha: '2024-02-01', situacion: 'FI' },
      { accion: 'ER', fecha: '2024-02-01', situacion: 'EC' },
    ],
  })
  assert.equal(t?.pasos.length, 1)
  assert.equal(textoClave(t?.pasos[0]?.estadoAccion ?? null), 'Finalizada')
})

test('importe no numérico no cuenta como 0; basura no revienta', () => {
  const t = tramitacionCompania({ ...vacio, pagos: [{ importe: 'abc' }, null, 'x'], reserva: '', totalPagos: 'NaN' })
  assert.deepEqual(t, { pasos: [], reserva: null, indemnizacion: null, totalPagado: null, posicion: null })
})
