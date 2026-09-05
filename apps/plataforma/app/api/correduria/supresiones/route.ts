import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { resolverSupresionAsegura, supresionesAsegura } from '@/lib/supresiones-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/supresiones — las solicitudes del derecho de SUPRESIÓN
 * (art. 17 RGPD) que abre el CLIENTE desde el portal (`apps/asegura-portal`).
 *
 * Esta app no toca la BD de la correduría: reenvía al puerto de asegura
 * (`/api/operador/supresiones`) con el secreto de operador y devuelve el MISMO
 * status y json, para que la pantalla lea el contrato del puerto tal cual.
 *
 * Sesión de plataforma obligatoria, y el `actor` **lo pone el servidor**: la
 * respuesta que se le da a un interesado es la prueba del art. 12.4, y una
 * contestación sin saber quién la firmó no la puede revisar nadie después.
 *
 *   GET  ?todas=1
 *   POST { id, estado, respuesta?, prorrogaMotivo? }
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const todas = new URL(req.url).searchParams.get('todas') === '1'
  const r = await supresionesAsegura(todas)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.id !== 'string' || body.id.trim() === '') {
    return NextResponse.json({ error: 'solicitud_requerida', motivo: 'Falta el id de la solicitud.' }, { status: 400 })
  }
  // 🚨 El `actor` va el ÚLTIMO: un cliente que mandara el suyo en el cuerpo no
  // puede firmar la respuesta con otro nombre. Y no se valida aquí si la
  // respuesta está escrita — eso lo exige asegura (y su CHECK en la BD), que es
  // donde tiene que exigirse: una guarda solo en esta pantalla no protege a un
  // `UPDATE` hecho por otro camino.
  const r = await resolverSupresionAsegura({ ...body, actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
