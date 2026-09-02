import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarUrlPooler, urlFuenteCartera } from './asegura-url.ts'

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

// ── urlFuenteCartera: de dónde se lee la cartera ──────────────────────────────

const CENTRAL =
  'postgresql://prisma_seguros.wswbehlcuxqxyinousql:pass@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'

test('por defecto la cartera se lee de CASA: DATABASE_URL + schema=seguros (+ pgbouncer por ser 6543)', () => {
  const r = urlFuenteCartera({ DATABASE_URL: CENTRAL, ASEGURA_DATABASE_URL: POOLER })
  assert.equal(r.fuente, 'central')
  assert.match(r.url!, /aws-0-eu-west-1/)
  assert.match(r.url!, /schema=seguros/)
  assert.match(r.url!, /pgbouncer=true/)
})

test('no duplica schema si DATABASE_URL ya lo trae', () => {
  const r = urlFuenteCartera({ DATABASE_URL: `${CENTRAL}?schema=seguros` })
  assert.equal((r.url!.match(/schema=/g) ?? []).length, 1)
})

// 🚨 El caso que dejó el libro de comisiones en «no se ha podido leer la cartera»
// (02/09/2026): `DATABASE_URL` es la misma cadena que la auth, y en Vercel llega
// con `schema=public`. Respetarlo mandaba el cliente de la CARTERA a `public`,
// donde no hay `corredurias` —falla todo— y donde `clientes` es OTRA tabla.
test('un schema distinto en DATABASE_URL NO manda: la cartera se lee de seguros', () => {
  const r = urlFuenteCartera({ DATABASE_URL: `${CENTRAL}?schema=public` })
  assert.match(r.url!, /schema=seguros/)
  assert.doesNotMatch(r.url!, /schema=public/)
  assert.equal((r.url!.match(/schema=/g) ?? []).length, 1)
})

test('forzar el schema no se lleva por delante el resto de parámetros', () => {
  const r = urlFuenteCartera({ DATABASE_URL: `${CENTRAL}?schema=public&connection_limit=5` })
  assert.match(r.url!, /schema=seguros/)
  assert.match(r.url!, /connection_limit=5/)
  assert.match(r.url!, /pgbouncer=true/)
})

test('ASEGURA_FUENTE=origen vuelve al Supabase de Manuel, sin schema (allí la cartera vive en public)', () => {
  const r = urlFuenteCartera({ ASEGURA_FUENTE: 'origen', DATABASE_URL: CENTRAL, ASEGURA_DATABASE_URL: POOLER })
  assert.equal(r.fuente, 'origen')
  assert.match(r.url!, /aws-1-eu-central-1/)
  assert.doesNotMatch(r.url!, /schema=/)
})

test('la fuente elegida sin conexión es «pendiente» (null), NUNCA cae a la otra fuente', () => {
  assert.equal(urlFuenteCartera({ ASEGURA_FUENTE: 'origen', DATABASE_URL: CENTRAL }).url, null)
  assert.equal(urlFuenteCartera({ ASEGURA_DATABASE_URL: POOLER }).url, null)
})

test('cualquier valor que no sea «origen» significa central (no hay tercer modo)', () => {
  assert.equal(urlFuenteCartera({ ASEGURA_FUENTE: 'manuel', DATABASE_URL: CENTRAL }).fuente, 'central')
})
