// Cepo (25/10/2026): el acceso a Patrimonio en el portal exige el módulo `alquileres` activo de ESA identidad
// (portal_modulo), además de la póliza viva. Antes `accesosPatrimonio` no lo miraba: activar/retirar no hacía nada.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ACC = readFileSync(new URL('../apps/asegura-portal/lib/patrimonio/accesos.ts', import.meta.url), 'utf8')
const SQL = readFileSync(new URL('../apps/asegura-portal/prisma/sql/2026-10-22_portal_modulos.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '')
const i = ACC.indexOf('export async function accesosPatrimonio(')
const f = ACC.slice(i, ACC.indexOf('\nexport ', i + 1))

test('🚨 accesosPatrimonio aplica accesoPatrimonioPorModulo y lee portal_modulo FILTRADO por la identidad', () => {
  assert.match(f, /accesoPatrimonioPorModulo\(/)
  assert.match(f, /portalModulo\s*\.findMany\(\{ where: \{ identidadId, modulo: 'alquileres' \}/)
  assert.match(f, /return abre \? porCartera : new Map\(\)/)
})

test('🚨 los inmuebles que mantienen el acceso se buscan solo en los titulares ya autorizados', () => {
  assert.match(f, /titular: \{ clienteId: \{ in: \[\.\.\.porCartera\.keys\(\)\] \} \}/)
})

test('el rol del portal tiene SELECT sobre portal_modulo (identidad_id, modulo, estado)', () => {
  const g = SQL.match(/GRANT SELECT \(([^)]*)\)\s+ON seguros\.portal_modulo TO prisma_asegura_portal/)
  assert.ok(g)
  const cols = g[1].split(',').map((c) => c.trim())
  for (const c of ['identidad_id', 'modulo', 'estado']) assert.ok(cols.includes(c), c)
})
