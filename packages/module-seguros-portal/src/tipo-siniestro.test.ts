import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { ETIQUETA_TIPO_SINIESTRO, TIPOS_SINIESTRO, esTipoSiniestro, opcionesTipoSiniestro } from './tipo-siniestro.ts'

test('auto y hogar tienen sus opciones; un ramo sin catálogo no pregunta', () => {
  assert.ok(opcionesTipoSiniestro('AUTO').includes('lunas'))
  assert.ok(opcionesTipoSiniestro('hogar').includes('agua'))
  assert.equal(opcionesTipoSiniestro('vida').length, 0)
  assert.equal(opcionesTipoSiniestro(null).length, 0)
})

test('valores fuera de la lista no son tipo', () => {
  assert.equal(esTipoSiniestro('agua'), true)
  assert.equal(esTipoSiniestro('AGUA'), false)
  assert.equal(esTipoSiniestro(null), false)
})

test('toda opción tiene etiqueta', () => {
  assert.deepEqual(Object.keys(ETIQUETA_TIPO_SINIESTRO).sort(), [...TIPOS_SINIESTRO].sort())
})

test('🚨 el CHECK de la BD es la MISMA lista', () => {
  const sql = readFileSync(
    new URL('../../../apps/asegura-portal/prisma/sql/2026-09-26_portal_parte_tipo_siniestro.sql', import.meta.url),
    'utf8',
  )
  const dentro = /tipo_siniestro IN \(([^)]*)\)/.exec(sql)?.[1] ?? ''
  const enBd = [...dentro.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(enBd, [...TIPOS_SINIESTRO].sort())
})
