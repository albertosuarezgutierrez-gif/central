import test from 'node:test'
import assert from 'node:assert/strict'
import {
  retornoVentana, evaluarCestaVsBenchAlineada, curvasAlineadas, metricasRiesgoAlineadas,
} from '../src/medicionAlineada.ts'
import type { PuntoSerie } from '../src/medicionAlineada.ts'

// Serie diaria sintética [desde..desde+n días], saltando fines de semana no hace falta para el test.
function serie(desde: string, cierres: number[]): PuntoSerie[] {
  const d0 = Date.parse(desde)
  return cierres.map((cierre, i) => ({ fecha: new Date(d0 + i * 86_400_000).toISOString().slice(0, 10), cierre }))
}

test('retornoVentana: serie completa mide la ventana pedida', () => {
  const s = serie('2026-07-01', [100, 101, 102, 103, 104, 105, 106, 107, 108, 110])
  const r = retornoVentana(s, '2026-07-01', '2026-07-10')
  assert.ok(r != null && Math.abs(r - 0.1) < 1e-9)
})

test('retornoVentana: la serie TRUNCADA de Stooq (empieza tarde) NO devuelve un retorno de otra ventana', () => {
  // Caso de la auditoría 11/08/2026: Stooq limita IPs de datacenter y devuelve solo el tramo final;
  // con ≥2 puntos no se caía a Yahoo y el retorno se medía sobre 10 días en vez de 40 — indistinguible
  // del real. Con cobertura exigida, sale null (y el consumidor lo declara), no un número de otra ventana.
  const truncada = serie('2026-07-31', [100, 101, 102, 103, 105])   // la ventana empieza el 01/07
  assert.equal(retornoVentana(truncada, '2026-07-01', '2026-08-04'), null)
})

test('retornoVentana: serie que ACABA pronto tampoco cubre (fuente congelada)', () => {
  const congelada = serie('2026-07-01', [100, 101, 102, 103, 104])  // último punto 05/07; ventana hasta 04/08
  assert.equal(retornoVentana(congelada, '2026-07-01', '2026-08-04'), null)
})

test('retornoVentana: la tolerancia cubre finde + festivo + cierre publicado con retraso', () => {
  // Primer cierre 4 días después del inicio (finde+festivo) y último 3 días antes del fin (viernes,
  // medido en lunes): dentro de la tolerancia de 6 días naturales → se mide.
  const s = serie('2026-07-05', [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125])
  assert.ok(retornoVentana(s, '2026-07-01', '2026-08-02') != null)
})

test('evaluarCestaVsBenchAlineada declara los símbolos sin cobertura en sinDatos', () => {
  const bench = serie('2026-07-01', Array.from({ length: 35 }, (_, i) => 100 + i))
  const ok = serie('2026-07-01', Array.from({ length: 35 }, (_, i) => 50 + i))
  const truncada = serie('2026-07-28', [10, 11, 12, 13, 14, 15, 16, 17])
  const r = evaluarCestaVsBenchAlineada(
    [{ simbolo: 'OK', puntos: ok }, { simbolo: 'TRUNC', puntos: truncada }],
    bench, '2026-07-01', '2026-08-04',
  )
  assert.ok(r)
  assert.equal(r.n, 1)
  assert.equal(r.total, 2)
  assert.deepEqual(r.sinDatos, ['TRUNC'])
})

test('evaluarCestaVsBenchAlineada: sin benchmark que cubra la ventana no hay medición', () => {
  const benchTruncado = serie('2026-07-28', [100, 101, 102])
  const s = serie('2026-07-01', Array.from({ length: 35 }, (_, i) => 100 + i))
  assert.equal(evaluarCestaVsBenchAlineada([{ simbolo: 'X', puntos: s }], benchTruncado, '2026-07-01', '2026-08-04'), null)
})

test('riesgo alineado: el drawdown de cesta y bench se mide sobre el MISMO calendario', () => {
  // El bench cae un 20% en la primera semana y se recupera; la serie truncada solo existe DESPUÉS
  // de la caída. Con el alineado, la serie truncada queda FUERA (no cubre) — el cociente de drawdowns
  // ya no compara la caída de 5 semanas del SPY contra 1 semana tranquila de la cesta.
  const bench = serie('2026-07-01', [100, 95, 90, 85, 80, 82, 85, 88, 90, 92, 94, 96, 98, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121])
  const completa = serie('2026-07-01', Array.from({ length: 35 }, (_, i) => 100 + i))   // sin caídas
  const truncada = serie('2026-07-28', [100, 100, 100, 100, 100, 100, 100, 100])
  const r = metricasRiesgoAlineadas([completa.map(p => p), truncada], bench, '2026-07-01', '2026-08-04')
  assert.ok(r)
  assert.equal(r.nSeries, 1)                       // la truncada NO entra
  assert.equal(r.maxDrawdown, 0)                   // la cesta (solo la completa) no cae
  assert.ok(r.maxDrawdownBench < -0.19)            // el bench sí, y medido en la MISMA ventana
})

test('curvasAlineadas rellena huecos intermedios arrastrando el último cierre', () => {
  const bench = serie('2026-07-01', [100, 101, 102, 103, 104, 105, 106, 107, 108, 110])
  // La serie salta el día 3 (festivo de la fuente): se arrastra el cierre anterior, no se descuadra el calendario.
  const conHueco = serie('2026-07-01', [50, 51, 52, 53, 54, 55, 56, 57, 58, 60]).filter(p => p.fecha !== '2026-07-03')
  const r = curvasAlineadas([conHueco], bench, '2026-07-01', '2026-07-10')
  assert.ok(r)
  assert.equal(r.curvaCesta.length, r.curvaBench.length)
  assert.equal(r.curvaCesta.length, 10)
  assert.ok(r.curvaCesta.every(v => Number.isFinite(v)))
})
