import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

/**
 * Cepo del singleton de Prisma (28/09/2026). Se lee el FUENTE: el job de tests corre sin
 * `prisma generate`, así que no se puede construir el cliente. Detrás de un `Proxy` que resuelve el
 * cliente en cada acceso, un singleton que no se guarda en producción es un cliente —y un pool—
 * NUEVO por consulta: agotó el pooler compartido (EMAXCONN) en la primera pasada del backfill.
 */
test('el cliente de Prisma se reutiliza también en producción', () => {
  const src = readFileSync(join(import.meta.dirname, 'db.ts'), 'utf8')
  const cuerpo = /function cliente\(\)[^{]*\{([\s\S]*?)\n\}/.exec(src)?.[1] ?? ''
  assert.ok(cuerpo, 'no se encuentra function cliente() en db.ts')
  assert.ok(!/NODE_ENV/.test(cuerpo), 'guardar el cliente no puede depender de NODE_ENV')
  assert.match(cuerpo, /globalForPrisma\.prisma\s*\?\?=\s*new PrismaClient/)
})
