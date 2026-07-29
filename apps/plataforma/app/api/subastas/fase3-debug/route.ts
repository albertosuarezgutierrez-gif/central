// ── TEMPORAL (Fase 3 subastas, 29/07/2026) ──────────────────────────────────
// Puente de exploración: la sesión de Claude no puede salir a los hosts de las
// fuentes nuevas (allowlist del contenedor, solo se relee al arrancar), pero
// Vercel sí. Este endpoint baja una URL de una LISTA CERRADA de hosts oficiales
// y devuelve el cuerpo crudo, para escribir los parsers contra datos reales
// (regla de la casa: nada de parsers a ciegas). Se ELIMINA al cerrar la fase,
// como el `boe-debug` de la Fase 0.
//
// Auth por token en BD (`subastas_debug_token`, fila única id=1) — NUNCA en el
// repo; rotable/revocable por Supabase MCP sin redeploy (patrón
// `empresas_acceso_token`). El middleware deja pasar la ruta; el 401 lo da aquí.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ingerirJunta } from '@/lib/subastas/junta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HOSTS_PERMITIDOS = new Set([
  'www.boe.es', 'boe.es',
  'www.sareb.es', 'sareb.es',
  'admbop.dipusevilla.es',
  'www.diphuelva.es',
  'www.bopcadiz.es',
  'www.juntadeandalucia.es',
  'www.ine.es', 'ine.es', 'servicios.ine.es',
])

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams

  const token = sp.get('token') ?? ''
  const filas = await prisma
    .$queryRaw<Array<{ token: string }>>(
      Prisma.sql`SELECT token FROM subastas_debug_token WHERE id = 1 AND activo = true`,
    )
    .catch(() => [])
  if (!token || !filas.length || filas[0].token !== token) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  // Disparo manual de la ingesta de la Junta para la prueba end-to-end de la
  // fase: la sesión de Claude no dispone de CRON_SECRET, este token de BD es
  // su llave acotada. El cron diario sigue siendo el camino normal.
  if (sp.get('accion') === 'junta') {
    try {
      return NextResponse.json({ ok: true, ...(await ingerirJunta()) })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
    }
  }

  const urlParam = sp.get('url')
  if (!urlParam) return NextResponse.json({ error: 'falta ?url=' }, { status: 400 })
  let destino: URL
  try {
    destino = new URL(urlParam)
  } catch {
    return NextResponse.json({ error: 'url inválida' }, { status: 400 })
  }
  if (destino.protocol !== 'https:' || !HOSTS_PERMITIDOS.has(destino.hostname)) {
    return NextResponse.json({ error: `host fuera de la lista: ${destino.hostname}` }, { status: 400 })
  }

  try {
    const r = await fetch(destino, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml,application/json,*/*',
      },
      signal: AbortSignal.timeout(25000),
      cache: 'no-store',
      redirect: 'follow',
    })
    // Un redirect puede acabar fuera de la lista (p. ej. un CDN): no se devuelve
    // ese cuerpo, solo a dónde fue, para decidir si ampliar la lista.
    const final = new URL(r.url)
    if (!HOSTS_PERMITIDOS.has(final.hostname)) {
      return NextResponse.json({ error: `redirigió fuera de la lista: ${r.url}`, status: r.status }, { status: 400 })
    }
    const cuerpo = await r.text()
    return new NextResponse(cuerpo, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-debug-status': String(r.status),
        'x-debug-content-type': r.headers.get('content-type') ?? '',
        'x-debug-url-final': r.url,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 502 })
  }
}
