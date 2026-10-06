import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  produccionPorCompania,
  evaluarObjetivo,
  esCodigoProducto,
  TEXTO_PENDIENTE,
  type ReciboProduccion,
  type ObjetivoParaEvaluar,
} from './acuerdos-productividad.ts'
import type { ClaveParaAtribuir } from './acuerdos.ts'

// Datos FICTICIOS (ninguna cifra de ningún acuerdo real).
function recibo(p: Partial<ReciboProduccion> = {}): ReciboProduccion {
  return {
    polizaId: 'p1', companiaCodigoDgs: 'C9999', clase: 'NP', situacion: 'cobrado',
    fechaEfecto: '2026-03-10', primaNeta: '1000.00', comisionBruta: '120.00', ramo: 'hogar',
    codigoRecibo: 'K-1', codigoPoliza: null, ...p,
  }
}
const PERIODO = { desde: '2026-01-01', hasta: '2026-12-31' }

// ─── Producción ──────────────────────────────────────────────────────────────

test('produccion: NP cobrada, NP pendiente y cartera por separado; comisión solo de lo cobrado', () => {
  const [p] = produccionPorCompania([
    recibo(),
    recibo({ polizaId: 'p2', situacion: 'pendiente', primaNeta: '500.00' }),
    recibo({ polizaId: 'p3', clase: 'CA', primaNeta: '200.50', comisionBruta: '30.00' }),
    recibo({ polizaId: 'p4', situacion: 'anulado', primaNeta: '999.00' }),
  ], PERIODO)
  assert.deepEqual(p.npCobrada, { importe: 1000, recibos: 1, ilegibles: 0 })
  assert.deepEqual(p.npPendiente, { importe: 500, recibos: 1, ilegibles: 0 })
  assert.deepEqual(p.carteraCobrada, { importe: 200.5, recibos: 1, ilegibles: 0 })
  assert.deepEqual(p.comisionAplicada, { importe: 150, recibos: 2, ilegibles: 0 })
  assert.equal(p.polizasNp, 1)
})

test('produccion: un importe ilegible se CUENTA aparte, no suma 0 en silencio', () => {
  const [p] = produccionPorCompania([recibo(), recibo({ polizaId: 'p2', primaNeta: '1.234,56' })], PERIODO)
  assert.deepEqual(p.npCobrada, { importe: 1000, recibos: 2, ilegibles: 1 })
})

test('produccion: sin recibos en el periodo la compañía NO aparece (no es «0 €»)', () => {
  assert.deepEqual(produccionPorCompania([recibo({ fechaEfecto: '2025-12-31' })], PERIODO), [])
  const vacias = produccionPorCompania([recibo({ clase: 'NP', situacion: 'cobrado' })], PERIODO)[0]
  assert.equal(vacias.carteraCobrada.recibos, 0, 'cartera sin recibos = recibos 0, que se pinta «sin recibos»')
})

test('produccion: bordes del periodo incluidos y recibo sin fecha contado aparte', () => {
  const [p] = produccionPorCompania([
    recibo({ fechaEfecto: '2026-01-01T00:00:00.000Z' }),
    recibo({ polizaId: 'p2', fechaEfecto: '2026-12-31' }),
    recibo({ polizaId: 'p3', fechaEfecto: null }),
  ], PERIODO)
  assert.equal(p.npCobrada.recibos, 2)
  assert.equal(p.sinFecha, 1)
})

// ─── Objetivos ───────────────────────────────────────────────────────────────

const CLAVES: ClaveParaAtribuir[] = [{ id: 'k1', companiaCodigoDgs: 'C9999', codigosCima: ['K-1'] }]

function objetivo(p: Partial<ObjetivoParaEvaluar> = {}): ObjetivoParaEvaluar {
  return {
    tipo: 'rappel', ambito: 'individual', base: 'primas_np', criterioCobro: null, ramos: [],
    periodoDesde: '2026-01-01', periodoHasta: '2026-12-31',
    tramos: { estado: 'ok', tramos: [{ desde: 0, hasta: 2000, pct: 0, importe: null }, { desde: 2000, hasta: 5000, pct: 2, importe: null }, { desde: 5000, hasta: null, pct: 3, importe: null }] },
    siniestralidadMaxPct: null, ...p,
  }
}

function evaluar(p: { claveId?: string | null; revisado?: boolean; obj?: Partial<ObjetivoParaEvaluar>; recibos?: ReciboProduccion[]; hoy?: string; completo?: boolean } = {}) {
  return evaluarObjetivo({
    acuerdo: { claveId: p.claveId === undefined ? 'k1' : p.claveId, revisado: p.revisado ?? true },
    objetivo: objetivo(p.obj),
    recibos: p.recibos ?? [recibo({ primaNeta: '2500.00' })],
    claves: CLAVES,
    hoy: p.hoy ?? '2026-07-01',
    completo: p.completo ?? true,
  })
}

test('objetivo: sin clave → pendiente, aunque los números dieran verde', () => {
  assert.deepEqual(evaluar({ claveId: null }), { color: 'pendiente', motivo: 'sin_clave', detalle: null, medido: null })
})

test('objetivo: acuerdo SIN COTEJAR → pendiente, nunca alcanzado', () => {
  const r = evaluar({ revisado: false, recibos: [recibo({ primaNeta: '99999.00' })] })
  assert.equal(r.color, 'pendiente')
  assert.equal(r.color === 'pendiente' && r.motivo, 'sin_cotejar')
})

