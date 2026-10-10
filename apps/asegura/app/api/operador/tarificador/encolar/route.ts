import { NextResponse } from 'next/server'
import { validarRiesgoComunidad } from '@central/module-tarificacion'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { encolarTrabajo, lanzarPendientes } from '@/lib/tarificador'
import { rpaActivo } from '@/lib/tarificador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuidONull = (v: unknown): string | null | false =>
  v === undefined || v === null || v === '' ? null : typeof v === 'string' && UUID.test(v.trim()) ? v.trim() : false

/**
 * `POST /api/operador/tarificador/encolar` — pide una cotización por el TARIFICADOR RPA (bot en el
 * portal de la compañía) para un ramo que Codeoscopic no cubre. Body:
 * `{ oportunidadId?, clienteId?, polizaId?, compania, ramo: 'comunidades', riesgo: RiesgoComunidad }`.
 *
 * Cerrojos: Bearer de operador · `TARIFICADOR_RPA_ACTIVO=1` · fila de `companias_integracion` con
 * `rpa_autorizada` (fail-closed) · riesgo validado. TARIFICAR ≠ EMITIR: nada de esto emite ni gasta
 * Codeoscopic. Encola y, si hay hueco, lanza la máquina; el resultado llega solo (asíncrono).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!rpaActivo(process.env)) {
    return NextResponse.json({ estado: 'apagado', mensaje: 'el tarificador RPA está apagado (TARIFICADOR_RPA_ACTIVO)' }, { status: 503 })
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ estado: 'error', mensaje: 'cuerpo JSON requerido' }, { status: 400 })
  const oportunidadId = uuidONull(body.oportunidadId)
  const clienteId = uuidONull(body.clienteId)
  const polizaId = uuidONull(body.polizaId)
  if (oportunidadId === false || clienteId === false || polizaId === false) {
    return NextResponse.json({ estado: 'error', mensaje: 'oportunidadId/clienteId/polizaId tienen que ser uuid' }, { status: 400 })
  }
  const compania = typeof body.compania === 'string' ? body.compania.trim() : ''
  if (!compania) return NextResponse.json({ estado: 'error', mensaje: 'falta compania' }, { status: 400 })
  if (body.ramo !== 'comunidades') return NextResponse.json({ estado: 'error', mensaje: 'ramo no soportado por el tarificador RPA (solo comunidades)' }, { status: 400 })
  const v = validarRiesgoComunidad(body.riesgo)
  if (!v.ok) return NextResponse.json({ estado: 'error', mensaje: 'riesgo inválido', errores: v.errores }, { status: 400 })

  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  const solicitadoPor = actor.tipo === 'desconocido' ? `desconocido:${actor.motivo}` : `${actor.tipo}:${actor.id}`

  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await encolarTrabajo({
      correduriaId: correduria.id, oportunidadId, clienteId, polizaId, compania, ramo: 'comunidades', riesgo: v.riesgo, solicitadoPor,
    })
    if (r.estado === 'rechazado') return NextResponse.json({ estado: 'rechazado', motivo: r.motivo }, { status: r.status })
    // Lanzar es mejor esfuerzo: si Fly falla, el trabajo queda marcado y el barrido lo reintenta UNA vez.
    const lanzado = await lanzarPendientes(correduria.id, compania).catch((e: unknown) => ({
      lanzados: [] as string[], fallidos: [], omitido: `error_lanzando: ${e instanceof Error ? e.message : String(e)}`,
    }))
    return NextResponse.json({ estado: 'encolado', trabajoId: r.trabajoId, lanzado: lanzado.lanzados.includes(r.trabajoId), detalle: lanzado.omitido ?? null }, { status: 202 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/encolar', e) }, { status: 503 })
  }
})
