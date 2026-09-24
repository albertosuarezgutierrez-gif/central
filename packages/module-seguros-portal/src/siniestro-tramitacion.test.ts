import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tramitacionSiniestro } from './siniestro-tramitacion.ts'

const vacio = { situaciones: null, acciones: null, pagos: null, totalPagos: null, indemnizacion: null }

test('sin nada de la compañía → null (no se sabe), no una línea vacía', () => {
  assert.equal(tramitacionSiniestro(vacio), null)
})

test('la muestra oficial de TIREA se lee en orden y en castellano', () => {
  const t = tramitacionSiniestro({
    situaciones: [{ codigo: 'AP', fecha: '2024-01-01', descripcion: null }],
    acciones: [
      { accion: 'DI', fecha: '2024-01-03', descripcion: 'x', situacion: 'EC', figuras: ['TR'] },
      { accion: 'EP', fecha: '2024-01-02', descripcion: 'x', situacion: 'FI', figuras: ['PE'] },
    ],
    pagos: [{ fecha: '2024-01-05', importe: '500.00', descripcion: null, receptor: 'PE' }],
    totalPagos: '500.00',
    indemnizacion: null,
  })
  assert.ok(t)
  assert.deepEqual(
    t.pasos.map((p) => [p.fecha, p.texto, p.importe]),
    [
      ['2024-01-01', 'La compañía abrió el siniestro', null],
      ['2024-01-02', 'Peritación: terminada', null],
      ['2024-01-03', 'Documentación: en curso', null],
      ['2024-01-05', 'Pago de la compañía al perito', 500],
    ],
  )
  assert.equal(t.totalPagado, 500)
  assert.equal(t.indemnizacion, null)
})

test('la misma acción en dos fotos se pinta una vez, la más avanzada', () => {
  const t = tramitacionSiniestro({
    ...vacio,
    acciones: [
      { accion: 'EP', fecha: '2024-02-01', situacion: 'FI' },
      { accion: 'EP', fecha: '2024-02-01', situacion: 'EC' },
    ],
  })
  assert.deepEqual(t?.pasos.map((p) => p.texto), ['Peritación: terminada'])
})

test('claves fuera de tabla y pagos sin importe se descartan, sin reventar', () => {
  const t = tramitacionSiniestro({
    situaciones: [{ codigo: 'ZZ' }, 'basura', null],
    acciones: [{ accion: 'XX', situacion: 'EC' }],
    pagos: [{ importe: 'abc' }, { importe: null }],
    totalPagos: null,
    indemnizacion: null,
  })
  assert.deepEqual(t, { pasos: [], totalPagado: null, indemnizacion: null })
})

test('nunca viajan la descripción libre ni las figuras (nombres de perito/tramitador)', () => {
  const t = tramitacionSiniestro({
    situaciones: [{ codigo: 'AP', fecha: '2024-01-01', descripcion: 'Tramita Pepe Pérez 600111222' }],
    acciones: [{ accion: 'EP', fecha: '2024-01-02', situacion: 'EC', descripcion: 'Perito Juan', figuras: ['PE'] }],
    pagos: [{ fecha: '2024-01-03', importe: 10, descripcion: 'Honorarios Juan', receptor: 'TA' }],
    totalPagos: 10,
    indemnizacion: '1234.5',
  })
  const volcado = JSON.stringify(t)
  for (const prohibido of ['Pepe', 'Juan', '600111222', 'Honorarios', 'figuras', 'descripcion']) {
    assert.ok(!volcado.includes(prohibido), `se ha colado «${prohibido}»`)
  }
  assert.equal(t?.indemnizacion, 1234.5)
})

test('sin fecha va al final; un pago sin receptor conocido no dice a quién', () => {
  const t = tramitacionSiniestro({
    ...vacio,
    pagos: [
      { importe: 1, receptor: 'QQ' },
      { fecha: '2024-01-01', importe: 2, receptor: 'TA' },
    ],
  })
  assert.deepEqual(t?.pasos.map((p) => [p.fecha, p.texto]), [
    ['2024-01-01', 'Pago de la compañía al taller'],
    [null, 'Pago de la compañía'],
  ])
})