test('objetivo: colectivo, base no medible, siniestralidad y tramos rotos/vacíos → pendiente con su motivo', () => {
  const motivo = (o: Partial<ObjetivoParaEvaluar>) => { const r = evaluar({ obj: o }); return r.color === 'pendiente' ? r.motivo : r.color }
  assert.equal(motivo({ ambito: 'colectivo' }), 'colectivo')
  assert.equal(motivo({ base: 'otra' }), 'base_no_calculable')
  assert.equal(motivo({ base: 'crecimiento_pct' }), 'base_no_calculable')
  assert.equal(motivo({ siniestralidadMaxPct: 60 }), 'siniestralidad')
  assert.equal(motivo({ tramos: { estado: 'ilegible', motivo: 'x' } }), 'tramos_ilegibles')
  assert.equal(motivo({ tramos: { estado: 'ok', tramos: [] } }), 'sin_tramos')
  assert.equal(motivo({ base: null }), 'valor_fuera_de_lista')
})

test('objetivo: lectura truncada, recibos sin atribuir o primas ilegibles → pendiente', () => {
  const m = (r: ReturnType<typeof evaluar>) => (r.color === 'pendiente' ? r.motivo : r.color)
  assert.equal(m(evaluar({ completo: false })), 'lectura_incompleta')
  assert.equal(m(evaluar({ recibos: [recibo(), recibo({ polizaId: 'p2', codigoRecibo: 'DESCONOCIDO' })] })), 'recibos_sin_atribuir')
  assert.equal(m(evaluar({ recibos: [recibo({ codigoRecibo: null, codigoPoliza: null })] })), 'recibos_sin_atribuir')
  assert.equal(m(evaluar({ recibos: [recibo({ primaNeta: 'abc' })] })), 'importes_ilegibles')
})

test('objetivo: tramo alcanzado, siguiente, lo que falta y el rappel estimado', () => {
  const r = evaluar()
  assert.equal(r.color, 'alcanzado')
  if (r.color === 'pendiente') return
  assert.equal(r.medido, 2500)
  assert.equal(r.umbral, 2000)
  assert.equal(r.tramoAlcanzado?.desde, 2000)
  assert.equal(r.siguiente?.desde, 5000)
  assert.equal(r.falta, 2500)
  assert.equal(r.rappelEstimado, 50)
})

test('objetivo: solo cuenta la producción de SU clave (APROMES ≠ directo)', () => {
  const claves: ClaveParaAtribuir[] = [...CLAVES, { id: 'k2', companiaCodigoDgs: 'C9999', codigosCima: ['K-2'] }]
  const r = evaluarObjetivo({
    acuerdo: { claveId: 'k1', revisado: true }, objetivo: objetivo(), claves, hoy: '2026-07-01', completo: true,
    recibos: [recibo({ primaNeta: '1500.00' }), recibo({ polizaId: 'p2', codigoRecibo: 'K-2', primaNeta: '9000.00' })],
  })
  assert.equal(r.color !== 'pendiente' && r.medido, 1500)
})

test('objetivo: por debajo del ritmo con margen, «no llega» a menos de 90 días, y periodo cerrado', () => {
  const pocos = [recibo({ primaNeta: '100.00' })]
  const c = (hoy: string) => evaluar({ recibos: pocos, hoy }).color
  assert.equal(c('2026-03-15'), 'por_debajo')
  assert.equal(c('2026-11-15'), 'no_llega')
  assert.equal(c('2027-01-10'), 'no_llega')
  assert.equal(c('2026-01-10'), 'pendiente', 'menos de 30 días: no se proyecta')
  assert.equal(evaluar({ obj: { periodoDesde: '2026-09-01' }, hoy: '2026-07-01' }).color, 'pendiente')
})

test('objetivo: en camino cuando la proyección llega', () => {
  const r = evaluar({ recibos: [recibo({ primaNeta: '1500.00' })], hoy: '2026-07-01' })
  assert.equal(r.color, 'en_camino')
})

test('objetivo: criterio «emitidas» suma también lo pendiente; NULL cuenta solo lo cobrado', () => {
  const recibos = [recibo({ primaNeta: '1500.00' }), recibo({ polizaId: 'p2', situacion: 'pendiente', primaNeta: '1000.00' })]
  const emitidas = evaluar({ recibos, obj: { criterioCobro: 'emitidas' } })
  const sinCriterio = evaluar({ recibos })
  assert.equal(emitidas.color !== 'pendiente' && emitidas.medido, 2500)
  assert.equal(sinCriterio.color !== 'pendiente' && sinCriterio.medido, 1500)
})

test('objetivo: filtro de ramos y base en nº de pólizas', () => {
  const recibos = [recibo(), recibo({ polizaId: 'p2', ramo: 'auto' }), recibo({ polizaId: 'p2', ramo: 'auto' })]
  const hogar = evaluar({ recibos, obj: { ramos: ['hogar'] } })
  assert.equal(hogar.color !== 'pendiente' && hogar.medido, 1000)
  const polizas = evaluar({ recibos, obj: { base: 'polizas_np', tramos: { estado: 'ok', tramos: [{ desde: 2, hasta: null, pct: 1, importe: null }] } } })
  assert.equal(polizas.color !== 'pendiente' && polizas.medido, 2)
  assert.equal(polizas.color !== 'pendiente' && polizas.rappelEstimado, null, 'un % sobre nº de pólizas no da euros')
})

test('todos los motivos de pendiente tienen texto', () => {
  for (const [k, v] of Object.entries(TEXTO_PENDIENTE)) assert.ok(v.length > 10, k)
})

test('esCodigoProducto: códigos sí, nombres comerciales no', () => {
  for (const c of ['1434', '01480', 'HR', '302', '209-C']) assert.equal(esCodigoProducto(c), true, c)
  for (const c of ['Hogar Plus', 'Autos nuevo producto / Patinetes', '', ' 1434', 'Incremento % comisión', null, 1434]) {
    assert.equal(esCodigoProducto(c), false, String(c))
  }
})
