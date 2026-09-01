import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarUrlPooler } from './asegura-url.ts'

const POOLER = 'postgresql://central_asegura.ref:pass@aws-1-eu-central-1.pooler.supabase.com:6543/postgres'

test('al pooler 6543 sin parámetros se le añaden pgbouncer y connection_limit', () => {
  const r = normalizarUrlPooler(POOLER)
  assert.match(r, /pgbouncer=true/)
  assert.match(r, /connection_limit=1/)
})

test('no pisa parámetros ya presentes', () => {
  const r = normalizarUrlPooler(`${POOLER}?pgbouncer=true&connection_limit=5`)
  assert.match(r, /connection_limit=5/)
  assert.doesNotMatch(r, /connection_limit=1\b/)
})

test('una URL que no va al 6543 se devuelve intacta (session pooler, directa)', () => {
  const directa = 'postgresql://u:p@db.host.supabase.co:5432/postgres'
  assert.equal(normalizarUrlPooler(directa), directa)
})

test('una URL imposible de parsear se devuelve tal cual (que falle Prisma con su error real)', () => {
  assert.equal(normalizarUrlPooler('esto-no-es-una-url'), 'esto-no-es-una-url')
})
