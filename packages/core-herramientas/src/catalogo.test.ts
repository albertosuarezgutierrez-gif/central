import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { IDS_HERRAMIENTA, CATALOGO, normalizarHerramientas, dependenciasQueFaltan, bloquesAnexo } from './catalogo.ts'

test('el CHECK de BD lista exactamente el catálogo', () => {
  const sql = readFileSync(new URL('../../../apps/empresa/prisma/sql/0001_herramientas.sql', import.meta.url), 'utf8')
  const m = /herramienta\s+text NOT NULL CHECK \(herramienta IN \(([^)]*)\)\)/.exec(sql)
  assert.ok(m, 'no encuentro el CHECK de cuenta_herramienta.herramienta')
  assert.deepEqual(m![1].split(',').map((s) => s.trim().replace(/'/g, '')), [...IDS_HERRAMIENTA])
})

test('normalizar: solo ids del catálogo, sin repetidos, en orden del catálogo', () => {
  assert.deepEqual(normalizarHerramientas(['rrhh', 'contabilidad', 'rrhh']), ['contabilidad', 'rrhh'])
  assert.equal(normalizarHerramientas(['rrhh', 'seguros']), null)
  assert.equal(normalizarHerramientas([]), null)
  assert.equal(normalizarHerramientas('rrhh'), null)
})

test('nóminas exige rrhh y contabilidad en el mismo anexo', () => {
  assert.equal(dependenciasQueFaltan(['nominas']).length, 2)
  assert.deepEqual(dependenciasQueFaltan(['contabilidad', 'rrhh', 'nominas']), [])
})

test('anexo: rrhh + nóminas comparten el bloque I.B (una sola vez), en orden de bloque', () => {
  assert.deepEqual(bloquesAnexo(['rrhh', 'nominas', 'contabilidad']).map((b) => b.id), ['I.A', 'I.B'])
  assert.deepEqual(bloquesAnexo(['portal_proveedores', 'taller']).map((b) => b.id), ['I.C', 'I.D'])
  for (const h of IDS_HERRAMIENTA) assert.ok(CATALOGO[h].anexo.filas.length >= 4, `${h} sin anexo completo`)
})
