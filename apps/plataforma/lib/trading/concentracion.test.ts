import test from 'node:test'
import assert from 'node:assert/strict'
import { correlacionMediaCesta, etiquetaConcentracion, parMasCorrelacionado } from './concentracion.ts'

// Series sintéticas: base común + ruido determinista → correlación alta; independientes → baja.
function serie(n: number, motor: (i: number) => number): number[] {
  const out = [100]
  for (let i = 1; i <= n; i++) out.push(out[i - 1] * (1 + motor(i)))
  return out
}
const ondaA = (i: number) => Math.sin(i / 3) * 0.02
const ruido = (sem: number) => (i: number) => Math.sin(i * sem * 7.13 + sem) * 0.02

test('cesta movida por el MISMO motor → correlación alta; independientes → baja', () => {
  const clones = [1, 2, 3, 4].map(s => serie(80, i => ondaA(i) + ruido(s)(i) * 0.2))
  const altas = correlacionMediaCesta(clones)!
  assert.ok(altas > 0.7, `esperaba >0,7 y salió ${altas}`)

  const sueltas = [1, 2, 3, 4].map(s => serie(80, ruido(s)))
  const bajas = correlacionMediaCesta(sueltas)!
  assert.ok(Math.abs(bajas) < 0.5, `esperaba <0,5 y salió ${bajas}`)
})

test('sin series/solape suficientes → null (mejor callar)', () => {
  assert.equal(correlacionMediaCesta([serie(80, ondaA), serie(80, ondaA)]), null)      // <4 series
  assert.equal(correlacionMediaCesta([1, 2, 3, 4].map(() => serie(10, ondaA))), null)  // series cortas
})

test('etiquetaConcentracion clasifica por umbral', () => {
  assert.ok(etiquetaConcentracion(0.8).includes('🔴'))
  assert.ok(etiquetaConcentracion(0.6).includes('🟡'))
  assert.ok(etiquetaConcentracion(0.3).includes('🟢'))
})

test('parMasCorrelacionado delata el clúster que la media esconde', () => {
  // 2 clones (mismo motor) entre 3 independientes: la MEDIA de los 10 pares sale baja, el par no.
  const simbolos = ['SNDK', 'WDC', 'BKNG', 'NLY', 'MOH']
  const series = [
    serie(80, i => ondaA(i) + ruido(1)(i) * 0.1),
    serie(80, i => ondaA(i) + ruido(2)(i) * 0.1),
    serie(80, ruido(3)), serie(80, ruido(4)), serie(80, ruido(5)),
  ]
  const media = correlacionMediaCesta(series)!
  assert.ok(media < 0.5, `la media debía quedar baja y salió ${media}`)
  const par = parMasCorrelacionado(simbolos, series)!
  assert.deepEqual([par.a, par.b], ['SNDK', 'WDC'])
  assert.ok(par.correlacion > 0.7, `esperaba >0,7 y salió ${par.correlacion}`)
})

test('parMasCorrelacionado sin solape suficiente → null (mejor callar)', () => {
  assert.equal(parMasCorrelacionado(['A', 'B'], [serie(10, ondaA), serie(10, ondaA)]), null)
  assert.equal(parMasCorrelacionado([], []), null)
})
