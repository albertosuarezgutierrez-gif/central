import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarReferenciaCatastral, referenciaCatastralValida, referenciasCatastralesEn } from './referencia-catastral.ts'

// Referencias REALES que ya están en fixtures del repo (subastas BOE, Catastro, portal): todas tienen que cuadrar.
const REALES = [
  '4707007TG3440N0003TR', '4923607VP1042S0001GG', '5029006TG3452G0019BG', '5519518QB5451N0001IW',
  '5732032TG3453B0001PK', '7325012TG3472N0001FW', '8033101TG3483S0026RR', '8342605QA4584A0006YM',
  '9872023VH5797S0001WX', '4632121TG3443B0015JW',
]

test('🪤 las referencias reales del repo pasan el control', () => {
  for (const rc of REALES) assert.equal(referenciaCatastralValida(rc), true, rc)
})

test('🪤 una errata en una cifra o en una letra de control no pasa', () => {
  assert.equal(referenciaCatastralValida('4632121TG3443B0015JX'), false)
  assert.equal(referenciaCatastralValida('4632121TG3443B0016JW'), false)
  assert.equal(referenciaCatastralValida('4632122TG3443B0015JW'), false)
  assert.equal(referenciaCatastralValida('4632121TG3443B'), false, 'la de parcela (14) no es la del bien')
  assert.equal(referenciaCatastralValida(''), false)
  assert.equal(referenciaCatastralValida(null), false)
})

test('normaliza espacios y guiones', () => {
  assert.equal(normalizarReferenciaCatastral(' 4632121 tg3443b-0015 jw '), '4632121TG3443B0015JW')
  assert.equal(referenciaCatastralValida('4632121 TG3443B 0015 JW'), true)
})

test('encuentra en un correo solo las válidas, sin repetir', () => {
  const texto = `Os paso la referencia catastral de la vivienda: 4632121TG3443B0015JW y la del garaje 4632121 TG3443B 0015 JW.
  Otra mal copiada 4632121TG3443B0015JX. Teléfono 600000000.`
  assert.deepEqual(referenciasCatastralesEn(texto), ['4632121TG3443B0015JW'])
  assert.deepEqual(referenciasCatastralesEn('sin nada'), [])
})
