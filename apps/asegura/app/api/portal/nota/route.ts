import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { anotarActividadPortal } from '@/lib/contacto-portal'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Tope duro. `historial_interno` es una bitácora que se lee en pantalla, no un buzón. */
const MAX_TEXTO = 2000

/**
 * POST /api/portal/nota — deja en el historial de la ficha constancia de algo
 * que ha hecho el cliente en el portal. Cuerpo: `{ identidadId, texto }`.
 *
 * Es lo que contesta a «que en la historia de cada cliente aparezca reflejado
 * todo lo que haga ese cliente»: sin esto, una sugerencia solo existiría en
 * Telegram, que se scrollea y se pierde.
 *
 * 🚨 Como en `/api/portal/contacto`, NO acepta `clienteId`: la ficha se resuelve
 * por `portal_vinculo`. Y `sin_ficha` se devuelve tal cual (409) en vez de
 * tragárselo: quien llama necesita saber que no ha quedado constancia en
 * ninguna ficha para no prometerle al cliente que sí.
 */
export async function POST(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const identidadId = typeof body?.identidadId === 'string' ? body.identidadId.trim() : ''
    const texto = typeof body?.texto === 'string' ? body.texto.trim().slice(0, MAX_TEXTO) : ''
    if (identidadId === '' || texto === '') {
      return NextResponse.json({ estado: 'invalido' }, { status: 422 })
    }

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const estado = await anotarActividadPortal(correduria.id, identidadId, texto)
    return NextResponse.json({ estado }, { status: estado === 'ok' ? 200 : estado === 'error' ? 503 : 409 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/nota', e) }, { status: 503 })
  }
}
