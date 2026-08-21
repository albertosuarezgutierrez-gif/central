import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contrastar, avisoContraste, TOLERANCIA_REL } from '../src/contraste.ts'

// El caso fundacional (PR #1189): nuestro parser daba a ORCL +3,49% de FCF yield; la segunda fuente
// da −5,79% (= −23.690 M$ sobre 409.200 M$ de capitalización, contra los −23.700 M$ reales).
const ORCL_NUESTRO = { fcfYield: 0.0349, roic: 0.111, margenNeto: 0.2537 }
const ORCL_SEGUNDA = { fcfYield: -0.0579, roic: 0.1113, margenNeto: 0.2537 }

test('el caso ORCL: signo opuesto en el flujo de caja, y las cifras dejan de ser fiables', () => {
  const c = contrastar(ORCL_NUESTRO, ORCL_SEGUNDA)
  assert.deepEqual(c.signoOpuesto, ['fcfYield'])
  assert.equal(c.cifrasFiables, false)
  assert.match(avisoContraste(c)!, /SIGNO CONTRARIO/)
})

test('ORCL: el resto de métricas SÍ coinciden — el contraste señala el punto exacto, no la ficha entera', () => {
  const c = contrastar(ORCL_NUESTRO, ORCL_SEGUNDA)
  const porMetrica = Object.fromEntries(c.metricas.map(m => [m.metrica, m.veredicto]))
  assert.equal(porMetrica.roic, 'coinciden')
  assert.equal(porMetrica.margenNeto, 'coinciden')
})

test('el contraste NO elige ganador: conserva los dos números tal cual', () => {
  const m = contrastar(ORCL_NUESTRO, ORCL_SEGUNDA).metricas.find(x => x.metrica === 'fcfYield')!
  assert.equal(m.nuestro, 0.0349)
  assert.equal(m.segunda, -0.0579)
})

test('dos fuentes que difieren poco están de acuerdo (no se genera ruido)', () => {
  const c = contrastar({ roic: 0.20 }, { roic: 0.22 })
  assert.equal(c.metricas.find(m => m.metrica === 'roic')!.veredicto, 'coinciden')
  assert.equal(avisoContraste(c), null)
})

test('la brecha se mide contra el MAYOR de los dos en valor absoluto', () => {
  // 0,20 vs 0,16 → 0,04/0,20 = 20% → dentro. 0,20 vs 0,10 → 50% → fuera.
  // No se comprueba el filo exacto del 25%: en coma flotante 0,1−0,075 da 0,0250000000000000005
  // y el borde no es estable — un test que dependa de eso mide el IEEE-754, no la regla.
  assert.equal(contrastar({ roic: 0.2 }, { roic: 0.16 }).metricas[1].veredicto, 'coinciden')
  assert.equal(contrastar({ roic: 0.2 }, { roic: 0.1 }).metricas[1].veredicto, 'discrepan')
  assert.equal(contrastar({ roic: 0.2 }, { roic: 0.1 }).metricas[1].brechaRel, 0.5)
  assert.equal(TOLERANCIA_REL, 0.25)
})

test('discrepancia grande con el MISMO signo avisa en naranja, no en rojo', () => {
  const c = contrastar({ margenNeto: 0.30 }, { margenNeto: 0.10 })
  assert.deepEqual(c.discrepan, ['margenNeto'])
  assert.deepEqual(c.signoOpuesto, [])
  assert.equal(c.cifrasFiables, true, 'mismo signo: la idea sigue en pie, pero el número es orientativo')
  assert.match(avisoContraste(c)!, /no cuadran/)
})

test('si falta el dato en una fuente NO se afirma nada: sin-dato, nunca «coinciden»', () => {
  const c = contrastar({ fcfYield: 0.05 }, {})
  assert.equal(c.metricas.find(m => m.metrica === 'fcfYield')!.veredicto, 'sin-dato')
  assert.equal(c.metricas.find(m => m.metrica === 'fcfYield')!.brechaRel, null)
  assert.equal(c.sinContraste, true)
  assert.match(avisoContraste(c)!, /SIN contrastar/)
})

test('sin contraste NO es lo mismo que cifras poco fiables', () => {
  const c = contrastar({ fcfYield: 0.05 }, {})
  assert.equal(c.sinContraste, true)
  assert.equal(c.cifrasFiables, true, 'no hay nada que contradiga: falta la comprobación, no falla')
})

test('un cero no cuenta como cambio de signo', () => {
  assert.equal(contrastar({ fcfYield: 0 }, { fcfYield: 0.001 }).signoOpuesto.length, 0)
  assert.equal(contrastar({ fcfYield: 0 }, { fcfYield: -0.001 }).signoOpuesto.length, 0)
  assert.equal(contrastar({ fcfYield: 0 }, { fcfYield: 0 }).metricas[0].veredicto, 'coinciden')
})

test('un NaN se trata como dato ausente, no como número', () => {
  const c = contrastar({ roic: NaN }, { roic: 0.2 })
  assert.equal(c.metricas.find(m => m.metrica === 'roic')!.veredicto, 'sin-dato')
})

test('dos fichas que coinciden en todo no generan aviso', () => {
  assert.equal(avisoContraste(contrastar({ roic: 0.2, per: 20 }, { roic: 0.21, per: 19 })), null)
})
