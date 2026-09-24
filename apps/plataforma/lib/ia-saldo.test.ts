import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previsionSaldo, avisosTopeMensual, mensajeAviso, detalleLatido } from './ia-saldo.ts'

test('sin dos fotos separadas por un día no hay previsión (nunca «0 $/día»)', () => {
  assert.equal(previsionSaldo([], 10).estado, 'sin_historico')
  assert.equal(previsionSaldo([{ fecha: '2026-09-23', usadoUsd: 5 }], 10).estado, 'sin_historico')
  assert.equal(previsionSaldo([{ fecha: '2026-09-23', usadoUsd: 5 }, { fecha: '2026-09-23', usadoUsd: 6 }], 10).estado, 'sin_historico')
})

test('gasto medio = resta de fotos / días; días = restante / gasto', () => {
  const p = previsionSaldo([
    { fecha: '2026-09-20', usadoUsd: 10 },
    { fecha: '2026-09-22', usadoUsd: 11 },
    { fecha: '2026-09-23', usadoUsd: 11.5 },
  ], 3)
  assert.equal(p.estado, 'ok')
  if (p.estado !== 'ok') return
  assert.equal(p.muestraDias, 3)
  assert.equal(p.gastoDiarioUsd, 0.5)
  assert.equal(p.dias, 6)
})

test('la ventana es de 7 días: las fotos más viejas no diluyen el ritmo actual', () => {
  const p = previsionSaldo([
    { fecha: '2026-08-01', usadoUsd: 0 },
    { fecha: '2026-09-16', usadoUsd: 10 },
    { fecha: '2026-09-23', usadoUsd: 17 },
  ], 7)
  assert.equal(p.estado, 'ok')
  if (p.estado === 'ok') { assert.equal(p.gastoDiarioUsd, 1); assert.equal(p.dias, 7) }
})

test('sin gasto en la ventana → sin_gasto, no días infinitos', () => {
  const p = previsionSaldo([{ fecha: '2026-09-20', usadoUsd: 4 }, { fecha: '2026-09-23', usadoUsd: 4 }], 9)
  assert.equal(p.estado, 'sin_gasto')
})

test('tope mensual: avisa desde el 80 %, marca agotado al 100 %, ignora sin tope', () => {
  const a = avisosTopeMensual([
    { app: 'ia-rest', gastoEur: 9, limiteEur: 10 },
    { app: 'asegura', gastoEur: 2, limiteEur: 2 },
    { app: 'sivra', gastoEur: 1, limiteEur: 10 },
    { app: 'plataforma', gastoEur: 50, limiteEur: null },
    { app: 'rrhh', gastoEur: 50, limiteEur: 0 },
  ])
  assert.deepEqual(a.map(x => [x.app, x.agotado]), [['asegura', true], ['ia-rest', false]])
})

test('mensaje: nada que decir → null; pocos días → aviso con los días', () => {
  const ok = previsionSaldo([{ fecha: '2026-09-22', usadoUsd: 1 }, { fecha: '2026-09-23', usadoUsd: 2 }], 30)
  assert.equal(mensajeAviso({ restanteUsd: 30, umbralUsd: 5, prevision: ok, topes: [] }), null)
  const justo = previsionSaldo([{ fecha: '2026-09-22', usadoUsd: 1 }, { fecha: '2026-09-23', usadoUsd: 2 }], 6)
  const m = mensajeAviso({ restanteUsd: 6, umbralUsd: 5, prevision: justo, topes: [] })
  assert.ok(m && m.includes('6 días'))
})

test('mensaje: sin histórico sigue avisando por el umbral fijo en $, sin inventar días', () => {
  const m = mensajeAviso({ restanteUsd: 2, umbralUsd: 5, prevision: { estado: 'sin_historico', muestraDias: 0 }, topes: [] })
  assert.ok(m && m.includes('todavía no hay histórico'))
})

test('detalle: dice qué parte del gasto real no pasó por la pasarela, y si no se pudo sumar', () => {
  const p = { estado: 'sin_historico', muestraDias: 0 } as const
  assert.match(detalleLatido({ restanteUsd: 10, prevision: p, gastoRealUsd: 2, registradoUsd: 0.5 }), /fuera de la pasarela ~75 %/)
  assert.match(detalleLatido({ restanteUsd: 10, prevision: p, gastoRealUsd: 2, registradoUsd: null }), /no se pudo sumar/)
})
