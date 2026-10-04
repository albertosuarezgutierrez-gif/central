import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { sincronizarEmisionExterna, type ResultadoSincronizar } from '@/lib/emision-externa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Una emisión hecha FUERA de la intranet, en la web de Avant2 (30/09/2026). Alberto: «registrarla sin
 * volver a emitir». Todo lo del vendor es `GET /insurances/{id}` — gratis.
 *
 * `GET ?projectId=&clienteId=&oportunidadId=` → vista previa: qué dice el proyecto y qué se haría.
 * `POST { projectId, clienteId, oportunidadId?, confirmado: true, actor }` → lo registra (y acuña la
 * póliza si la compañía ya dio número). No manda nada al cliente.
 */

const error = (status: number, mensaje: string) => NextResponse.json({ estado: 'error', mensaje }, { status })

async function resolver(): Promise<{ id: string } | null> {
  return correduriaUnica().catch(() => null)
}

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const q = new URL(req.url).searchParams
    const correduria = await resolver()
    if (!correduria) return error(503, 'no se ha podido resolver la correduría')
    const r = await sincronizarEmisionExterna(correduria.id, {
      projectId: q.get('projectId')?.trim() ?? '',
      clienteId: q.get('clienteId')?.trim() || null,
      oportunidadId: q.get('oportunidadId')?.trim() || null,
      actor: 'vista-previa',
      escribir: false,
    })
    if (!r.ok) return error(r.status, r.mensaje)
    if (r.tipo === 'escrito') return error(409, r.descripcion)
    return NextResponse.json({
      estado: 'ok',
      projectId: r.projectId,
      ramo: r.ramo,
      emision: r.emision,
      estadoProyecto: r.estadoProyecto,
      accion: r.accion,
      oportunidadId: r.oportunidadId,
      bloqueos: r.bloqueos,
    })
  } catch (e) {
    return error(503, registrarErrorCartera('operador/codeoscopic/emision-externa', e))
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const c = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (c.confirmado !== true) return error(400, 'falta confirmado: true (registrar la emisión escribe en la cartera)')
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
  try {
    const correduria = await resolver()
    if (!correduria) return error(503, 'no se ha podido resolver la correduría')
    const r: ResultadoSincronizar = await sincronizarEmisionExterna(correduria.id, {
      projectId: texto(c.projectId) ?? '',
      clienteId: texto(c.clienteId),
      oportunidadId: texto(c.oportunidadId),
      actor: texto(c.actor) ?? 'plataforma',
      escribir: true,
    })
    if (!r.ok) return error(r.status, r.mensaje)
    if (r.tipo === 'vista') return error(500, 'respuesta inesperada')
    return NextResponse.json({
      estado: r.estado,
      antes: r.antes,
      despues: r.despues,
      polizaId: r.polizaId,
      numeroPoliza: r.numeroPoliza,
      compania: r.compania,
      descripcion: r.descripcion,
      oportunidadGanada: r.oportunidadGanada,
      ...(r.mensaje ? { mensaje: r.mensaje } : {}),
    })
  } catch (e) {
    return error(503, registrarErrorCartera('operador/codeoscopic/emision-externa', e))
  }
})
