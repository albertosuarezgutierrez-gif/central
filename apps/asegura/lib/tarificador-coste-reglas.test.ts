import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FLY_EUR_POR_SEG, calcularCoste, iaConocida, segundosEjecucion, sumarConocidos, type TrabajoCoste } from './tarificador-coste-reglas.ts'

const AHORA = new Date('2026-10-07T10:00:00Z')
const t = (o: Partial<TrabajoCoste> & { seg?: number }): TrabajoCoste => {
  const ini = Date.parse('2026-10-06T09:00:00Z')
  return {
    compania: 'allianz', estado: 'ok', creadoEn: '2026-10-06T08:59:00Z',
    iniciadoEn: new Date(ini).toISOString(), terminadoEn: new Date(ini + (o.seg ?? 120) * 1000).toISOString(), ...o,
  }
}

test('null no es 0: sin tiempos ni IA no consta nada', () => {
  const c = calcularCoste([t({ iniciadoEn: null })], null, AHORA)
  assert.equal(c.resumen.costeMedioEur, null)
  assert.equal(c.resumen.proyeccion100Eur, null)
  assert.equal(c.filas[0].flyEur, null)
  assert.equal(c.filas[0].totalEur, null)
})

test('Fly: segundos × tarifa; IA de suma 0 no consta', () => {
  assert.equal(segundosEjecucion({ iniciadoEn: null, terminadoEn: 'x' }), null)
  assert.equal(iaConocida(0), null)
  assert.equal(iaConocida(null), null)
  assert.equal(sumarConocidos([null, null]), null)
  const c = calcularCoste([t({ seg: 100 })], [{ dia: '2026-10-06', eur: 0 }], AHORA)
  assert.equal(c.resumen.iaIncluida, false)
  assert.ok(Math.abs((c.resumen.costeMedioEur as number) - 100 * FLY_EUR_POR_SEG) < 1e-4)
})

test('IA prorrateada por día entre trabajos terminados; fallidos cuestan pero no cuentan como tarificación', () => {
  const c = calcularCoste([t({ seg: 0 }), t({ seg: 0, estado: 'error_definitivo' })], [{ dia: '2026-10-06', eur: 0.2 }], AHORA)
  // 0,20 € de IA entre 2 trabajos; 1 ok → medio = 0,20 € (todo el gasto / ok).
  assert.equal(c.resumen.costeMedioEur, 0.2)
  assert.equal(c.resumen.iaIncluida, true)
  assert.equal(c.filas[0].iaEur, 0.2)
  assert.equal(c.resumen.proyeccion100Eur, 20)
  assert.equal(c.resumen.proyeccion1000Eur, 200)
})

test('coste del mes solo cuenta el mes natural; cancelados y en curso no', () => {
  const c = calcularCoste(
    [t({ seg: 60 }), t({ estado: 'cancelado' }), t({ estado: 'en_curso' }), t({ seg: 60, terminadoEn: '2026-09-20T09:01:00Z', iniciadoEn: '2026-09-20T09:00:00Z' })],
    null, AHORA,
  )
  assert.equal(c.resumen.trabajosMes, 1)
  assert.ok(Math.abs((c.resumen.costeMesEur as number) - Math.round(60 * FLY_EUR_POR_SEG * 100) / 100) < 0.011)
  assert.equal(c.filas.length, 2)
})
