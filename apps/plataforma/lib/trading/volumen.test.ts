import test from 'node:test'
import assert from 'node:assert/strict'
import { acumulacionDistribucion, VOL_MEDIA_SESIONES, VOL_VENTANA } from './volumen.ts'
import type { PuntoVol } from './precios-stooq.ts'

// Serie base: volumen constante 1000 y precio plano. Sobre ella se inyectan picos en la ventana final.
function serie(n: number): PuntoVol[] {
  return Array.from({ length: n }, (_, i) => ({ fecha: `d${i}`, cierre: 100, volumen: 1000 }))
}
const N = VOL_MEDIA_SESIONES + VOL_VENTANA + 5

test('acumulacionDistribucion detecta picos de compra (volumen alto en días de subida)', () => {
  const s = serie(N)
  // 3 picos al alza dentro de la ventana final: volumen 2× y cierre por encima del día anterior.
  for (const k of [N - 3, N - 8, N - 13]) { s[k] = { fecha: s[k].fecha, cierre: 105, volumen: 2000 } }
  const r = acumulacionDistribucion(s)!
  assert.equal(r.spikesUp, 3)
  assert.equal(r.spikesDown, 0)
  assert.equal(r.veredicto, 'acumulacion')
})

test('acumulacionDistribucion detecta distribución (volumen alto en días de bajada)', () => {
  const s = serie(N)
  for (const k of [N - 4, N - 9]) { s[k] = { fecha: s[k].fecha, cierre: 95, volumen: 2000 } }
  const r = acumulacionDistribucion(s)!
  assert.equal(r.spikesDown, 2)
  assert.equal(r.veredicto, 'distribucion')
})

test('picos mezclados o días planos → neutral (el neto no llega al mínimo)', () => {
  const s = serie(N)
  s[N - 3] = { fecha: 'x', cierre: 105, volumen: 2000 }   // 1 arriba
  s[N - 8] = { fecha: 'y', cierre: 95, volumen: 2000 }    // 1 abajo
  s[N - 13] = { fecha: 'z', cierre: 100, volumen: 2000 }  // plano: no puntúa
  const r = acumulacionDistribucion(s)!
  assert.equal(r.veredicto, 'neutral')
})

test('serie corta o sin volumen → null', () => {
  assert.equal(acumulacionDistribucion(serie(VOL_MEDIA_SESIONES + VOL_VENTANA - 1)), null)
  const sinVol = serie(N).map(p => ({ ...p, volumen: null }))
  assert.equal(acumulacionDistribucion(sinVol), null)
})
