import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  brechaCalibracion,
  recorridoPalancas,
  decidirRecorrido,
  fraccionNecesaria,
  precioEnPercentil,
  percentilDe,
  MIN_NOCHES_MUESTRA,
  MIN_COMPS_CORPUS,
  BRECHA_DESVIADO,
  BRECHA_GRAVE,
} from './pricing-calibracion.ts'

/** Corpus sintético uniforme 100..199 € (100 comps): el percentil es directo de leer. */
const CORPUS = Array.from({ length: 100 }, (_, i) => 100 + i)

// ─── Percentiles ─────────────────────────────────────────────────────────────────────────────

test('precioEnPercentil interpola como percentile_cont', () => {
  assert.equal(precioEnPercentil([10, 20, 30], 0), 10)
  assert.equal(precioEnPercentil([10, 20, 30], 1), 30)
  assert.equal(precioEnPercentil([10, 20, 30], 0.5), 20)
  assert.equal(precioEnPercentil([10, 20, 30, 40], 0.5), 25)
})

test('precioEnPercentil no inventa nada sin corpus ni con percentil imposible', () => {
  assert.equal(precioEnPercentil([], 0.5), null)
  assert.equal(precioEnPercentil([10, 20], 1.5), null)
  assert.equal(precioEnPercentil([10, 20], Number.NaN), null)
})

test('percentilDe sitúa un precio dentro del corpus', () => {
  assert.equal(percentilDe(CORPUS, 100), 0)      // más barato que todo
  assert.equal(percentilDe(CORPUS, 150), 0.5)
  assert.equal(percentilDe(CORPUS, 1000), 1)     // más caro que todo
  assert.equal(percentilDe([], 120), null)
})

// ─── Check A: calibración (los cuatro casos REALES medidos el 03/09/2026) ────────────────────

test('caso Busto Reform: vende en P9 y tarifica a P55 → grave', () => {
  // ADR real 84€ sobre un corpus donde el 9% está por debajo.
  const corpus = [...Array(9).fill(70), ...Array(91).fill(200)]
  const r = brechaCalibracion({ adrReal: 84, nochesMuestra: 120, preciosMercado: corpus, targetPctl: 0.55 })
  assert.equal(r.estado, 'grave')
  assert.equal(r.pctlReal, 0.09)
  assert.ok(r.brecha !== null && Math.abs(r.brecha - 0.46) < 1e-9)
  assert.match(r.motivo, /P9/)
  assert.match(r.motivo, /ENCIMA de donde vende/)
})

test('caso House Sevillana: vende en P57 y tarifica a P60 → ok (el único calibrado)', () => {
  const corpus = [...Array(57).fill(400), ...Array(43).fill(900)]
  const r = brechaCalibracion({ adrReal: 560, nochesMuestra: 200, preciosMercado: corpus, targetPctl: 0.60 })
  assert.equal(r.estado, 'ok')
  assert.equal(r.pctlReal, 0.57)
})

test('una brecha de 20 puntos es desviado, no grave', () => {
  const r = brechaCalibracion({ adrReal: 130, nochesMuestra: 60, preciosMercado: CORPUS, targetPctl: 0.50 })
  assert.equal(r.pctlReal, 0.30)
  assert.equal(r.estado, 'desviado')
})

test('los umbrales son inclusivos por abajo: justo 0,15 sigue siendo ok', () => {
  const r = brechaCalibracion({ adrReal: 135, nochesMuestra: 60, preciosMercado: CORPUS, targetPctl: 0.50 })
  assert.equal(r.pctlReal, 0.35)
  assert.ok(Math.abs(Math.abs(r.brecha!) - BRECHA_DESVIADO) < 1e-9)
  assert.equal(r.estado, 'ok')
})

test('justo por encima de 0,30 salta a grave', () => {
  const r = brechaCalibracion({ adrReal: 119, nochesMuestra: 60, preciosMercado: CORPUS, targetPctl: 0.50 })
  assert.equal(r.pctlReal, 0.19)
  assert.ok(Math.abs(r.brecha!) > BRECHA_GRAVE)
  assert.equal(r.estado, 'grave')
})

test('la brecha también dispara al REVÉS: vender por encima de lo que se pide es regalar precio', () => {
  const r = brechaCalibracion({ adrReal: 190, nochesMuestra: 60, preciosMercado: CORPUS, targetPctl: 0.30 })
  assert.equal(r.pctlReal, 0.90)
  assert.ok(r.brecha! < 0)
  assert.equal(r.estado, 'grave')
  assert.match(r.motivo, /regalando precio/)
})

test('SIN MUESTRA NO ES "ok": pocas noches → sin_muestra y percentil null', () => {
  const r = brechaCalibracion({
    adrReal: 84, nochesMuestra: MIN_NOCHES_MUESTRA - 1, preciosMercado: CORPUS, targetPctl: 0.55,
  })
  assert.equal(r.estado, 'sin_muestra')
  assert.equal(r.pctlReal, null)
  assert.equal(r.brecha, null)
  assert.match(r.motivo, /noches vendidas/)
})

test('sin ADR (columna a NULL) → sin_muestra, nunca un percentil inventado', () => {
  const r = brechaCalibracion({ adrReal: null, nochesMuestra: 500, preciosMercado: CORPUS, targetPctl: 0.55 })
  assert.equal(r.estado, 'sin_muestra')
  assert.equal(r.pctlReal, null)
})

