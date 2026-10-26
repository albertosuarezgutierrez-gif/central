import { test } from 'node:test'
import assert from 'node:assert/strict'
import { carteraVsSpy, type PuntoCartera, type CierreSpy } from './cartera-vs-spy.ts'

const fechas = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19']
const track = (valores: number[], inv: number[] = valores.map(() => 1000)): PuntoCartera[] =>
  valores.map((v, i) => ({ fecha: fechas[i], valor: v, invertido: inv[i], completo: true }))
const spyDe = (cierres: number[]): CierreSpy[] => cierres.map((c, i) => ({ fecha: fechas[i], cierre: c }))

test('cartera gana y SPY sube menos: diferencia positiva', () => {
  const r = carteraVsSpy(track([1000, 1020, 1040, 1050, 1100]), spyDe([500, 505, 510, 510, 525]))
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.ok(Math.abs(r.rentCarteraPct - 10) < 1e-9)
  assert.ok(Math.abs(r.rentSpyPct - 5) < 1e-9)
  assert.ok(Math.abs(r.diferenciaPp - 5) < 1e-9)
  assert.equal(r.dias, 4)
})

test('cartera pierde mientras SPY sube: diferencia negativa', () => {
  const r = carteraVsSpy(track([1000, 990, 980, 970, 950]), spyDe([500, 505, 510, 515, 520]))
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.ok(r.rentCarteraPct < 0 && r.diferenciaPp < 0)
})

test('aportación a mitad NO cuenta como rentabilidad', () => {
  // Día 3 se aportan 1.000: valor 1000→(1000+1000)=2000 sin ganancia alguna.
  const r = carteraVsSpy(track([1000, 1000, 2000, 2000, 2000], [1000, 1000, 2000, 2000, 2000]), spyDe([500, 500, 500, 500, 500]))
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.ok(Math.abs(r.rentCarteraPct) < 1e-9)
  // Sin corregir saldría +100%.
})

test('menos de 5 puntos completos -> sin_datos_suficientes (no 0%)', () => {
  const r = carteraVsSpy(track([1000, 1010, 1020, 1030]), spyDe([500, 501, 502, 503]))
  assert.equal(r.estado, 'sin_datos_suficientes')
  assert.equal(r.rentCarteraPct, null)
  assert.equal(r.diferenciaPp, null)
})

test('los puntos incompletos no cuentan', () => {
  const t = track([1000, 1010, 1020, 1030, 1040]); t[2].completo = false
  assert.equal(carteraVsSpy(t, spyDe([500, 501, 502, 503, 504])).estado, 'sin_datos_suficientes')
})

test('SPY faltante en una fecha -> sin_datos_suficientes', () => {
  const spy = spyDe([500, 501, 502, 503, 504]).filter(c => c.fecha !== '2026-10-14')
  // el 14 se cubre con el cierre del 13 (hueco ≤4 días): válido
  assert.equal(carteraVsSpy(track([1000, 1010, 1020, 1030, 1040]), spy).estado, 'ok')
  // SPY sin datos cercanos al inicio: no válido
  const lejos = [{ fecha: '2026-09-01', cierre: 500 }, ...spyDe([500, 501, 502, 503, 504]).slice(2)]
  assert.equal(carteraVsSpy(track([1000, 1010, 1020, 1030, 1040]), lejos).estado, 'sin_datos_suficientes')
  assert.equal(carteraVsSpy(track([1000, 1010, 1020, 1030, 1040]), []).estado, 'sin_datos_suficientes')
})

test('valor null en un punto completo -> sin_datos_suficientes', () => {
  const t = track([1000, 1010, 1020, 1030, 1040]); t[3].valor = null
  assert.equal(carteraVsSpy(t, spyDe([500, 501, 502, 503, 504])).estado, 'sin_datos_suficientes')
})
