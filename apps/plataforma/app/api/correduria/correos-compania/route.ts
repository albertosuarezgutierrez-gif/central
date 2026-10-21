import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import {
  asignarDocumentoCorreoAsegura, asignarEventoCorreoAsegura, correosCompaniaAsegura, documentosCorreoSinAsignarAsegura,
  historialSolicitudAsegura, marcarCorreoCompaniaAsegura,
} from '@/lib/seguimiento-asegura'
import { interpretarCorreosCompania, interpretarDocumentosSinAsignar, interpretarHistorialSolicitud, nombreSugeridoDeAsunto } from '@/lib/correduria/correos-compania'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Asuntos de `correo_triaje` (buzón único de Alberto) por Message-ID → nombre SUGERIDO para asignar a mano (F1,
 * 21/10/2026). Si la consulta falla, sin sugerencias (no rompe la bandeja). El Message-ID no viaja al navegador.
 */
async function sugerenciasPorMensaje(mensajes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (mensajes.length === 0) return out
  try {
    const filas = await prisma.$queryRaw<{ id: string; asunto: string }[]>`
      SELECT gmail_message_id AS id, asunto FROM correo_triaje WHERE gmail_message_id = ANY(${mensajes}::text[])`
    for (const f of filas) {
      const n = nombreSugeridoDeAsunto(f.asunto)
      if (n) out.set(f.id, n)
    }
  } catch (e) {
    console.error('[correos-compania] sin sugerencias por asunto:', e instanceof Error ? e.message : e)
  }
  return out
}

/**
 * GET — bandeja «Correos de compañía» de Mi mesa (14/10/2026): avisos de compañías leídos del correo en los
 * últimos 30 días con su estado (aplicado · ya en CIMA · sin resolver · a medias), los sin resolver primero.
 * F1 (21/10/2026): cada fila sin resolver trae `sugerencia` (nombre del asunto, para el buscador) y la respuesta trae
 * `documentos` (adjuntos de correo sin asignar, con sus tres estados). `?historial=<id>` → historial de esa solicitud.
 * Contrato en `lib/correduria/correos-compania.ts`; un fallo de lectura es `error`, nunca lista vacía.
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const historial = new URL(req.url).searchParams.get('historial') ?? ''
  if (historial !== '') {
    if (!UUID.test(historial)) return NextResponse.json({ estado: 'error', motivo: 'id no válido' }, { status: 422 })
    const h = await historialSolicitudAsegura(historial)
    return NextResponse.json(interpretarHistorialSolicitud(h.status, h.json), { headers: { 'cache-control': 'no-store' } })
  }
  const [r, d] = await Promise.all([correosCompaniaAsegura(30), documentosCorreoSinAsignarAsegura()])
  // Las sugerencias solo para lo SIN RESOLVER; el Message-ID se usa aquí y se quita antes de responder.
  const j = (r.json ?? null) as Record<string, unknown> | null
  const filas = Array.isArray(j?.filas) ? (j.filas as Record<string, unknown>[]) : null
  if (filas) {
    const pendientes = filas.filter((f) => f?.estado === 'sin_resolver' && typeof f.mensajeId === 'string').map((f) => f.mensajeId as string)
    const sug = await sugerenciasPorMensaje([...new Set(pendientes)].slice(0, 300))
    for (const f of filas) {
      if (typeof f?.mensajeId === 'string' && f.estado === 'sin_resolver') f.sugerencia = sug.get(f.mensajeId) ?? null
      if (f) delete f.mensajeId
    }
  }
  const lectura = interpretarCorreosCompania(r.status, r.json)
  return NextResponse.json({ ...lectura, documentos: interpretarDocumentosSinAsignar(d.status, d.json) }, { headers: { 'cache-control': 'no-store' } })
}

/**
 * PATCH { id, revisado } — «Marcar como mirado» / «Deshacer» (14/10/2026). Mismo guarda que el GET; reenvía al
 * puerto de asegura (`PATCH /api/operador/correo/evento`) y devuelve su MISMO status y json.
 */
export async function PATCH(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b.id !== 'string' || typeof b.revisado !== 'boolean') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id o si está mirado.' }, { status: 422 })
  }
  const r = await marcarCorreoCompaniaAsegura({ id: b.id, revisado: b.revisado })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

/**
 * POST — «Asignar a cliente / oportunidad» (F1, 21/10/2026):
 *   { accion:'asignar', id, clienteId, oportunidadId? }  → un aviso sin resolver (asegura: `/correo/evento/asignar`).
 *   { accion:'asignar_documento', id, clienteId }        → un adjunto de correo sin asignar.
 * El `actor` lo pone el servidor desde la sesión y va el ÚLTIMO. Devuelve el MISMO status y json del puerto.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b.id !== 'string' || !UUID.test(b.id) || typeof b.clienteId !== 'string' || !UUID.test(b.clienteId)) {
    return NextResponse.json({ estado: 'invalido', motivo: 'Faltan el aviso y el cliente.' }, { status: 422 })
  }
  if (b.accion === 'asignar') {
    const oportunidadId = typeof b.oportunidadId === 'string' && UUID.test(b.oportunidadId) ? b.oportunidadId : null
    const r = await asignarEventoCorreoAsegura({ id: b.id, clienteId: b.clienteId, oportunidadId, actor: guarda.session.email })
    return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
  }
  if (b.accion === 'asignar_documento') {
    const r = await asignarDocumentoCorreoAsegura({ id: b.id, clienteId: b.clienteId, actor: guarda.session.email })
    return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
  }
  return NextResponse.json({ estado: 'invalido', motivo: 'accion desconocida' }, { status: 422 })
}
