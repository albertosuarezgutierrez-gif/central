import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSmoobuCreds } from '@/lib/smoobu'

export const dynamic = 'force-dynamic'

// DIAGNÓSTICO TEMPORAL de auth Smoobu. Acepta ?testkey= y ?testsecret= para probar credenciales
// arbitrarias sin redeploy. Prueba header legacy Api-Key + firma HMAC. Borrar al cerrar.
const PATH = '/api/threads'
const QUERY = 'page=1&pageSize=50'
const URL_FULL = `https://login.smoobu.com${PATH}?${QUERY}`
const SHA_EMPTY = crypto.createHash('sha256').update('', 'utf8').digest('hex')

async function call(label: string, headers: Record<string, string>) {
  try {
    const r = await fetch(URL_FULL, { method: 'GET', headers, cache: 'no-store' })
    return { label, status: r.status, body: (await r.text()).slice(0, 200) }
  } catch (e: any) {
    return { label, status: 0, body: `err: ${e?.message}` }
  }
}

function hmac(key: string, secret: crypto.BinaryLike) {
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const nonce = crypto.randomUUID()
  const canonical = ['GET', PATH, QUERY, ts, nonce, SHA_EMPTY, key].join('\n')
  const signature = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('base64')
  return { 'X-API-Key': key, 'X-Timestamp': ts, 'X-Nonce': nonce, 'X-Signature': signature }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const db = await getSmoobuCreds()
  const key = req.nextUrl.searchParams.get('testkey') || db.key
  const secret = req.nextUrl.searchParams.get('testsecret') || db.secret
  const secretBytes = secret ? Buffer.from(secret, 'base64') : Buffer.alloc(0)

  const results = await Promise.all([
    call('legacy Api-Key', { 'Api-Key': key }),
    call('legacy api-key lower', { 'api-key': key }),
    call('hmac secret=string', hmac(key, secret || key)),
    call('hmac secret=bytes', secret ? hmac(key, secretBytes) : { skip: 'no secret' } as any),
  ])

  return NextResponse.json({
    using: { keyMasked: `${key.slice(0, 6)}…${key.slice(-4)} (len ${key.length})`, secretLen: secret.length, source: req.nextUrl.searchParams.get('testkey') ? 'query' : 'db' },
    results,
  })
}
