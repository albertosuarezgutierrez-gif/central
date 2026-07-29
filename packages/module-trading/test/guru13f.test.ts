import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarMovimiento, movimientosGuru, conviccionGurus, type Cartera13F } from '../src/guru13f.ts'

test('clasificarMovimiento distingue nueva/amplia/mantiene/recorta/vende', () => {
  assert.equal(clasificarMovimiento(0, 100), 'nueva')
  assert.equal(clasificarMovimiento(100, 150), 'amplia')
  assert.equal(clasificarMovimiento(100, 100), 'mantiene')
  assert.equal(clasificarMovimiento(150, 100), 'recorta')
  assert.equal(clasificarMovimiento(100, 0), 'vende')
})

test('movimientosGuru compara dos trimestres del mismo gestor', () => {
  const previa: Cartera13F = { gestor: 'Buffett', posiciones: [{ simbolo: 'AAPL', acciones: 100 }, { simbolo: 'KO', acciones: 50 }] }
  const actual: Cartera13F = { gestor: 'Buffett', posiciones: [{ simbolo: 'AAPL', acciones: 100 }, { simbolo: 'OXY', acciones: 30 }] }
  const m = movimientosGuru(previa, actual)
  const byS = Object.fromEntries(m.map(x => [x.simbolo, x.tipo]))
  assert.equal(byS.AAPL, 'mantiene')
  assert.equal(byS.KO, 'vende')     // desaparece → vendida
  assert.equal(byS.OXY, 'nueva')    // aparece → nueva
})

test('conviccionGurus premia lo que VARIOS gestores compran a la vez', () => {
  const carteras = [
    { previa: { gestor: 'A', posiciones: [] }, actual: { gestor: 'A', posiciones: [{ simbolo: 'GOOGL', acciones: 100 }] } },      // A: nueva GOOGL
    { previa: { gestor: 'B', posiciones: [{ simbolo: 'GOOGL', acciones: 50 }] }, actual: { gestor: 'B', posiciones: [{ simbolo: 'GOOGL', acciones: 120 }] } }, // B: amplía GOOGL
    { previa: { gestor: 'C', posiciones: [{ simbolo: 'META', acciones: 80 }] }, actual: { gestor: 'C', posiciones: [] } },          // C: vende META
  ]
  const r = conviccionGurus(carteras)
  const googl = r.find(x => x.simbolo === 'GOOGL')!
  const meta = r.find(x => x.simbolo === 'META')!
  assert.equal(googl.comprando, 2)       // A abre + B amplía
  assert.equal(googl.score, 3)           // nueva(2) + amplia(1)
  assert.equal(meta.score, -2)           // vendida
  assert.equal(r[0].simbolo, 'GOOGL')    // el más comprado, arriba
})
