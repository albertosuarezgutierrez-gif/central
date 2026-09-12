import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HASH_CUERPO_VACIO,
  construirCanonical,
  firmarCanonical,
  firmarPeticion,
  hashCuerpo,
  queryCanonica,
  selloTiempo,
} from './smoobu-firma.ts'

// Valores EXACTOS del ejemplo publicado por Smoobu (docs.smoobu.com). Las firmas
// esperadas se obtuvieron ejecutando el propio bash del ejemplo con openssl.
const API_KEY = 'usr_live_abc123'
const API_SECRET = 'your_api_secret'
const TIMESTAMP = '2026-04-01T12:00:00Z'
const NONCE = '550e8400-e29b-41d4-a716-446655440000'
const BODY = '{"apartmentId":123,"from":"2026-04-01","to":"2026-04-10"}'
const BODY_HASH = 'c330d36eded5ba48a781e2f2cd95420b89d92e581d779aa86d9ef60a5a6ed53a'
const FIRMA_POST = '64zVmuaX7u9BPPU7J8ruvr5rzoaCcpZtYgFoKGJOdig='
const FIRMA_GET = 'M3qIFS43PJxKremTrerI8vYC3xhX6ns7MTxYb3X+bDQ='

test('el SHA-256 del cuerpo va en HEX', () => {
  assert.equal(hashCuerpo(BODY), BODY_HASH)
})

test('sin cuerpo, el hash es el de la cadena vacía documentado por Smoobu', () => {
  assert.equal(HASH_CUERPO_VACIO, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(hashCuerpo(undefined), HASH_CUERPO_VACIO)
  assert.equal(hashCuerpo(''), HASH_CUERPO_VACIO)
  assert.equal(hashCuerpo(null), HASH_CUERPO_VACIO)
})

test('POST: el canonical casa byte a byte con el ejemplo de Smoobu', () => {
  const canonical = construirCanonical({
    method: 'POST',
    path: '/api/reservations',
    query: '',
    timestamp: TIMESTAMP,
    nonce: NONCE,
    bodyHash: BODY_HASH,
    apiKey: API_KEY,
  })
  // La línea de query SIEMPRE está: vacía deja dos \n seguidos.
  assert.equal(
    canonical,
    `POST\n/api/reservations\n\n${TIMESTAMP}\n${NONCE}\n${BODY_HASH}\n${API_KEY}`,
  )
  assert.equal(canonical.split('\n').length, 7)
  assert.equal(firmarCanonical(canonical, API_SECRET), FIRMA_POST)
})

test('firmarPeticion reproduce el POST del ejemplo con los 4 headers', () => {
  const { headers, canonical } = firmarPeticion({
    method: 'POST',
    url: 'https://login.smoobu.com/api/reservations',
    body: BODY,
    apiKey: API_KEY,
    apiSecret: API_SECRET,
    timestamp: TIMESTAMP,
    nonce: NONCE,
  })
  assert.equal(canonical, `POST\n/api/reservations\n\n${TIMESTAMP}\n${NONCE}\n${BODY_HASH}\n${API_KEY}`)
  assert.deepEqual(headers, {
    'X-API-Key': API_KEY,
    'X-Timestamp': TIMESTAMP,
    'X-Nonce': NONCE,
    'X-Signature': FIRMA_POST,
  })
})

test('GET: la query se ordena ALFABÉTICAMENTE, no como llegó en la URL', () => {
  const { headers, canonical } = firmarPeticion({
    method: 'GET',
    url: 'https://login.smoobu.com/api/reservations?to=2026-04-10&from=2026-04-01',
    apiKey: API_KEY,
    apiSecret: API_SECRET,
    timestamp: TIMESTAMP,
    nonce: NONCE,
  })
  assert.equal(
    canonical,
    'GET\n/api/reservations\nfrom=2026-04-01&to=2026-04-10\n' +
      `${TIMESTAMP}\n${NONCE}\n${HASH_CUERPO_VACIO}\n${API_KEY}`,
  )
  assert.equal(headers['X-Signature'], FIRMA_GET)
})

test('queryCanonica ordena por clave y deja los valores tal cual', () => {
  assert.equal(queryCanonica('to=2026-04-10&from=2026-04-01'), 'from=2026-04-01&to=2026-04-10')
  assert.equal(queryCanonica(''), '')
  // Las rutas de rates llaman con `apartments[]`: el corchete no se re-codifica.
  assert.equal(queryCanonica('apartments[]=12&start_date=2026-01-01'), 'apartments[]=12&start_date=2026-01-01')
})

test('una ruta relativa se firma igual que su URL absoluta', () => {
  const rel = firmarPeticion({
    method: 'GET', url: '/api/threads?page=1&pageSize=50',
    apiKey: API_KEY, apiSecret: API_SECRET, timestamp: TIMESTAMP, nonce: NONCE,
  })
  const abs = firmarPeticion({
    method: 'GET', url: 'https://login.smoobu.com/api/threads?page=1&pageSize=50',
    apiKey: API_KEY, apiSecret: API_SECRET, timestamp: TIMESTAMP, nonce: NONCE,
  })
  assert.equal(rel.canonical, abs.canonical)
  assert.match(rel.canonical, /^GET\n\/api\/threads\npage=1&pageSize=50\n/)
})

test('el método viaja en MAYÚSCULAS', () => {
  const { canonical } = firmarPeticion({
    method: 'post', url: '/api/rates', body: '{}',
    apiKey: API_KEY, apiSecret: API_SECRET, timestamp: TIMESTAMP, nonce: NONCE,
  })
  assert.match(canonical, /^POST\n/)
})

test('el sello de tiempo es ISO 8601 UTC con segundos y Z, sin milisegundos', () => {
  assert.equal(selloTiempo(new Date('2026-04-01T12:00:00.123Z')), '2026-04-01T12:00:00Z')
  assert.match(selloTiempo(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
})

test('sin timestamp/nonce fijos, el nonce es un UUID nuevo en cada petición', () => {
  const base = { method: 'GET', url: '/api/threads', apiKey: API_KEY, apiSecret: API_SECRET } as const
  const a = firmarPeticion({ ...base })
  const b = firmarPeticion({ ...base })
  assert.match(a.headers['X-Nonce'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.notEqual(a.headers['X-Nonce'], b.headers['X-Nonce'])
  assert.notEqual(a.headers['X-Signature'], b.headers['X-Signature'])
})

test('la firma final es BASE64 y el hash del cuerpo HEX — no se mezclan', () => {
  const { headers, canonical } = firmarPeticion({
    method: 'POST', url: '/api/reservations', body: BODY,
    apiKey: API_KEY, apiSecret: API_SECRET, timestamp: TIMESTAMP, nonce: NONCE,
  })
  assert.match(headers['X-Signature'], /^[A-Za-z0-9+/]+=*$/)
  assert.ok(headers['X-Signature'].endsWith('='))
  assert.match(canonical.split('\n')[5], /^[0-9a-f]{64}$/)
})
