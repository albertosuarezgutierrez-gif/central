import { NextResponse, after } from 'next/server'
import { esAccionBandeja } from '@central/module-tarificacion'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aplicarAccionBandeja } from '@/lib/tarificador-bandeja'
import { leerEleccionBandeja, leerEleccionPoblacionBandeja } from '@/lib/tarificador-bandeja-reglas'
import { lanzarPendientes } from '@/lib/tarificador'
import { presupuestoTrasTrabajoRpa } from '@/lib/presupuesto-rpa'
import { rpaActivo } from '@/lib/tarificador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `POST /api/operador/tarificador/bandeja/[id]` `{ accion: 'reintentar' | 'cancelar' }` — resuelve un trabajo de la
 * bandeja «Necesita tu atención». Reintentar lo devuelve a `pendiente` (intentos a 0) y lanza la máquina si hay hueco;
 * cancelar lo cierra. Solo desde los estados permitidos (409 si no); pedir el estado en el que ya está es 200
 * `sin_cambios` (idempotente). Reintentar exige `TARIFICADOR_RPA_ACTIVO=1` (503 si no); cancelar no. Un trabajo
 * abortado por el guard de emisión no se reintenta. TARIFICAR ≠ EMITIR: nada de esto contrata.
 *
 * `eleccionVersion?: { codigo, etiqueta? }` (solo con reintentar, 13/10/2026): la versión del vehículo elegida a mano.
 * Tiene que ser un código de la lista que guardó el fallo del trabajo (409 si no); se escribe en `riesgo.eleccionVersion`
 * bajo el mismo `for update` y el MISMO trabajo vuelve a `pendiente`.
 *
 * `eleccionPoblacion?: string` (solo con reintentar, 13/10/2026): la población del CP elegida a mano (texto exacto de la
 * lista `error.opcionesPoblacion` del trabajo; 409 si no está). La IA no elige poblaciones.
 */
export const POST = auditado(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const accion = body?.accion
  if (!esAccionBandeja(accion)) return NextResponse.json({ estado: 'error', mensaje: "accion tiene que ser 'reintentar' o 'cancelar'" }, { status: 400 })
  const ev = leerEleccionBandeja(body?.eleccionVersion)
  if (!ev.ok) return NextResponse.json({ estado: 'error', mensaje: ev.mensaje }, { status: 400 })
  if (ev.eleccion && accion !== 'reintentar') return NextResponse.json({ estado: 'error', mensaje: 'eleccionVersion solo va con reintentar' }, { status: 400 })
  const ep = leerEleccionPoblacionBandeja(body?.eleccionPoblacion)
  if (!ep.ok) return NextResponse.json({ estado: 'error', mensaje: ep.mensaje }, { status: 400 })
  if (ep.eleccion && accion !== 'reintentar') return NextResponse.json({ estado: 'error', mensaje: 'eleccionPoblacion solo va con reintentar' }, { status: 400 })
  if (accion === 'reintentar' && !rpaActivo(process.env)) {
    return NextResponse.json({ estado: 'apagado', mensaje: 'el tarificador RPA está apagado (TARIFICADOR_RPA_ACTIVO)' }, { status: 503 })
  }
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await aplicarAccionBandeja(correduria.id, id, accion, ev.eleccion, ep.eleccion)
    if (r.estado === 'no_encontrado') return NextResponse.json(r, { status: 404 })
    if (r.estado === 'conflicto') return NextResponse.json(r, { status: 409 })
    let lanzado = false
    let errorLanzando = null as string | null
    if (accion === 'reintentar' && r.estado === 'aplicado') {
      // Mejor esfuerzo, como al encolar: si Fly falla, el trabajo queda `pendiente` y el barrido lo lanza.
      // El fallo concreto (tipo + mensaje) se devuelve: `lanzado: false` sin motivo era «no se miró» leído como «no hizo falta».
      const l = await lanzarPendientes(correduria.id, r.compania).catch((e: unknown) => {
        errorLanzando = `${e instanceof Error ? e.name : 'Error'}: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`
        return null
      })
      lanzado = !!l?.lanzados.includes(id)
      if (!errorLanzando && l?.omitido) errorLanzando = l.omitido
    }
    // Vehículo de referencia (01/11/2026): la elección se propagó a otros trabajos de la oportunidad → su máquina, por compañía (mejor
    // esfuerzo: si falla, quedan `pendiente` y los lanza el barrido). Solo ids y compañías en la respuesta, nada del vehículo.
    const propagados = r.estado === 'aplicado' ? (r.propagados ?? []) : []
    for (const c of [...new Set(propagados.map((x) => x.compania))].filter((c) => r.estado === 'aplicado' && c !== r.compania)) {
      await lanzarPendientes(correduria.id, c).catch(() => null)
    }
    // Cancelar cierra un trabajo: si era el último abierto de la oportunidad, el borrador del presupuesto se prepara con los `ok`.
    if (accion === 'cancelar' && r.estado === 'aplicado') after(() => presupuestoTrasTrabajoRpa(id).then(() => undefined))
    const { estado, estadoTrabajo } = r
    return NextResponse.json({ estado, estadoTrabajo, lanzado, ...(errorLanzando ? { errorLanzando } : {}), ...(propagados.length ? { propagados: propagados.map((x) => ({ id: x.id, compania: x.compania })) } : {}) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/bandeja', e) }, { status: 503 })
  }
})
