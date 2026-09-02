import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAS_PREAVISO_TOMADOR,
  DIAS_PREAVISO_ASEGURADOR,
  comunicacionEnPlazo,
  fechaLimiteComunicacionAseguradora,
  diasHastaVencimiento,
  etiquetaUrgencia,
  fechaLimiteOposicion,
  primaEnRiesgo,
  primaReferencia,
  urgenciaRenovacion,
} from './vencimientos.ts'

const HOY = new Date('2026-09-01T10:00:00Z')

test('los días se cuentan por fecha, no por horas: hoy mismo es 0', () => {
  assert.equal(diasHastaVencimiento(new Date('2026-09-01T23:00:00Z'), HOY), 0)
})

test('cuenta días naturales hacia delante y hacia atrás', () => {
  assert.equal(diasHastaVencimiento(new Date('2026-09-10'), HOY), 9)
  assert.equal(diasHastaVencimiento(new Date('2026-08-20'), HOY), -12)
})

test('el límite de oposición es un mes antes del vencimiento (LCS art. 22)', () => {
  assert.equal(fechaLimiteOposicion(new Date('2026-10-01')).toISOString().slice(0, 10), '2026-09-01')
  assert.equal(DIAS_PREAVISO_TOMADOR, 30)
})

test('dentro del mes de preaviso la prórroga ya no se puede evitar en plazo', () => {
  assert.equal(urgenciaRenovacion(0), 'prorroga_inevitable')
  assert.equal(urgenciaRenovacion(9), 'prorroga_inevitable')
  assert.equal(urgenciaRenovacion(30), 'prorroga_inevitable')
})

test('el día 31 todavía hay plazo: es la última llamada, no una prórroga consumada', () => {
  assert.equal(urgenciaRenovacion(31), 'ultima_llamada')
  assert.equal(urgenciaRenovacion(60), 'ultima_llamada')
  assert.equal(urgenciaRenovacion(61), 'a_tiempo')
})

test('una fecha pasada es «vencida», nunca «a tiempo»', () => {
  assert.equal(urgenciaRenovacion(-1), 'vencida')
  assert.equal(etiquetaUrgencia('vencida'), 'Vencida')
})

test('la prima bruta manda sobre la neta, y sin ninguna de las dos es null (no 0)', () => {
  assert.equal(primaReferencia({ primaAnual: 365.32, primaBruta: 395.09 }), 395.09)
  assert.equal(primaReferencia({ primaAnual: 365.32, primaBruta: null }), 365.32)
  assert.equal(primaReferencia({ primaAnual: null, primaBruta: null }), null)
  // 🚨 0 no es una prima: es «no informada» (24 de 109 vivas, 02/09/2026).
  assert.equal(primaReferencia({ primaAnual: 0, primaBruta: 0 }), null)
  assert.equal(primaReferencia({ primaAnual: 365.32, primaBruta: 0 }), 365.32)
})

test('primaEnRiesgo separa lo que se sabe de lo que no — el total nunca absorbe los NULL', () => {
  // Caso real de la cartera: cuatro pólizas de Allianz llegan por EIAC sin prima.
  const r = primaEnRiesgo([
    { primaBruta: 395.09 },
    { primaAnual: 431.85 },
    { primaAnual: null, primaBruta: null },
    { primaAnual: null, primaBruta: null },
  ])
  assert.equal(r.total, 826.94)
  assert.equal(r.conocidas, 2)
  assert.equal(r.sinPrima, 2)
})

test('sin pólizas el total es 0 y NO hay primas desconocidas: 0 aquí sí significa cero', () => {
  assert.deepEqual(primaEnRiesgo([]), { total: 0, conocidas: 0, sinPrima: 0 })
})

test('el asegurador tiene DOS meses para comunicar una subida (LCS art. 22)', () => {
  assert.equal(DIAS_PREAVISO_ASEGURADOR, 60)
  assert.equal(
    fechaLimiteComunicacionAseguradora(new Date('2026-10-01')).toISOString().slice(0, 10),
    '2026-08-02',
  )
})

test('una comunicación en el límite exacto está en plazo', () => {
  assert.equal(comunicacionEnPlazo(new Date('2026-10-01'), new Date('2026-08-02')), true)
  assert.equal(comunicacionEnPlazo(new Date('2026-10-01'), new Date('2026-08-03')), false)
})

test('sin fecha de comunicación NO se afirma que llegó tarde: es null', () => {
  assert.equal(comunicacionEnPlazo(new Date('2026-10-01'), null), null)
  assert.equal(comunicacionEnPlazo(new Date('2026-10-01'), undefined), null)
})
