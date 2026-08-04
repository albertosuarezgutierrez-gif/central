import test from 'node:test'
import assert from 'node:assert/strict'
import { fuerzaRelativaEnCaidas } from './fuerza-relativa.ts'

// Bench sintético: cae -1% cada 4ª sesión, plano el resto. La acción según el escenario.
function series(n: number, retAccion: (benchCae: boolean, i: number) => number): { a: number[]; b: number[] } {
  const a = [100]; const b = [100]
  for (let i = 1; i <= n; i++) {
    const cae = i % 4 === 0
    b.push(b[i - 1] * (1 + (cae ? -0.01 : 0.001)))
    a.push(a[i - 1] * (1 + retAccion(cae, i)))
  }
  return { a, b }
}

test('acción que SUBE en los días de caída del índice → resiste (la intuición de Alberto)', () => {
  const { a, b } = series(120, cae => (cae ? +0.004 : 0.001))
  const r = fuerzaRelativaEnCaidas(a, b)!
  assert.equal(r.veredicto, 'resiste')
  assert.ok(r.pctVerdes === 1)
  assert.ok(r.diasCaida >= 8)
  assert.ok(r.medianaBench <= -0.005)
})

test('acción que cae menos que el índice → acompaña; que cae más → sufre', () => {
  const menos = series(120, cae => (cae ? -0.004 : 0.001))
  assert.equal(fuerzaRelativaEnCaidas(menos.a, menos.b)!.veredicto, 'acompaña')
  const mas = series(120, cae => (cae ? -0.02 : 0.001))
  assert.equal(fuerzaRelativaEnCaidas(mas.a, mas.b)!.veredicto, 'sufre')
})

test('sin solape o sin días de caída suficientes → null', () => {
  assert.equal(fuerzaRelativaEnCaidas([100, 101], [100, 99]), null)
  const sinCaidas = series(120, () => 0.001)
  const planas = { a: sinCaidas.a, b: sinCaidas.a }   // bench nunca cae 0,5%
  assert.equal(fuerzaRelativaEnCaidas(planas.a, planas.b), null)
})
