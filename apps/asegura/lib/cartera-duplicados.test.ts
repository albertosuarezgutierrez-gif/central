import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { esNumeroPolizaComodin } from '@central/module-seguros'

// El SQL del vigía lleva su propia lista de comodines (no puede llamar al helper puro): este test la ata.
const fuente = readFileSync(new URL('./cartera-duplicados.ts', import.meta.url), 'utf8')
const lista = /COMODINES_SQL = \[([^\]]*)\]/.exec(fuente)?.[1] ?? ''
const comodines = [...lista.matchAll(/'([^']*)'/g)].map((m) => m[1])

test('la lista de comodines del SQL coincide con esNumeroPolizaComodin', () => {
  assert.ok(comodines.length >= 8)
  for (const c of comodines) assert.equal(esNumeroPolizaComodin(c), true, `«${c}»`)
  for (const c of ['PENDIENTE', 'NOSE', 'NOSABE', '0', '1', 'SN', 'SINNUMERO', 'NOLOSE', '12345', '5', '']) assert.ok(comodines.includes(c), c)
})

test('el vigía solo lee: sin insert/update/delete y con el tope de 50', () => {
  assert.doesNotMatch(fuente, /\b(insert|update|delete)\b\s/i)
  assert.match(fuente, /TOPE_MUESTRA_DUPLICADOS = 50/)
  assert.match(fuente, /merged_into_poliza_id is null/)
})
