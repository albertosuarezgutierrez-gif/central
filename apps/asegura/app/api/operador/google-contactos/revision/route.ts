import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ACCIONES_REVISION } from '@central/module-seguros/google-contactos-revision'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { listarRevisiones, resolverRevision, unificarTodos } from '@/lib/google-contactos-revision'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID = z.string().uuid()

/**
 * GET /api/operador/google-contactos/revision[?despuesDe=<id>] — la cola de revisión de la
 * sincronización con Google Contacts: 50 pendientes por página, por CURSOR (`siguiente`), con lo
 * que había en Google descifrado. `pendientes` = total sin resolver.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const crudo = new URL(req.url).searchParams.get('despuesDe')
  const despuesDe = crudo === null || crudo === '' ? null : UUID.safeParse(crudo)
  if (despuesDe && !despuesDe.success) return NextResponse.json({ estado: 'invalido', motivo: 'despuesDe no es un id' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await listarRevisiones(correduria.id, despuesDe ? despuesDe.data : null)
    return NextResponse.json({ estado: 'ok', ...r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/google-contactos/revision', e) }, { status: 500 })
  }
}

const Cuerpo = z.object({
  id: UUID,
  accion: z.enum(ACCIONES_REVISION),
  actor: z.string().trim().min(1).max(120),
  /** Solo `aceptar_lead`: dar de alta aunque el teléfono/email ya esté en otra ficha (tras el 409). */
  forzar: z.boolean().optional(),
  /** Solo `elegir_titular` («Este número es de…»): la ficha elegida (una de las candidatas). */
  clienteId: UUID.optional(),
}).strict()

/** «Unificar todos» los pendientes de un motivo inequívoco (`nombre_distinto`, `mismo_email`, `mismo_nombre`). */
const CuerpoLote = z.object({
  lote: z.literal('unificar'),
  // Solo los de mismo teléfono y otro nombre; `mismo_email`/`mismo_nombre`, uno a uno.
  motivo: z.literal('nombre_distinto'),
  despuesDe: z.string().uuid().nullable().optional(),
  actor: z.string().trim().min(1).max(120),
}).strict()

/**
 * POST /api/operador/google-contactos/revision — resuelve UNA revisión:
 * `{ id, accion: 'aceptar_lead' | 'descartar' | 'mantener_crm' | 'unificar', actor, forzar? }`, o en bloque
 * `{ lote: 'unificar', motivo, actor }` (hasta 20 por llamada, por cursor `despuesDe`/`siguiente`; las que no se pueden se omiten y lo dice).
 * «Unificar» (solo `duplicado_ambiguo` inequívoco) crea el vínculo PENDIENTE ficha ↔ contacto; Google
 * no se toca aquí: lo escribe la pasada siguiente del cron.
 * Ninguna acción toca el vínculo ni Google («Mantener CRM» sobre un contacto sacado del grupo
 * solo cierra la revisión; no lo recrea). `aceptar_lead` da de alta un lead con el alta normal
 * (409 con las fichas que ya tienen ese teléfono/email; `forzar` para seguir).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const crudo: unknown = await req.json().catch(() => null)
  const lote = CuerpoLote.safeParse(crudo)
  if (lote.success) {
    try {
      if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
      const correduria = await correduriaUnica()
      if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
      const r = await unificarTodos(correduria.id, lote.data)
      if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
      return NextResponse.json({ estado: 'ok', unificadas: r.unificadas, omitidas: r.omitidas, fallidas: r.fallidas, siguiente: r.siguiente, quedan: r.quedan })
    } catch (e) {
      return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/google-contactos/revision', e) }, { status: 500 })
    }
  }
  const cuerpo = Cuerpo.safeParse(crudo)
  if (!cuerpo.success) {
    return NextResponse.json({ estado: 'invalido', motivo: 'Cuerpo inválido: { id, accion, actor, forzar?, clienteId? }', errores: cuerpo.error.flatten().fieldErrors }, { status: 400 })
  }
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await resolverRevision(correduria.id, { ...cuerpo.data, forzar: cuerpo.data.forzar === true, clienteId: cuerpo.data.clienteId ?? null })
    if (!r.ok) {
      const { ok: _ok, status, ...resto } = r
      void _ok
      return NextResponse.json(resto, { status })
    }
    return NextResponse.json({ estado: 'ok', resultado: r.estado, clienteId: r.clienteId })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/google-contactos/revision', e) }, { status: 500 })
  }
})
