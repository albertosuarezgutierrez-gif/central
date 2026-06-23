import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSmoobuCreds, canonicalString } from '@/lib/smoobu'

export const dynamic = 'force-dynamic'

// DIAGNÓSTICO TEMPORAL de la firma HMAC de Smoobu. Llama a /api/threads firmando a mano y
// DEVUELVE el cuerpo del 401 de Smoobu + la canónica enviada (con la key enmascarada y SIN el
// secret), para ver qué rechaza exactamente. Borrar cuando la firma quede verificada.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { key, secret } = await getSmoobuCreds()
  const path = '/api/threads'
  const query = 'page=1&pageSize=50'
  const method = 'GET'
  const body = ''
  const bodyHashHex = crypto.createHash('sha256').update(body, 'utf8').digest('hex')
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const nonce = crypto.randomUUID()
  const canonical = canonicalString(method, path, query, timestamp, nonce, bodyHashHex, key)
  const signature = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('base64')

  const url = `https://login.smoobu.com${path}?${query}`
  let status = 0
  let respBody = ''
  try {
    const r = await fetch(url, {
      method,
      headers: {
        'X-API-Key': key,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'X-Signature': signature,
        'Cache-Control': 'no-cache',
      },
      cache: 'no-store',
    })
    status = r.status
    respBody = (await r.text()).slice(0, 1500)
  } catch (e: any) {
    respBody = `fetch error: ${e?.message}`
  }

  return NextResponse.json({
    smoobu: { status, body: respBody },
    sent: {
      url,
      method,
      keyMasked: key ? `${key.slice(0, 10)}…${key.slice(-4)} (len ${key.length})` : '(vacía)',
      secretLen: secret.length,
      timestamp,
      nonce,
      signature,
      bodyHashHex,
      // canónica con la API key del final enmascarada (las 6 líneas previas tal cual)
      canonicalMasked: canonical.split('\n').slice(0, 6).join(' | ') + ` | ${key.slice(0, 6)}…`,
    },
  })
}
