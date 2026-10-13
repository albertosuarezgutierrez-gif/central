import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { encolarTrabajo, lanzarPendientes } from '@/lib/tarificador'
import { leerRiesgoParaReencolar } from '@/lib/tarificador-lectura'
import { riesgoParaReencolar } from '@/lib/tarificador-lectura-reglas'
import { rpaActivo, validarEntradaRamo } from '@/lib/tarificador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `POST /api/operador/tarificador/probar { clienteId, compania, ramo }` — «Probar tarificación» de la ficha: reencola el
 * RIESGO DEL ÚLTIMO TRABAJO de ese cliente+compañía+ramo (se copia en servidor: el riesgo no sale de asegura). Mismos
 * cerrojos que `encolar` (Bearer · `TARIFICADOR_RPA_ACTIVO` · integración `rpa_autorizada` activa · riesgo revalidado).
 * Sin trabajo previo → 409 `sin_riesgo_previo` (esta ruta no inventa datos). TARIFICAR ≠ EMITIR: solo precio.
 * 202 `{ estado:'encolado', trabajoId }`.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!rpaActivo(process.env)) return NextResponse.json({ estado: 'apagado', mensaje: 'el tarificador RPA está apagado (TARIFICADOR_RPA_ACTIVO)' }, { status: 503 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ estado: 'error', mensaje: 'cuerpo JSON requerido' }, { status: 400 })
  const clienteId = typeof body.clienteId === 'string' ? body.clienteId.trim() : ''
  const compania = typeof body.compania === 'string' ? body.compania.trim().toLowerCase() : ''
  const ramo = typeof body.ramo === 'string' ? body.ramo.trim() : ''
  if (!UUID.test(clienteId) || !/^[a-z0-9_-]{1,40}$/.test(compania) || !/^[a-z0-9_-]{1,40}$/.test(ramo)) {
    return NextResponse.json({ estado: 'error', mensaje: 'clienteId (uuid), compania y ramo son obligatorios' }, { status: 400 })
  }
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  const solicitadoPor = actor.tipo === 'desconocido' ? `desconocido:${actor.motivo}` : `${actor.tipo}:${actor.id}`
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const previo = riesgoParaReencolar(await leerRiesgoParaReencolar(correduria.id, clienteId, compania, ramo))
    if (!previo) return NextResponse.json({ estado: 'rechazado', motivo: 'sin_riesgo_previo' }, { status: 409 })
    const valida = validarEntradaRamo(ramo, previo)
    if (!valida.ok) return NextResponse.json({ estado: 'rechazado', motivo: 'riesgo_previo_invalido', errores: valida.errores ?? [] }, { status: 422 })
    const r = await encolarTrabajo({ correduriaId: correduria.id, oportunidadId: null, clienteId, polizaId: null, compania, ...valida.entrada, solicitadoPor })
    if (r.estado === 'rechazado') return NextResponse.json({ estado: 'rechazado', motivo: r.motivo }, { status: r.status })
    const lanzado = await lanzarPendientes(correduria.id, compania).catch((e: unknown) => ({
      lanzados: [] as string[], fallidos: [], omitido: `error_lanzando: ${e instanceof Error ? e.message : String(e)}`,
    }))
    return NextResponse.json({ estado: 'encolado', trabajoId: r.trabajoId, duplicado: r.duplicado, lanzado: lanzado.lanzados.includes(r.trabajoId), detalle: lanzado.omitido ?? null }, { status: 202 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/probar', e) }, { status: 503 })
  }
})
