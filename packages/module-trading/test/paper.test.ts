import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dimensionar, abrir, venceVentana, cerrar, pnlPosicion } from '../src/paper.ts'
import type { PaperPosicion } from '../src/types.ts'

test('dimensionar respeta el riesgo por operación (1% del NAV / distancia al stop)', () => {
  // NAV 10.000, riesgo 1% = 100€; entrada 100, stop 90 → distancia 10 → 10 acciones.
  assert.equal(dimensionar(10_000, 100, 90, 0.01), 10)
})

test('dimensionar es 0 si el stop está por encima de la entrada (inválido)', () => {
  assert.equal(dimensionar(10_000, 100, 105, 0.01), 0)
})

test('abrir guarda la distancia de 2·ATR (ancla del TAMAÑO) y el horizonte de la tesis', () => {
  const p = abrir('NVDA', 10, 100, 3, '2026-07-17', 10)  // 100 - 2*ATR(3) = 94
  assert.equal(p.stop, 94)
  assert.equal(p.horizonteDias, 10)
})

// ── H9 (resuelta): la ÚNICA salida del paper es por TIEMPO. Nada vende por el precio del «stop».
test('venceVentana cierra al cumplirse la ventana declarada, no antes', () => {
  const p: PaperPosicion = { simbolo: 'X', cantidad: 10, precioEntrada: 100, stop: 94, abiertaEn: '2026-08-01', horizonteDias: 10 }
  assert.equal(venceVentana(p, '2026-08-10'), false)
  assert.equal(venceVentana(p, '2026-08-11'), true)   // 10 días exactos
  assert.equal(venceVentana(p, '2026-08-20'), true)   // vencida hace tiempo
})

test('sin horizonte conocido NO se cierra: inventar la venta es peor que dejarla abierta', () => {
  const sinH: PaperPosicion = { simbolo: 'X', cantidad: 10, precioEntrada: 100, stop: 94, abiertaEn: '2026-01-01' }
  assert.equal(venceVentana(sinH, '2026-08-20'), false)
  assert.equal(venceVentana({ ...sinH, horizonteDias: null }, '2026-08-20'), false)
  assert.equal(venceVentana({ ...sinH, horizonteDias: 0 }, '2026-08-20'), false)
})

test('un precio hundido NO cierra nada: la salida no mira el precio', () => {
  const p: PaperPosicion = { simbolo: 'X', cantidad: 10, precioEntrada: 100, stop: 94, abiertaEn: '2026-08-01', horizonteDias: 10 }
  // El día 5 con el valor a la mitad sigue sin vencer: eso es exactamente lo que H9 pide.
  assert.equal(venceVentana(p, '2026-08-06'), false)
})

test('pnlPosicion calcula ganancia/pérdida', () => {
  const p: PaperPosicion = { simbolo: 'X', cantidad: 10, precioEntrada: 100, stop: 94, abiertaEn: 'd' }
  assert.equal(pnlPosicion(p, 110), 100)
  assert.equal(pnlPosicion(p, 95), -50)
})
