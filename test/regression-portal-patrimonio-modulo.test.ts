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

// 27/10/2026: el puro ya no exige «titulares > 0» (acceso = autorización de la correduría, sin póliza viva). La guarda
// «sin ficha titular, nada» vive SOLO aquí: si se quita, un `activo` sin ninguna ficha devolvería un mapa vacío igual, pero
// cualquier refactor que mire `abre` sin el mapa abriría en el aire. Tiene que ir ANTES de decidir por el módulo.
test('🚨 sin ninguna ficha titular, accesosPatrimonio corta ANTES de mirar el módulo', () => {
  const guarda = f.indexOf('if (porCartera.size === 0) return porCartera')
  const modulo = f.indexOf('accesoPatrimonioPorModulo(')
  assert.ok(guarda > 0, 'falta la guarda «sin titular, nada»')
  assert.ok(guarda < modulo, 'la guarda tiene que ir antes de decidir por el módulo')
  // Y la regla de fase 1 (póliza viva) no vuelve por la puerta de atrás.
  assert.doesNotMatch(f, /titulares:\s*porCartera\.size/)
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
