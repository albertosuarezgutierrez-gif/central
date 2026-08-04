import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankearMagicFormula, type EntradaMagic } from '../src/magicFormula.ts'

test('rankearMagicFormula pone primero al que es nº1 en las dos patas', () => {
  const u: EntradaMagic[] = [
    { simbolo: 'BUENA',  earningsYield: 0.15, roic: 0.30 },  // 1º en yield y en roic
    { simbolo: 'MEDIA',  earningsYield: 0.10, roic: 0.20 },
    { simbolo: 'CARA',   earningsYield: 0.04, roic: 0.08 },
  ]
  const r = rankearMagicFormula(u)
  assert.equal(r[0].simbolo, 'BUENA')
  assert.equal(r[0].rankEarningsYield, 1)
  assert.equal(r[0].rankRoic, 1)
  assert.equal(r[0].rankTotal, 2)
  assert.equal(r[2].simbolo, 'CARA')
})

test('rankearMagicFormula equilibra: barata-pero-mala vs cara-pero-buena empatan por rango combinado', () => {
  const u: EntradaMagic[] = [
    { simbolo: 'BARATA_MALA', earningsYield: 0.20, roic: 0.05 },  // rank EY 1, roic 3 → 4
    { simbolo: 'EQUILIBRADA', earningsYield: 0.12, roic: 0.15 },  // rank EY 2, roic 2 → 4
    { simbolo: 'CARA_BUENA',  earningsYield: 0.06, roic: 0.25 },  // rank EY 3, roic 1 → 4
  ]
  const r = rankearMagicFormula(u)
  // Los tres empatan a 4; el orden estable no rompe la propiedad de que todos tienen el mismo total.
  assert.deepEqual(r.map(x => x.rankTotal), [4, 4, 4])
})
