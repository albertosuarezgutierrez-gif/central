import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { esNumeroPolizaComodin, normalizarNumeroPoliza } from '@central/module-seguros'

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

// Paridad de la normalización: el SQL (`regexp_replace` sobre `numero_poliza`) y `normalizarNumeroPoliza`.
// Los patrones se LEEN del fuente (si alguien toca el SQL, este test lo ve); Postgres ARE y JS comparten
// la sintaxis usada (`[[:space:]]` ≡ `\s`, lookahead). Verificado además a mano contra Postgres 16 (03/10/2026).
const reSeparadores = /'(\[\[:space:\][^']*)'/.exec(fuente)?.[1]
const reCeros = /'(\^0\+[^']*)'/.exec(fuente)?.[1]

function normalizarComoElSql(n: string): string {
  assert.ok(reSeparadores && reCeros, 'no se encuentran los patrones del SQL')
  const sep = new RegExp(reSeparadores.replace('[[:space:]', '[\\s'), 'g')
  return n.toUpperCase().replace(sep, '').replace(new RegExp(reCeros), '')
}

test('normalización SQL = normalizarNumeroPoliza: ceros delante de letras, solo ceros y separadores', () => {
  for (const n of ['0A12', '000123', 'A-001', '000', ' 0 0-1 ', 'a/12.3', '0-0A', '00A00', 'AB-0012']) {
    assert.equal(normalizarComoElSql(n), normalizarNumeroPoliza(n), JSON.stringify(n))
  }
  // Un cero delante de las letras SE QUEDA (no es un cero «de relleno»): igual en los dos lados.
  assert.equal(normalizarNumeroPoliza('0A12'), '0A12')
  assert.equal(normalizarNumeroPoliza('000123'), '123')
  assert.equal(normalizarNumeroPoliza('A-001'), 'A001')
})
