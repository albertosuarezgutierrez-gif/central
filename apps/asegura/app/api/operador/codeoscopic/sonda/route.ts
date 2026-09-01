import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { probarConexion } from '@/lib/codeoscopic/cotizar'

export const runtime = 'nodejs'
// El token puede tardar; y sobre todo, nunca queremos una respuesta cacheada
// diciendo que la conexión va bien cuando ya no va.
export const dynamic = 'force-dynamic'

/**
 * Sonda de Codeoscopic. **No gasta ninguna cotización**: solo pide el token
 * OAuth2, que es gratis.
 *
 * Es la forma de estrenar la integración sin pagar: como no hay sandbox
 * utilizable, la primera cotización real cuesta 0,50€, así que host y
 * credenciales se validan antes y por separado. Funciona con
 * `CODEOSCOPIC_TARIFICACION_ACTIVA` todavía apagado, a propósito.
 *
 * Distingue los dos fallos que se confunden siempre:
 *   - no conecta  → sospecha del host (`CODEOSCOPIC_BASE_URL`)
 *   - conecta y rechaza → sospecha de las credenciales
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const r = await probarConexion()
  return NextResponse.json(
    { ok: r.ok, mensaje: r.mensaje, gastado: '0,00€' },
    { status: r.ok ? 200 : 502 },
  )
}
