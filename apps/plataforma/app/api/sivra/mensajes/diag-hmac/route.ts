import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSmoobuCreds } from '@/lib/smoobu'

export const dynamic = 'force-dynamic'

// DIAGNÓSTICO TEMPORAL de la auth de Smoobu. Prueba una MATRIZ de variantes contra /api/threads y
// devuelve el status + cuerpo de cada una, para localizar la combinación que da 200. Borrar al cerrar.
const PATH = '/api/threads'
const QUERY = 'page=1&pageSize=50'
const URL_FULL = `https://login.smoobu.com${PATH}?${QUERY}`

async function call(label: string, headers: Record<string, string>) {
  try {
    const r = await fetch(URL_FULL, { method: 'GET', headers, cache: 'no-store' })
    const body = (await r.text()).slice(0, 300)
    return { label, status: r.status, body }
  } catch (e: any) {
    return { label, status: 0, body: `fetch error: ${e?.message}` }
  }
}

function hmacHeaders(key: string, secretKey: crypto.BinaryLike, query: string, path = PATH) {
  const bodyHashHex = crypto.createHash('sha256').update('', 'utf8').digest('hex')
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const nonce = crypto.randomUUID()
  const canonical = ['GET', path, query, timestamp, nonce, bodyHashHex, key].join('\n')
  const signature = crypto.createHmac('sha256', secretKey).update(canonical, 'utf8').digest('base64')
  return { 'X-API-Key': key, 'X-Timestamp': timestamp, 'X-Nonce': nonce, 'X-Signature': signature }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { key, secret } = await getSmoobuCreds()
  const keyStripped = key.replace(/^usr_live_/, '')
  const secretBytes = Buffer.from(secret, 'base64') // por si Smoobu firma con el secret decodificado

  const results = await Promise.all([
    // Legacy header (premisa: devuelve 401 tras migración HMAC)
    call('legacy Api-Key (full)', { 'Api-Key': key }),
    call('legacy Api-Key (sin prefijo usr_live_)', { 'Api-Key': keyStripped }),
    call('legacy Api-Key (secret)', { 'Api-Key': secret }),
    // HMAC, secret como STRING base64 (implementación actual)
    call('hmac key=full secret=string', hmacHeaders(key, secret, QUERY)),
    // HMAC, secret DECODIFICADO a bytes
    call('hmac key=full secret=bytes', hmacHeaders(key, secretBytes, QUERY)),
    // HMAC con key sin prefijo
    call('hmac key=stripped secret=string', hmacHeaders(keyStripped, secret, QUERY)),
    call('hmac key=stripped secret=bytes', hmacHeaders(keyStripped, secretBytes, QUERY)),
  ])

  return NextResponse.json({
    creds: {
      keyMasked: key ? `${key.slice(0, 10)}…${key.slice(-4)} (len ${key.length})` : '(vacía)',
      secretLen: secret.length,
      secretBytesLen: secretBytes.length,
    },
    results,
  })
}
