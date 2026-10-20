import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sugerirVias, nombreCalleEscrito } from './sugerencias-via.ts'

const CASTILLO = [
  { tipo: 'CL', nombre: 'ISABEL PARRA' },
  { tipo: 'CL', nombre: 'PARRA LA (VENTAS CARRIZA)' },
  { tipo: 'CL', nombre: 'PARRAS' },
  { tipo: 'CL', nombre: 'PARRAS' },
  { tipo: 'CL', nombre: 'REAL' },
]

test('«parra» en Castillo de Locubín: las tres, la exacta normalizada primero', () => {
  const r = sugerirVias(CASTILLO, 'parra')
  assert.deepEqual(r.map((v) => v.nombre), ['PARRA LA (VENTAS CARRIZA)', 'PARRAS', 'ISABEL PARRA'])
})

test('acentos y mayúsculas no importan; el tipo escrito y el número se ignoran', () => {
  assert.equal(nombreCalleEscrito('Calle Parra 12, 2º'), 'PARRA')
  assert.equal(nombreCalleEscrito('C/ Paco Gandía'), 'PACO GANDIA')
  const r = sugerirVias([{ tipo: 'CL', nombre: 'PACO GANDIA' }], 'avda. Paco Gandía 3')
  assert.equal(r.length, 1)
})

test('artículo pospuesto: «madrid» encuentra «MADRID DE»', () => {
  const r = sugerirVias([{ tipo: 'AV', nombre: 'MADRID DE' }, { tipo: 'CL', nombre: 'MADRIGAL' }], 'madrid')
  assert.equal(r[0].nombre, 'MADRID DE')
})

test('menos de 2 letras, o solo artículos: nada', () => {
  assert.deepEqual(sugerirVias(CASTILLO, 'p'), [])
  assert.deepEqual(sugerirVias(CASTILLO, 'de la'), [])
  assert.deepEqual(sugerirVias(CASTILLO, ''), [])
})

test('varias palabras por prefijo y tope de 10', () => {
  assert.deepEqual(sugerirVias(CASTILLO, 'isabel pa').map((v) => v.nombre), ['ISABEL PARRA'])
  const muchas = Array.from({ length: 30 }, (_, i) => ({ tipo: 'CL', nombre: `SAN ${String.fromCharCode(65 + (i % 26))}${i}` }))
  assert.equal(sugerirVias(muchas, 'san').length, 10)
})

test('las que no casan no salen', () => {
  assert.deepEqual(sugerirVias(CASTILLO, 'zzz'), [])
})

import { viaSigueVigente, componerDireccionConVia, paramsDnplocConVia } from './sugerencias-via.ts'

const SOL = { tipo: 'CL', nombre: 'SOL' }
test('la calle elegida caduca si se reescribe: «CL SOL» no vale para «Calle Soledad 3»', () => {
  assert.equal(viaSigueVigente('CL SOL 3', SOL), true)
  assert.equal(viaSigueVigente('CL SOL', SOL), true)
  assert.equal(viaSigueVigente('CL SOL, 3', SOL), true)
  assert.equal(viaSigueVigente('Calle Soledad 3', SOL), false)
  assert.equal(viaSigueVigente('CL SOLEDAD 3', SOL), false)
  assert.equal(viaSigueVigente('CL SOL Y SOMBRA 3', SOL), false)
  assert.equal(viaSigueVigente('CL SOL 3', null), false)
})

const MAYO = { tipo: 'CL', nombre: '1 DE MAYO' }
test('vía oficial con dígitos: el número de portal no se confunde', () => {
  assert.deepEqual(nombreCalleEscrito('1 de Mayo 3'), '1 DE MAYO')
  assert.equal(componerDireccionConVia('1 de mayo 3, 2º B', MAYO), 'CL 1 DE MAYO 3, 2º B')
  assert.equal(componerDireccionConVia('1 de mayo', MAYO), 'CL 1 DE MAYO ')
  const p = paramsDnplocConVia('CL 1 DE MAYO 3, 2º B', MAYO)
  assert.ok(p)
  assert.equal(p.calle, '1 DE MAYO'); assert.equal(p.sigla, 'CL'); assert.equal(p.numero, '3')
  assert.equal(paramsDnplocConVia('CL 1 DE MAYO ', MAYO), null)
})

test('pedanía entre paréntesis: el nombre oficial viaja entero y el número sale', () => {
  const v = { tipo: 'CL', nombre: 'PARRA LA (VENTAS CARRIZA)' }
  const p = paramsDnplocConVia(componerDireccionConVia('parra 12', v), v)
  assert.ok(p); assert.equal(p.calle, 'PARRA LA (VENTAS CARRIZA)'); assert.equal(p.numero, '12')
})
