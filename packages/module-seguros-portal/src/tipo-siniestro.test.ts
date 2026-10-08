import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { TIPOS_SEGURO } from '@central/module-seguros'

import {
  ETIQUETA_TIPO_SINIESTRO,
  TIPOS_POR_RAMO,
  TIPOS_SINIESTRO,
  codigosEiacDesconocidos,
  codigosEiacSugeridos,
  esTipoSiniestro,
  opcionesTipoSiniestro,
  ramoDelParte,
} from './tipo-siniestro.ts'

test('todos los ramos de póliza tienen lista, y todas acaban en «otro»', () => {
  for (const r of TIPOS_SEGURO) {
    const ops = opcionesTipoSiniestro(r)
    assert.ok(ops.length >= 2, `${r} sin lista`)
    assert.equal(ops.at(-1), 'otro', `${r}: «otro» al final`)
    assert.equal(new Set(ops).size, ops.length, `${r}: tipos repetidos`)
  }
  assert.ok(opcionesTipoSiniestro('AUTO').includes('lunas'))
  assert.ok(opcionesTipoSiniestro('comunidad').includes('agua'), 'la cartera dice «comunidad» en singular')
  assert.ok(opcionesTipoSiniestro('vida').includes('fallecimiento'))
})

test('ramo desconocido o sin póliza: no se pregunta', () => {
  assert.equal(opcionesTipoSiniestro(null).length, 0)
  assert.equal(opcionesTipoSiniestro('nave_espacial').length, 0)
  assert.equal(ramoDelParte('  Hogar '), 'hogar')
  assert.equal(ramoDelParte('__proto__'), null)
})

test('valores fuera de la lista no son tipo', () => {
  assert.equal(esTipoSiniestro('agua'), true)
  assert.equal(esTipoSiniestro('AGUA'), false)
  assert.equal(esTipoSiniestro(null), false)
})

test('toda opción tiene etiqueta y todo tipo se usa en algún ramo', () => {
  assert.deepEqual(Object.keys(ETIQUETA_TIPO_SINIESTRO).sort(), [...TIPOS_SINIESTRO].sort())
  const usados = new Set(Object.values(TIPOS_POR_RAMO).flatMap((l) => l.map((x) => x.tipo)))
  assert.deepEqual([...usados].sort(), [...TIPOS_SINIESTRO].sort())
})

test('cada tipo lleva código EIAC sugerido y todos existen en la tabla oficial', () => {
  for (const [ramo, lista] of Object.entries(TIPOS_POR_RAMO)) {
    for (const x of lista) assert.ok(x.codigosEiac.length > 0, `${ramo}/${x.tipo} sin código EIAC`)
  }
  assert.deepEqual(codigosEiacDesconocidos(), [])
  assert.deepEqual(codigosEiacSugeridos('auto', 'robo'), ['1314', '2003'])
  assert.equal(codigosEiacSugeridos('hogar', 'robo')[0], '2010', 'el mismo tipo, otro código según el ramo')
  assert.deepEqual(codigosEiacSugeridos('vida', 'lunas'), [])
})

test('las diez claves del 26/09/2026 siguen en la lista (hay filas guardadas con ellas)', () => {
  for (const k of ['colision', 'lunas', 'robo', 'averia', 'agua', 'incendio', 'cristales', 'electrico', 'danos_terceros', 'otro'])
    assert.ok(esTipoSiniestro(k), k)
})

test('🚨 el CHECK de la BD es la MISMA lista', () => {
  const sql = readFileSync(
    new URL('../../../apps/asegura-portal/prisma/sql/2026-10-03_portal_parte_datos_ramo.sql', import.meta.url),
    'utf8',
  )
  const dentro = /tipo_siniestro IN \(([^)]*)\)/.exec(sql)?.[1] ?? ''
  const enBd = [...dentro.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(enBd, [...TIPOS_SINIESTRO].sort())
})
