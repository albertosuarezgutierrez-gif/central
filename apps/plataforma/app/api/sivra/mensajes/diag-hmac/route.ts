import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSmoobuCreds } from '@/lib/smoobu'

export const dynamic = 'force-dynamic'

// DIAGNÓSTICO TEMPORAL: prueba variantes de la CADENA CANÓNICA HMAC contra /api/threads y devuelve
// el status de cada una, para localizar el formato exacto que da 200. Borrar al cerrar.
const PATH = '/api/threads'
const QUERY = 'page=1&pageSize=50'
const URL_FULL = `https://login.smoobu.com${PATH}?${QUERY}`
const SHA_EMPTY = crypto.createHash('sha256').update('', 'utf8').digest('hex')

async function send(label: string, canonical: string, key: string, secret: crypto.BinaryLike, sigEnc: 'base64' | 'hex', extra?: Record<string, string>) {
  const timestamp = extra?.['X-Timestamp'] ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const nonce = extra?.['X-Nonce'] ?? crypto.randomUUID()
  const signature = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest(sigEnc)
  try {
    const r = await fetch(URL_FULL, {
      method: 'GET',
      headers: { 'X-API-Key': key, 'X-Timestamp': timestamp, 'X-Nonce': nonce, 'X-Signature': signature, ...extra },
      cache: 'no-store',
    })
    return { label, status: r.status, body: (await r.text()).slice(0, 160) }
  } catch (e: any) {
    return { label, status: 0, body: `err: ${e?.message}` }
  }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { key, secret } = await getSmoobuCreds()
  const secretBytes = Buffer.from(secret, 'base64')
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const nonce = crypto.randomUUID()
  const j = (a: string[]) => a.join('\n')

  // canónica base (orden del spec): MÉTODO RUTA QUERY TS NONCE BODYHASH KEY
  const base = [j(['GET', PATH, QUERY, ts, nonce, SHA_EMPTY, key]), ts, nonce]

  const results = await Promise.all([
    send('1 base b64', base[0], key, secret, 'base64', { 'X-Timestamp': ts, 'X-Nonce': nonce }),
    send('2 trailing \\n', base[0] + '\n', key, secret, 'base64', { 'X-Timestamp': ts, 'X-Nonce': nonce }),
    send('3 sig hex', base[0], key, secret, 'hex', { 'X-Timestamp': ts, 'X-Nonce': nonce }),
    send('4 secret=bytes b64', base[0], key, secretBytes, 'base64', { 'X-Timestamp': ts, 'X-Nonce': nonce }),
    send('5 secret=bytes hex', base[0], key, secretBytes, 'hex', { 'X-Timestamp': ts, 'X-Nonce': nonce }),
    send('6 path /threads', j(['GET', '/threads', QUERY, ts, nonce, SHA_EMPTY, key]), key, secret, 'base64', { 'X-Timestamp': ts, 'X-Nonce': nonce }),
    send('7 bodyhash empty', j(['GET', PATH, QUERY, ts, nonce, '', key]), key, secret, 'base64', { 'X-Timestamp': ts, 'X-Nonce': nonce }),
    send('8 no query line', j(['GET', PATH, ts, nonce, SHA_EMPTY, key]), key, secret, 'base64', { 'X-Timestamp': ts, 'X-Nonce': nonce }),
    send('9 full URL path', j(['GET', URL_FULL, QUERY, ts, nonce, SHA_EMPTY, key]), key, secret, 'base64', { 'X-Timestamp': ts, 'X-Nonce': nonce }),
    send('10 order no key (key omitted)', j(['GET', PATH, QUERY, ts, nonce, SHA_EMPTY]), key, secret, 'base64', { 'X-Timestamp': ts, 'X-Nonce': nonce }),
    send('11 ts unix secs', j(['GET', PATH, QUERY, String(Math.floor(Date.now() / 1000)), nonce, SHA_EMPTY, key]), key, secret, 'base64', { 'X-Timestamp': String(Math.floor(Date.now() / 1000)), 'X-Nonce': nonce }),
    send('12 key+ts+nonce+method+path+query+body', j([key, ts, nonce, 'GET', PATH, QUERY, SHA_EMPTY]), key, secret, 'base64', { 'X-Timestamp': ts, 'X-Nonce': nonce }),
  ])

  return NextResponse.json({
    creds: { keyMasked: `${key.slice(0, 10)}…${key.slice(-4)} (len ${key.length})`, secretLen: secret.length },
    results,
  })
}
