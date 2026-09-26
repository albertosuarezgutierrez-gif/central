import { after, NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { anulacionesParaFirmar, firmarAnulacion, pedirCodigoFirma } from '@/lib/anulacion-portal'
import { enviarAnulacionTrasFirma } from '@/lib/aprobaciones'
import { puentePortalAutorizado } from '@/lib/puente-portal'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * /api/portal/anulacion — el cliente firma su anulación desde el portal (pieza 2-d-2).
 *   GET  ?identidadId=…  → { estado:'ok', anulaciones:[{ id, …, carta }] }
 *   POST { accion:'codigo', identidadId, anulacionId }
 *        { accion:'firmar', identidadId, anulacionId, codigo, nombre, ip?, userAgent? }
 * Como el resto del puente: NO acepta `clienteId`, la ficha sale de `portal_vinculo`.
 */
export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const identidadId = new URL(req.url).searchParams.get('identidadId')?.trim() ?? ''
    if (!UUID.test(identidadId)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await anulacionesParaFirmar(correduria.id, identidadId)
    return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : r.estado === 'error' ? 503 : 409 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/anulacion', e) }, { status: 503 })
  }
}

const STATUS: Record<string, number> = {
  codigo_enviado: 200, firmada: 200, no_encontrada: 404, carta_incompleta: 409, sin_email: 422, sin_correo_configurado: 503,
  fallo_envio: 502, espera: 429, limite_codigos: 429, carta_cambiada: 409, sin_codigo: 409, codigo_caducado: 410, demasiados_intentos: 429, codigo_incorrecto: 422,
  nombre_no_coincide: 422, sin_ficha: 409, varias_fichas: 409, error: 503,
}

export const POST = auditado(async (req: Request) => {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const identidadId = typeof b?.identidadId === 'string' ? b.identidadId.trim() : ''
    const anulacionId = typeof b?.anulacionId === 'string' ? b.anulacionId.trim() : ''
    if (!UUID.test(identidadId) || !UUID.test(anulacionId)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    if (b?.accion === 'codigo') {
      const r = await pedirCodigoFirma(correduria.id, identidadId, anulacionId)
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    if (b?.accion === 'firmar') {
      const codigo = typeof b.codigo === 'string' ? b.codigo : ''
      const nombre = typeof b.nombre === 'string' ? b.nombre : ''
      const cartaHash = typeof b.cartaHash === 'string' ? b.cartaHash : ''
      if (!/^\d{6}$/.test(codigo.trim()) || !nombre.trim() || !/^[0-9a-f]{64}$/.test(cartaHash)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
      const r = await firmarAnulacion(correduria.id, identidadId, anulacionId, {
        codigo, nombre, cartaHash,
        ip: typeof b.ip === 'string' ? b.ip.slice(0, 100) : null,
        userAgent: typeof b.userAgent === 'string' ? b.userAgent.slice(0, 300) : null,
      })
      if (r.estado === 'firmada') {
        // La carta sale sola hacia la compañía (regla de Alberto, 26/09/2026) DESPUÉS de contestar: el
        // portal corta el puente a los pocos segundos y la firma ya está guardada. Si no puede salir, se
        // queda en «Hoy · Esperan tu OK» como antes; nunca estropea la firma.
        after(async () => {
          try {
            const envio = await enviarAnulacionTrasFirma(correduria.id, anulacionId)
            console.log(`[portal/anulacion] ${anulacionId} firmada; envío a la compañía: ${envio.estado}${'motivo' in envio ? ` (${envio.motivo})` : ''}`)
          } catch (e) {
            console.error('[portal/anulacion] firmada; el envío automático falló, queda en la cola:', e instanceof Error ? e.message : e)
          }
        })
      }
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    return NextResponse.json({ estado: 'invalido' }, { status: 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/anulacion', e) }, { status: 503 })
  }
})
