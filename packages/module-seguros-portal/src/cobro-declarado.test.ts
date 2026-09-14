import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAS_PREAVISO_RECIBO,
  PERIODICIDADES_PAGO,
  esPeriodicidadPagoValida,
  fechaAccionableRecibo,
  proximoCobroDeclarado,
} from './cobro-declarado.ts'

const iso = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10))

test('las cuatro periodicidades son las mismas que FRACCIONES de module-seguros', () => {
  assert.deepEqual([...PERIODICIDADES_PAGO].sort(), ['anual', 'mensual', 'semestral', 'trimestral'])
})

test('esPeriodicidadPagoValida rechaza cualquier cosa que no esté en la lista', () => {
  assert.equal(esPeriodicidadPagoValida('mensual'), true)
  assert.equal(esPeriodicidadPagoValida('quincenal'), false)
  assert.equal(esPeriodicidadPagoValida(''), false)
})

test('«anual» NO genera próximo cobro: ese pago ya es la renovación', () => {
  const vence = new Date(Date.UTC(2026, 2, 15))
  assert.equal(proximoCobroDeclarado({ vencimiento: vence, periodicidad: 'anual', hoy: new Date(Date.UTC(2026, 0, 1)) }), null)
})

test('sin periodicidad, o con una que no se reconoce, no hay próximo cobro', () => {
  const vence = new Date(Date.UTC(2026, 2, 15))
  const hoy = new Date(Date.UTC(2026, 0, 1))
  assert.equal(proximoCobroDeclarado({ vencimiento: vence, periodicidad: null, hoy }), null)
  assert.equal(proximoCobroDeclarado({ vencimiento: vence, periodicidad: 'quincenal', hoy }), null)
})

test('semestral: dos cobros al año, anclados en el vencimiento', () => {
  const vence = new Date(Date.UTC(2026, 2, 15)) // 15/03
  // Antes del cobro de septiembre pasado: el siguiente es el de marzo.
  assert.equal(iso(proximoCobroDeclarado({ vencimiento: vence, periodicidad: 'semestral', hoy: new Date(Date.UTC(2026, 0, 1)) })), '2026-03-15')
  // Justo el día del cobro: cuenta como "próximo" (inclusive).
  assert.equal(iso(proximoCobroDeclarado({ vencimiento: vence, periodicidad: 'semestral', hoy: vence })), '2026-03-15')
  // Un día después: salta al siguiente semestre.
  assert.equal(
    iso(proximoCobroDeclarado({ vencimiento: vence, periodicidad: 'semestral', hoy: new Date(Date.UTC(2026, 2, 16)) })),
    '2026-09-15',
  )
})

test('trimestral: el borde de mes no desborda (31 de marzo -> 31/30/31 según el mes)', () => {
  const vence = new Date(Date.UTC(2026, 2, 31)) // 31/03, año no bisiesto
  // Ciclo: 30/09 (anterior), 31/12, 31/03, 30/06...
  assert.equal(
    iso(proximoCobroDeclarado({ vencimiento: vence, periodicidad: 'trimestral', hoy: new Date(Date.UTC(2025, 10, 1)) })),
    '2025-12-31',
  )
})

test('mensual: el 31 clampa al último día de un mes corto, sin arrastrar el desbordamiento', () => {
  const vence = new Date(Date.UTC(2026, 0, 31)) // 31/01
  // 31/01 + 1 mes -> 28/02/2026 (2026 no es bisiesto), no un 3 de marzo.
  assert.equal(
    iso(proximoCobroDeclarado({ vencimiento: vence, periodicidad: 'mensual', hoy: new Date(Date.UTC(2026, 1, 1)) })),
    '2026-02-28',
  )
})

test('el vencimiento puede estar en el futuro lejano: se cuenta hacia atrás igual', () => {
  const vence = new Date(Date.UTC(2028, 5, 10)) // 10/06/2028
  assert.equal(
    iso(proximoCobroDeclarado({ vencimiento: vence, periodicidad: 'trimestral', hoy: new Date(Date.UTC(2026, 0, 1)) })),
    '2026-03-10',
  )
})

test('el preaviso del recibo es de 5 dias, y NO es el del art. 22 LCS', () => {
  assert.equal(DIAS_PREAVISO_RECIBO, 5)
  const evento = new Date(Date.UTC(2026, 5, 15))
  assert.equal(iso(fechaAccionableRecibo(evento)), '2026-06-10')
})
