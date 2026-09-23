import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { firmarCarta, pedirCodigoCarta, prepararCarta } from '@/lib/carta-mediador'
import { puentePortalAutorizado } from '@/lib/puente-portal'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * /api/portal/carta-mediador — el cliente firma la carta que nos nombra corredores de su póliza actual
 * («salida B» del presupuesto, PR 6). POST { accion:'preparar'|'codigo'|'firmar', identidadId, presupuestoId, … }.
 * Como el resto del puente: NO acepta `clienteId`; la ficha sale de `portal_vinculo` y tiene que ser la
 * del tomador de esa póliza.
 */
const STATUS: Record<string, number> = {
  ok: 200, codigo_enviado: 200, firmada: 200, ya_firmada: 409, no_disponible: 422, otra_ficha: 409, no_encontrado: 404,
  espera: 429, limite_codigos: 429, sin_email: 422, sin_correo_configurado: 503, fallo_envio: 502,
  sin_codigo: 409, codigo_caducado: 410, demasiados_intentos: 429, codigo_incorrecto: 422, nombre_no_coincide: 422,
  carta_cambiada: 409, sin_ficha: 409, varias_fichas: 409, error: 503,
}

export const POST = auditado(async (req: Request) => {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const identidadId = typeof b?.identidadId === 'string' ? b.identidadId.trim() : ''
    const presupuestoId = typeof b?.presupuestoId === 'string' ? b.presupuestoId.trim() : ''
    if (!UUID.test(identidadId) || !UUID.test(presupuestoId)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    if (b?.accion === 'preparar') {
      const r = await prepararCarta(correduria.id, identidadId, presupuestoId)
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    if (b?.accion === 'codigo') {
      const r = await pedirCodigoCarta(correduria.id, identidadId, presupuestoId)
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    if (b?.accion === 'firmar') {
      const codigo = typeof b.codigo === 'string' ? b.codigo : ''
      const nombre = typeof b.nombre === 'string' ? b.nombre : ''
      const cartaHash = typeof b.cartaHash === 'string' ? b.cartaHash : ''
      if (!/^\d{6}$/.test(codigo.trim()) || !nombre.trim() || !/^[0-9a-f]{64}$/.test(cartaHash)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
      const r = await firmarCarta(correduria.id, identidadId, presupuestoId, {
        codigo, nombre, cartaHash,
        ip: typeof b.ip === 'string' ? b.ip.slice(0, 100) : null,
        userAgent: typeof b.userAgent === 'string' ? b.userAgent.slice(0, 300) : null,
      })
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    return NextResponse.json({ estado: 'invalido' }, { status: 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/carta-mediador', e) }, { status: 503 })
  }
})
