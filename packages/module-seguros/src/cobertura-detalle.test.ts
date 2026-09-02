import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extraerDetalleCobertura, interpretarCapital } from './cobertura-detalle.ts'

test('el «0» de CIMA no es capital cero: es «sin capital propio»', () => {
  assert.deepEqual(interpretarCapital('0'), { tipo: 'sin_capital' })
  assert.deepEqual(interpretarCapital('0.00'), { tipo: 'sin_capital' })
})

test('INF es ilimitado; un número es importe; lo demás se conserva como texto', () => {
  assert.deepEqual(interpretarCapital('INF'), { tipo: 'ilimitado' })
  assert.deepEqual(interpretarCapital('105000'), { tipo: 'importe', importe: 105000 })
  assert.deepEqual(interpretarCapital('15773.00'), { tipo: 'importe', importe: 15773 })
  assert.deepEqual(interpretarCapital('VALOR VENAL'), { tipo: 'texto', texto: 'VALOR VENAL' })
  assert.deepEqual(interpretarCapital(null), { tipo: 'sin_informar' })
  assert.deepEqual(interpretarCapital('  '), { tipo: 'sin_informar' })
})

test('límites, franquicias y prima salen de datos_extra; objeto suelto o lista, da igual', () => {
  const d = extraerDetalleCobertura({
    DatosLimitesAsegurados: { Limite: { ClaseLimite: 'PS', LimiteMaximo: '29380.00', LimiteMinimo: '29380.00', DescripcionLimite: 'Por siniestro' } },
    DatosFranquicias: { Franquicia: [{ Porcentaje: '10.00', ValorMinimo: '600.00', ValorMaximo: '6000.00', ClaseFranquicia: 'PS' }] },
    DatosImportes: { PrimaNeta: '52.56', PrimaTotal: '56.84', DatosCargos: { Cargo: [] } },
  })
  assert.deepEqual(d, {
    limites: [{ clase: 'PS', descripcion: 'Por siniestro', minimo: 29380, maximo: 29380 }],
    franquicias: [{ clase: 'PS', porcentaje: 10, minimo: 600, maximo: 6000 }],
    prima: { neta: 52.56, total: 56.84 },
  })
})

test('sin nada legible devuelve null, nunca un detalle vacío', () => {
  assert.equal(extraerDetalleCobertura(null), null)
  assert.equal(extraerDetalleCobertura('x'), null)
  assert.equal(extraerDetalleCobertura({}), null)
  assert.equal(extraerDetalleCobertura({ DatosImportes: { PrimaNeta: 'abc' } }), null)
})
