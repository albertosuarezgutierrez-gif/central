// apps/asegura/lib/cartera-renovaciones-contacto.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FUENTE = readFileSync(new URL('./cartera-renovaciones-contacto.ts', import.meta.url), 'utf8')

test('registrar un contacto exige que la ficha sea de esta correduría antes de escribir', () => {
  assert.match(FUENTE, /correduriaId,\s*mergedIntoClienteId: null/)
})

test('el registro deja rastro en historial_interno, no solo en renovacion_contactos', () => {
  assert.match(FUENTE, /insert into renovacion_contactos/)
  assert.match(FUENTE, /historial_interno/)
})

test('el último contacto se agrupa por póliza (max(created_at)), no por cliente', () => {
  // Un cliente con varias pólizas que vencen no puede compartir cooldown:
  // contactar por el auto no debería silenciar el aviso del hogar.
  assert.match(FUENTE, /group by poliza_id/)
})

test('sin pólizas que preguntar, no se dispara ninguna consulta', () => {
  assert.match(FUENTE, /polizaIds\.length === 0/)
})
