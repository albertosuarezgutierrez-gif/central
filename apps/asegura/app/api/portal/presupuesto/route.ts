import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { firmarAceptacion, pedirCodigoAceptacion, prepararAceptacion } from '@/lib/presupuesto-aceptacion'
import { puentePortalAutorizado } from '@/lib/puente-portal'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * /api/portal/presupuesto — el cliente elige y firma su presupuesto (spec 2026-09-21, PR 4).
 *   POST { accion:'preparar', identidadId, presupuestoId, opcionId } → el documento a firmar (no escribe)
 *        { accion:'codigo',   identidadId, presupuestoId, opcionId }
 *        { accion:'firmar',   identidadId, presupuestoId, opcionId, codigo, nombre, documentoHash, ip?, userAgent? }
 * Como el resto del puente: NO acepta `clienteId`, la ficha sale de `portal_vinculo`.
 */
const STATUS: Record<string, number> = {
  ok: 200, codigo_enviado: 200, aceptado: 200, no_encontrado: 404, no_admite: 409, sin_precio: 409,
  sin_email: 422, sin_correo_configurado: 503, fallo_envio: 502, espera: 429, limite_codigos: 429,
  documento_cambiado: 409, sin_codigo: 409, codigo_caducado: 410, demasiados_intentos: 429, codigo_incorrecto: 422,
  nombre_no_coincide: 422, sin_ficha: 409, varias_fichas: 409, error: 503,
}

export const POST = auditado(async (req: Request) => {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const s = (k: string) => (typeof b?.[k] === 'string' ? (b[k] as string).trim() : '')
    const identidadId = s('identidadId'), presupuestoId = s('presupuestoId'), opcionId = s('opcionId')
    if (!UUID.test(identidadId) || !UUID.test(presupuestoId) || !UUID.test(opcionId)) {
      return NextResponse.json({ estado: 'invalido' }, { status: 422 })
    }
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    if (b?.accion === 'preparar') {
      const r = await prepararAceptacion(correduria.id, identidadId, presupuestoId, opcionId)
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    if (b?.accion === 'codigo') {
      const r = await pedirCodigoAceptacion(correduria.id, identidadId, presupuestoId, opcionId)
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    if (b?.accion === 'firmar') {
      const codigo = s('codigo'), nombre = s('nombre'), documentoHash = s('documentoHash')
      if (!/^\d{6}$/.test(codigo) || !nombre || !/^[0-9a-f]{64}$/.test(documentoHash)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
      const r = await firmarAceptacion(correduria.id, identidadId, presupuestoId, opcionId, {
        codigo, nombre, documentoHash,
        ip: typeof b.ip === 'string' ? b.ip.slice(0, 100) : null,
        userAgent: typeof b.userAgent === 'string' ? b.userAgent.slice(0, 300) : null,
      })
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    return NextResponse.json({ estado: 'invalido' }, { status: 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/presupuesto', e) }, { status: 503 })
  }
})
