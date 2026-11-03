// Tope de avances de paso por regla (Alberto, 03/11/2026, opción A): 6 SOLO para la regla del avance sin rótulo de la simulación de
// Vivienda de Fidelidade; todo lo demás sigue en `MAX_AVANCES_POR_ID` (3). Puras; cada brazo que debe dar 3, en rojo si se ensancha.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ENTRADAS_EXPLORACION, type AvanceSinTexto } from '@central/module-tarificacion'
import { claveTopeAvanceSinTexto, MAX_AVANCES_POR_ID, TOPES_AVANCES_POR_REGLA, topeAvancesPaso } from '../src/guard.ts'

const FI = 'fidelidade:particulares:vivienda'
const REGLA = ENTRADAS_EXPLORACION[FI].avancesSinTexto![0]
const otra = (r: Partial<AvanceSinTexto>): AvanceSinTexto => ({ ...REGLA, ...r }) as AvanceSinTexto

test('el tope por defecto sigue en 3 y el mapa solo tiene la regla de Fidelidade Vivienda (6)', () => {
  assert.equal(MAX_AVANCES_POR_ID, 3)
  assert.deepEqual({ ...TOPES_AVANCES_POR_REGLA }, { 'fidelidade:vivienda': 6 })
})

test('Fidelidade Vivienda, avance sin rótulo de su regla → 6', () => {
  assert.equal(claveTopeAvanceSinTexto(FI, REGLA), 'fidelidade:vivienda')
  assert.equal(topeAvancesPaso(FI, false, REGLA), 6)
})

test('BRAZO avance por id (cualquier compañía, también Fidelidade) → 3', () => {
  assert.equal(topeAvancesPaso(FI, true, REGLA), 3)
  assert.equal(topeAvancesPaso('allianz:particulares:auto', true, null), 3)
})

test('BRAZO otra entrada con la misma regla → 3', () => {
  for (const entrada of ['fidelidade:particulares:auto', 'allianz:particulares:vivienda', 'pelayo:presupuestos:hogar', '']) {
    assert.equal(topeAvancesPaso(entrada, false, REGLA), 3, entrada)
  }
})

test('BRAZO sin regla → 3', () => {
  assert.equal(topeAvancesPaso(FI, false, null), 3)
})

test('BRAZO otro origen → 3', () => {
  assert.equal(topeAvancesPaso(FI, false, otra({ origen: 'https://otro.fidelidade.es' })), 3)
})

test('BRAZO una ruta fuera de /OPI_ES_Vivienda/ o lista vacía → 3', () => {
  assert.equal(topeAvancesPaso(FI, false, otra({ rutas: [...REGLA.rutas, '/OPI_ES_Contratacion/Pago.aspx'] })), 3)
  assert.equal(topeAvancesPaso(FI, false, otra({ rutas: [] })), 3)
})
