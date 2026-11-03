// Runner: `node --test --experimental-strip-types lib/simulador-hipotetico.test.ts`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIMITE_PLAN_EMPLEO_AUTONOMO, normalizarPartidas, simularPartidas, type PartidaHipotetica } from './simulador-hipotetico.ts'
import { ctxFixture, entradaFixture } from './resultado-declaracion.fixture.ts'

const cerca = (a: number | null | undefined, b: number, tol = 0.011) => assert.ok(a != null && Math.abs(a - b) <= tol, `${a} ≉ ${b}`)
const base = (r: ReturnType<typeof simularPartidas>['antes'], q: 'conjunta' | 'alberto' | 'pilar') =>
  (q === 'conjunta' ? r.conjunta : r.individual).contribuyentes.find(c => c.titular === (q === 'conjunta' ? 'unidad_familiar' : q))!.baseLiquidable!
const P = (p: Omit<PartidaHipotetica, 'id' | 'concepto'>): PartidaHipotetica => ({ id: 'x', concepto: 'test', ...p })

test('sin partidas: antes = después y ahorro 0', () => {
  const s = simularPartidas(entradaFixture(), ctxFixture(), [])
  assert.deepEqual(s.delta, { conjunta: 0, individual: 0, alberto: 0, pilar: 0, mejor: 0 })
})

test('gasto de Socorro 3.000€ (50/50): −1.500€ de base a cada uno, −3.000€ en conjunta, y el resultado baja', () => {
  const e = entradaFixture(), c = ctxFixture()
  const s = simularPartidas(e, c, [P({ tipo: 'gasto_piso', importe: 3000, propertyId: 'prop_socorro' })])
  cerca(base(s.antes, 'alberto') - base(s.despues, 'alberto'), 1500)
  cerca(base(s.antes, 'pilar') - base(s.despues, 'pilar'), 1500)
  cerca(base(s.antes, 'conjunta') - base(s.despues, 'conjunta'), 3000)
  assert.ok(s.delta.conjunta! > 0 && s.delta.conjunta! < 3000, 'ahorro = tipo marginal × gasto, no el gasto entero')
  assert.ok(s.delta.alberto! > 0 && s.delta.pilar! > 0)
  cerca(s.delta.individual, s.delta.alberto! + s.delta.pilar!)
  assert.equal(s.aplicadas[0].aplicado, 3000)
})

test('gasto del Dúplex (100 % Alberto): solo baja la base de Alberto', () => {
  const s = simularPartidas(entradaFixture(), ctxFixture(), [P({ tipo: 'gasto_piso', importe: 2000, propertyId: 'prop_duplex' })])
  cerca(base(s.antes, 'alberto') - base(s.despues, 'alberto'), 2000)
  cerca(base(s.antes, 'pilar') - base(s.despues, 'pilar'), 0)
})

test('plan de pensiones de Alberto 3.000€: tope legal 1.500€ (se aplica 1.500 y se avisa)', () => {
  const s = simularPartidas(entradaFixture(), ctxFixture(), [P({ tipo: 'plan_pensiones', importe: 3000, titular: 'alberto' })])
  cerca(base(s.antes, 'alberto') - base(s.despues, 'alberto'), 1500)
  assert.equal(s.aplicadas[0].aplicado, 1500)
  assert.ok(s.avisos.some(a => /límite legal/.test(a)))
})

test('plan de empleo de autónomos: 1.500 + hasta 4.250 extra (Alberto, 1.500 + 4.250 = 5.750 < 30 % de 20.000 = 6.000)', () => {
  assert.equal(LIMITE_PLAN_EMPLEO_AUTONOMO, 4250)
  const s = simularPartidas(entradaFixture(), ctxFixture(), [
    P({ tipo: 'plan_pensiones', importe: 1500, titular: 'alberto' }), { ...P({ tipo: 'plan_empleo_autonomo', importe: 9000, titular: 'alberto' }), id: 'y' },
  ])
  cerca(base(s.antes, 'alberto') - base(s.despues, 'alberto'), 5750)
})

test('plan de Pilar: el 30 % de SUS rendimientos (5.000€ ⇒ 1.500€) manda aunque pida plan de empleo', () => {
  const s = simularPartidas(entradaFixture(), ctxFixture(), [P({ tipo: 'plan_empleo_autonomo', importe: 4250, titular: 'pilar' })])
  cerca(base(s.antes, 'pilar') - base(s.despues, 'pilar'), 1500)
  assert.equal(s.aplicadas[0].aplicado, 1500)
  assert.ok(s.avisos.some(a => /Pilar/.test(a) && /límite legal/.test(a)))
})

test('gasto de la correduría 2.000€: solo Alberto (y la conjunta); Pilar no se mueve', () => {
  const s = simularPartidas(entradaFixture(), ctxFixture(), [P({ tipo: 'gasto_correduria', importe: 2000 })])
  cerca(base(s.antes, 'alberto') - base(s.despues, 'alberto'), 2000)
  cerca(base(s.antes, 'pilar') - base(s.despues, 'pilar'), 0)
  cerca(base(s.antes, 'conjunta') - base(s.despues, 'conjunta'), 2000)
  assert.ok(s.delta.conjunta! > 0)
})

test('donativo de Alberto 100€: deducción del 80 % ⇒ ahorra 80€ en su individual', () => {
  const s = simularPartidas(entradaFixture(), ctxFixture(), [P({ tipo: 'donativo', importe: 100, titular: 'alberto' })])
  cerca(s.delta.alberto, 80); cerca(s.delta.pilar, 0)
})

test('piso desconocido: no se aplica y se avisa (no inventa efecto)', () => {
  const s = simularPartidas(entradaFixture(), ctxFixture(), [P({ tipo: 'gasto_piso', importe: 500, propertyId: 'prop_fantasma' })])
  assert.equal(s.delta.conjunta, 0); assert.ok(s.avisos.some(a => /piso desconocido/.test(a)))
})

test('normalizarPartidas descarta lo inválido (importe ≤ 0, tipo raro, piso/titular ausente) sin arreglarlo', () => {
  const ok = { id: 'a', concepto: 'ok', importe: 10, tipo: 'gasto_correduria' }
  const out = normalizarPartidas([
    ok, { ...ok, id: 'b', importe: -5 }, { ...ok, id: 'c', tipo: 'otro' }, { ...ok, id: 'd', tipo: 'gasto_piso' },
    { ...ok, id: 'e', tipo: 'donativo' }, { ...ok, id: 'f', importe: '10' }, null, 'x',
  ])
  assert.deepEqual(out.map(p => p.id), ['a'])
  assert.deepEqual(normalizarPartidas('basura'), [])
})
