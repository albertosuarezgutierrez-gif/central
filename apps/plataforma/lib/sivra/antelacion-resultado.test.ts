import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluarAntelacion, MIN_RESUELTAS } from './antelacion-resultado.ts'

const BASE = {
  nochesConPremio: 60,
  premioMedio: 0.18,
  pendientes: 0,
  resueltas: 40,
  vendidas: 26,
  sinDato: 0,
  extraEur: 950,
  ocupacionReferencia: 0.62,
}

test('sin noches premiadas dice que no ha actuado, no que no sirva', () => {
  const r = evaluarAntelacion({ ...BASE, nochesConPremio: 0 })
  assert.equal(r.estado, 'apagada')
  assert.equal(r.ocupacion, null)
})

test('las noches FUTURAS no cuentan como vacías', () => {
  // El caso del primer mes: todo el premio está por delante.
  const r = evaluarAntelacion({
    ...BASE, nochesConPremio: 45, pendientes: 45, resueltas: 0, vendidas: 0, extraEur: 0,
  })
  assert.equal(r.estado, 'pendiente')
  assert.match(r.detalle, /NO es una noche vacía/)
  assert.equal(r.deltaOcupacionPp, null)
})

test('con muestra corta NO se emite veredicto por bueno que pinte el extra', () => {
  const r = evaluarAntelacion({ ...BASE, resueltas: MIN_RESUELTAS - 1, vendidas: 19, extraEur: 4000 })
  assert.equal(r.estado, 'pendiente')
})

test('sin referencia histórica no se declara a favor aunque haya extra', () => {
  const r = evaluarAntelacion({ ...BASE, ocupacionReferencia: null })
  assert.equal(r.estado, 'sin_referencia')
  assert.ok(r.ocupacion != null)
  assert.match(r.detalle, /no se puede saber si el premio ha costado reservas/)
})

test('a favor: se cobra más y la ocupación aguanta', () => {
  const r = evaluarAntelacion(BASE) // 26/40 = 65% contra 62%
  assert.equal(r.estado, 'a_favor')
  assert.ok(r.deltaOcupacionPp! > 0)
  assert.match(r.titular, /950€/)
})

test('en contra: la ocupación se hunde aunque el extra sea positivo', () => {
  const r = evaluarAntelacion({ ...BASE, vendidas: 20, ocupacionReferencia: 0.75 }) // 50% vs 75%
  assert.equal(r.estado, 'en_contra')
  assert.ok(r.deltaOcupacionPp! < 0)
})

test('la caída manda sobre el extra: no se compensa un lado con el otro', () => {
  const r = evaluarAntelacion({ ...BASE, vendidas: 22, ocupacionReferencia: 0.68, extraEur: 5000 })
  assert.equal(r.estado, 'en_contra') // 55% vs 68% = -13 pp
})

test('neutro: la ocupación aguanta pero no se ha cobrado nada de más', () => {
  const r = evaluarAntelacion({ ...BASE, extraEur: 0 })
  assert.equal(r.estado, 'neutro')
})

test('el hueco de noches sin dato se DECLARA, no se cuenta como vacío', () => {
  const r = evaluarAntelacion({ ...BASE, resueltas: 5, sinDato: 30, pendientes: 25 })
  assert.equal(r.estado, 'pendiente')
  assert.match(r.detalle, /no consta si se vendieron/)
})

test('la ocupación se calcula solo sobre las noches CON dato', () => {
  const r = evaluarAntelacion({ ...BASE, resueltas: 40, vendidas: 26, sinDato: 100 })
  assert.equal(Math.round(r.ocupacion! * 100), 65) // 26/40, no 26/140
})
