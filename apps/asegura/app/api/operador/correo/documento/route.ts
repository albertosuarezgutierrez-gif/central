import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { validarAsignacionDocumento, validarDocumentoCorreo } from '@/lib/correo-documento'
import { asignarDocumentoCorreo, documentosCorreoSinAsignar, guardarDocumentoCorreo } from '@/lib/correo-documento-bd'
import { esColumnaAusente } from '@/lib/pg-error'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SIN_MIGRACION = { estado: 'sin_migracion', motivo: 'falta aplicar 2026-10-21_correo_agente_f1.sql' }

/**
 * Adjuntos PDF de los correos de compañía (F1 del agente de correo, 21/10/2026). Los manda el triaje de plataforma,
 * DESPUÉS de registrar el aviso del mismo correo (`/correo/evento`), uno por llamada (el cuerpo va en base64 y Vercel
 * corta a ~4,5 MB).
 *
 *   POST  { mensajeId, nombre, mime, base64 } → { estado:'guardado'|'repetido'|'asignado_previo', documentoId, asignado, motivo }
 *         El DESTINO lo decide asegura con lo ya resuelto para ese Message-ID (nunca por el nombre del tomador); si no
 *         casa, queda SIN asignar para la bandeja. 422 `invalido` · 503 `sin_migracion` (no se ha guardado nada).
 *   GET   → { estado:'ok', filas, truncado } — los adjuntos sin asignar (90 días), sin el fichero.
 *   PATCH { id, clienteId, actor } → asigna a mano uno sin asignar. 404 `no_encontrado` · 422 cliente ajeno.
 *
 * Lógica pura y test: `lib/correo-documento.ts`. Escrituras: `lib/correo-documento-bd.ts`.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const v = validarDocumentoCorreo(await req.json().catch(() => null))
    if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 422 })
    const r = await guardarDocumentoCorreo(correduria.id, v.valor)
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: 503 })
    return NextResponse.json({ estado: r.estado, documentoId: r.documentoId, asignado: r.asignado, clienteId: r.clienteId, motivo: r.motivo })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/documento', e) }, { status: 500 })
  }
})

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await documentosCorreoSinAsignar(correduria.id)
    return NextResponse.json({ estado: 'ok', ...r }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    if (esColumnaAusente(e)) return NextResponse.json(SIN_MIGRACION, { status: 503 })
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/documento', e) }, { status: 500 })
  }
}

export const PATCH = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const v = validarAsignacionDocumento(b)
    if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 422 })
    const actor = typeof b?.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
    const r = await asignarDocumentoCorreo(correduria.id, v.id, v.clienteId, actor)
    if (r === 'cliente_ajeno') return NextResponse.json({ estado: 'invalido', motivo: 'ese cliente no es de esta correduría' }, { status: 422 })
    if (r === 'no_encontrado') return NextResponse.json({ estado: 'no_encontrado', motivo: 'ese documento no existe o ya está asignado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', id: v.id })
  } catch (e) {
    if (esColumnaAusente(e)) return NextResponse.json(SIN_MIGRACION, { status: 503 })
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/documento', e) }, { status: 500 })
  }
})
