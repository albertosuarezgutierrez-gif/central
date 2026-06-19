// Tests del catálogo PURO de sectores → CPV. Runner: `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { SECTORES, cpvDeSectores } from '../src/sectores.ts'

test('SECTORES: catálogo no vacío, ids únicos y cpv no vacíos', () => {
  assert.ok(SECTORES.length >= 20)
  const ids = SECTORES.map(s => s.id)
  assert.equal(new Set(ids).size, ids.length, 'ids duplicados')
  for (const s of SECTORES) {
    assert.ok(s.nombre.length > 0, `sector ${s.id} sin nombre`)
    assert.ok(s.cpv.length > 0, `sector ${s.id} sin cpv`)
  }
})

test('cpvDeSectores: une prefijos sin duplicados y respeta el orden', () => {
  // 'limpieza' → ['90'], 'jardineria' → ['77','03']
  assert.deepEqual(cpvDeSectores(['limpieza', 'jardineria']), ['90', '77', '03'])
})

test('fontanería mapea al prefijo CPV de trabajos de fontanería (4533)', () => {
  assert.deepEqual(cpvDeSectores(['fontaneria']), ['4533'])
})

test('ningún prefijo CPV lleva punto (el filtro casa con LIKE sobre códigos sin punto)', () => {
  for (const s of SECTORES) {
    for (const p of s.cpv) {
      assert.ok(/^[0-9]+$/.test(p), `prefijo no numérico en ${s.id}: "${p}"`)
    }
  }
})

test('cpvDeSectores: deduplica prefijos compartidos entre sectores', () => {
  // 'informatica' → ['72','48'], 'consultoria' → ['79']; sin solapes aquí,
  // pero un id repetido no debe duplicar.
  assert.deepEqual(cpvDeSectores(['informatica', 'informatica']), ['72', '48'])
})

test('cpvDeSectores: ignora ids desconocidos y lista vacía', () => {
  assert.deepEqual(cpvDeSectores(['no_existe']), [])
  assert.deepEqual(cpvDeSectores([]), [])
  assert.deepEqual(cpvDeSectores(['limpieza', 'no_existe']), ['90'])
})