test('corpus flojo → sin_muestra (no se sitúa un ADR sobre cuatro comps)', () => {
  const r = brechaCalibracion({
    adrReal: 84, nochesMuestra: 300, preciosMercado: CORPUS.slice(0, MIN_COMPS_CORPUS - 1), targetPctl: 0.55,
  })
  assert.equal(r.estado, 'sin_muestra')
  assert.match(r.motivo, /corpus/)
})

test('target_pctl imposible → sin_muestra, no se compara contra basura', () => {
  const r = brechaCalibracion({ adrReal: 120, nochesMuestra: 300, preciosMercado: CORPUS, targetPctl: 7 })
  assert.equal(r.estado, 'sin_muestra')
  assert.match(r.motivo, /target_pctl/)
})

// ─── fraccionNecesaria ───────────────────────────────────────────────────────────────────────

test('fraccionNecesaria: ADR 84€ contra un ancla de 210€ pide bajar al 40% del ancla', () => {
  const corpus = Array.from({ length: 100 }, (_, i) => 100 + i * 2) // 100..298
  const f = fraccionNecesaria({ adrReal: 84, preciosMercado: corpus, targetPctl: 0.55 })
  const ancla = precioEnPercentil(corpus, 0.55)!
  assert.ok(Math.abs(f! - 84 / ancla) < 1e-9)
  assert.ok(f! < 0.45)
})

test('fraccionNecesaria devuelve null sin ADR o sin corpus', () => {
  assert.equal(fraccionNecesaria({ adrReal: null, preciosMercado: CORPUS, targetPctl: 0.5 }), null)
  assert.equal(fraccionNecesaria({ adrReal: 100, preciosMercado: [], targetPctl: 0.5 }), null)
})

// ─── Check B: recorrido de palancas ──────────────────────────────────────────────────────────

test('el motor REAL del 03/09/2026: −10% calidad, prior muerto, urgencia k=0,5 → ~0,7875 del ancla', () => {
  const r = recorridoPalancas({
    clampCalidadMin: 0.90,
    priorBajadaMax: 0.85,
    priorBajadaViva: false,   // solo entra sin bucket de mes, y siempre lo hay
    lastminuteK: 0.5,
    lastminuteDescuentoMax: 0.25,
    pilotEscribe: false,      // pilot_enabled anota, no escribe precio
  })
  assert.ok(Math.abs(r.recorridoMin - 0.9 * 0.875) < 1e-6)
  assert.deepEqual(r.palancasMuertas, ['prior_estacional', 'piloto'])
})

test('con todas las palancas vivas el recorrido es mayor y no hay muertas', () => {
  const r = recorridoPalancas({
    clampCalidadMin: 0.90, priorBajadaMax: 0.85, priorBajadaViva: true,
    lastminuteK: 1, lastminuteDescuentoMax: 0.25, pilotEscribe: true,
  })
  assert.ok(Math.abs(r.recorridoMin - 0.9 * 0.85 * 0.75) < 1e-6)
  assert.deepEqual(r.palancasMuertas, [])
})

test('todas las palancas apagadas: el motor no puede bajar del ancla', () => {
  const r = recorridoPalancas({
    clampCalidadMin: 1, priorBajadaMax: 1, priorBajadaViva: false,
    lastminuteK: 0, lastminuteDescuentoMax: 0.25, pilotEscribe: false,
  })
  assert.equal(r.recorridoMin, 1)
  assert.deepEqual(r.palancasMuertas, ['clamp_calidad', 'prior_estacional', 'lastminute', 'piloto'])
})

test('el caso que llevaba meses pasando: hace falta el 40% del ancla y el motor llega al 79% → alerta', () => {
  const rec = recorridoPalancas({
    clampCalidadMin: 0.90, priorBajadaMax: 0.85, priorBajadaViva: false,
    lastminuteK: 0.5, lastminuteDescuentoMax: 0.25, pilotEscribe: false,
  })
  const v = decidirRecorrido({ recorridoMin: rec.recorridoMin, fraccionNecesaria: 0.40, palancasMuertas: rec.palancasMuertas })
  assert.equal(v.alerta, true)
  assert.equal(v.evaluado, true)
  assert.ok(v.faltanPct! > 0.38)
  assert.match(v.motivo, /prior_estacional/)
})

test('si la bajada que hace falta cae dentro del recorrido, no se avisa', () => {
  const v = decidirRecorrido({ recorridoMin: 0.7875, fraccionNecesaria: 0.85, palancasMuertas: [] })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
  assert.match(v.motivo, /llega/)
})

test('la holgura de 2 puntos evita el aviso por redondeo', () => {
  const v = decidirRecorrido({ recorridoMin: 0.80, fraccionNecesaria: 0.79, palancasMuertas: [] })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
})

test('si no hace falta bajar (precio realizado por encima del ancla) el check calla', () => {
  const v = decidirRecorrido({ recorridoMin: 0.7875, fraccionNecesaria: 1.2, palancasMuertas: ['piloto'] })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
  assert.match(v.motivo, /no hace falta bajar/)
})

test('sin fracción necesaria NO dice "el motor llega": dice que no lo ha podido mirar', () => {
  const v = decidirRecorrido({ recorridoMin: 0.7875, fraccionNecesaria: null, palancasMuertas: [] })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, false)
  assert.equal(v.faltanPct, null)
})
