import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planBackfillTitular, repartoBackfill, sqlBackfillTitular } from './backfill-titular.ts'
import type { ContextoTitular } from './asignar-titular.ts'

const ALB = 'd3f55e13-9638-4f01-b6c2-e6c8035a4702'
const PYC = '48a33d76-8074-4669-92d0-af5add766bb8'
const CTX: ContextoTitular = {
  sociedades: [
    { id: ALB, nombre: 'Alberto Suárez Gutiérrez', cif: '28823484E', estado: 'activa' },
    { id: PYC, nombre: 'PUNTO Y COMA GESTION, S.L.', cif: 'B90446683', estado: 'paralizada' },
  ],
  negocios: [
    { id: 'neg-socorro', sociedadId: ALB, refExt: 'prop_house_sevillana', app: 'sivra' },
    { id: 'NUEVO', sociedadId: ALB, refExt: 'grupo_asegura', app: 'asegura' },
  ],
}
const G = (id: string, o: Partial<Record<string, string | number | null>>) => ({
  id, proveedor: null, nif_proveedor: null, propiedad: null, nif_cliente: null, cliente: null, total: 10, ...o,
}) as any

test('mismo resultado que el alta y SQL que no pisa lo ya evaluado', () => {
  const plan = planBackfillTitular([
    G('00000000-0000-4000-8000-000000000001', { proveedor: 'Vercel Inc.', total: 20 }),
    G('00000000-0000-4000-8000-000000000002', { proveedor: 'DIGI Spain Telecom', nif_cliente: 'B90446683', propiedad: 'prop_multi_apartamentos' }),
    G('00000000-0000-4000-8000-000000000003', { proveedor: 'Mercadona' }),
  ], CTX)
  const sql = sqlBackfillTitular(plan, CTX, ['grupo_asegura'])
  assert.match(sql, /^BEGIN;/)
  assert.match(sql, /RAISE EXCEPTION 'falta el negocio grupo_asegura/)
  // El negocio nuevo va por ref_ext, nunca por el id provisional.
  assert.doesNotMatch(sql, /'NUEVO'/)
  assert.match(sql, /ref_ext = 'grupo_asegura'/)
  const updates = sql.split('\n').filter((l) => l.startsWith('UPDATE'))
  assert.equal(updates.length, 3)
  for (const u of updates) assert.match(u, /AND sociedad_id IS NULL AND titular_fuente IS NULL AND titular_pendiente IS NULL;$/)
  assert.match(updates[2], /titular_pendiente = 'sin_datos'/)
  const rep = repartoBackfill(plan, CTX, { NUEVO: 'Grupo ASegura (correduría)' })
  assert.deepEqual(rep.find((r) => r.clave === 'Grupo ASegura (correduría)'), { clave: 'Grupo ASegura (correduría)', n: 1, eur: 20 })
  assert.ok(rep.find((r) => r.clave.endsWith('pisos (compartido)')))
})

test('id que no es uuid → error (va a SQL literal)', () => {
  const plan = planBackfillTitular([G("x'; DROP TABLE gastos; --", {})], CTX)
  assert.throws(() => sqlBackfillTitular(plan, CTX))
})
