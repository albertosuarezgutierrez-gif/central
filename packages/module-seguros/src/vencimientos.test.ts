import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAS_PREAVISO_TOMADOR,
  DIAS_PREAVISO_ASEGURADOR,
  DIAS_ANUALIDAD,
  descripcionDias,
  esVencidaRecuperable,
  inicioVentanaRecuperacion,
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

// ─── La ventana que MIRA HACIA ATRÁS (20/09/2026) ────────────────────────────
// Hasta ese día `vencimientosProximos` consultaba `fechaVencimiento >= hoy`, así
// que la urgencia 'vencida' de arriba NO PODÍA EMITIRSE NUNCA desde el origen
// real: su rama era código muerto con aspecto de cobertura. Estos cepos fijan el
// vocabulario del arreglo — el corte hacia atrás y cómo se DICE un plazo pasado.

test('una vencida sigue siendo «vencida» aunque lleve meses: el caso real de Mapfre', () => {
  // Las 9 pólizas de Mapfre medidas el 20/09/2026 llevaban entre 41 y 107 días
  // vencidas. Ninguna puede degradar a otra urgencia ni «caducar» de la lista.
  assert.equal(urgenciaRenovacion(-41), 'vencida')
  assert.equal(urgenciaRenovacion(-107), 'vencida')
  assert.equal(urgenciaRenovacion(-DIAS_ANUALIDAD), 'vencida')
})

test('el corte hacia atrás es UNA ANUALIDAD, que es el periodo de prórroga (LCS art. 22)', () => {
  assert.equal(DIAS_ANUALIDAD, 365)
  // Las 9 reales (41-107 días) entran; las 8 zombis (2.552-4.984) no.
  assert.equal(esVencidaRecuperable(-41), true)
  assert.equal(esVencidaRecuperable(-107), true)
  assert.equal(esVencidaRecuperable(-365), true)
  assert.equal(esVencidaRecuperable(-366), false)
  assert.equal(esVencidaRecuperable(-2552), false)
  assert.equal(esVencidaRecuperable(-4984), false)
  // Y lo que todavía no ha vencido NO es una recuperación, es una renovación.
  assert.equal(esVencidaRecuperable(0), false)
  assert.equal(esVencidaRecuperable(40), false)
})

test('el borde izquierdo de la ventana es hoy MENOS una anualidad, no hoy', () => {
  const desde = inicioVentanaRecuperacion(HOY)
  assert.equal(desde.toISOString().slice(0, 10), '2025-09-01')
  // Se normaliza a medianoche UTC: HOY trae las 10:00 y no deben colarse horas.
  assert.equal(desde.toISOString(), '2025-09-01T00:00:00.000Z')
  // Y admite otra ventana sin tocar el resto.
  assert.equal(inicioVentanaRecuperacion(HOY, 90).toISOString().slice(0, 10), '2026-06-03')
})

test('un plazo pasado se dice «hace N días», jamás «en -N días»', () => {
  assert.equal(descripcionDias(0), 'hoy')
  assert.equal(descripcionDias(1), 'en 1 día')
  assert.equal(descripcionDias(40), 'en 40 días')
  assert.equal(descripcionDias(-1), 'hace 1 día')
  assert.equal(descripcionDias(-41), 'hace 41 días')
  assert.equal(descripcionDias(-107), 'hace 107 días')
  // El cepo de verdad: el signo no puede llegar al texto.
  for (const d of [-1, -41, -107, -365]) assert.ok(!descripcionDias(d).includes('-'))
})

test('textoPlazoOposicion: con plazo dice hasta cuándo; dentro del mes, que ya pasó; vencida o fecha rara, nada', async () => {
  const { textoPlazoOposicion } = await import('./vencimientos.ts')
  assert.equal(textoPlazoOposicion('2026-11-29', 64), 'baja a la compañía hasta el 30/10')
  assert.equal(textoPlazoOposicion('2026-09-29', 3), 'plazo de baja pasado (30/08)')
  // A 30 días justos el límite es HOY: aún se puede (fechaLimiteOposicion = último día válido).
  assert.equal(textoPlazoOposicion('2026-10-26', 30), 'baja a la compañía hasta el 26/09')
  assert.equal(textoPlazoOposicion('2026-10-25', 29), 'plazo de baja pasado (25/09)')
  assert.equal(textoPlazoOposicion('2026-09-29', -1), null)
  assert.equal(textoPlazoOposicion('29/09/2026', 3), null)
})
