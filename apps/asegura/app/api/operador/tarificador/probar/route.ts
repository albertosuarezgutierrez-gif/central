import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { encolarTrabajo, lanzarPendientes, leerCompaniaActualUnicaCliente, leerOrigenesVehiculoCliente } from '@/lib/tarificador'
import { leerRiesgoParaReencolar } from '@/lib/tarificador-lectura'
import { riesgoParaReencolar } from '@/lib/tarificador-lectura-reglas'
import { riesgoDesdeOportunidadDelCliente } from '@/lib/tarificacion-lead'
import { conCompaniaActualUnica, conVehiculoDeOrigen, decidirRiesgoProbar } from '@/lib/tarificador-relanzar-reglas'
import { necesitaCompaniaActual } from '@/lib/tarificador-compania-actual'
import { necesitaVehiculoEncadenado } from '@/lib/tarificador-espera-vehiculo'
import { rpaActivo, validarEntradaRamo } from '@/lib/tarificador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `POST /api/operador/tarificador/probar { clienteId, compania, ramo }` — «Probar tarificación» de la ficha: reencola el
 * RIESGO DEL ÚLTIMO TRABAJO de ese cliente+compañía+ramo (se copia en servidor: el riesgo no sale de asegura). Mismos
 * cerrojos que `encolar` (Bearer · `TARIFICADOR_RPA_ACTIVO` · integración `rpa_autorizada` activa · riesgo revalidado).
 * Con el riesgo del último trabajo ya purgado, se reconstruye de la oportunidad del cliente + ficha (`riesgoDesdeOportunidadDelCliente`);
 * si aun así falta algo → 422 `riesgo_incompleto` con las etiquetas de campo; sin nada → 409 `sin_riesgo_previo`/`origen_purgado` (no inventa datos). TARIFICAR ≠ EMITIR: solo precio.
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
    const leido = await leerRiesgoParaReencolar(correduria.id, clienteId, compania, ramo)
    // Purga (13/10/2026): el riesgo del trabajo cerrado ya no lleva matrícula ni conductor. Como el botón de plataforma, el
    // riesgo se arma de la oportunidad del cliente + su ficha; el del último trabajo solo es respaldo si aún está completo.
    const reconstruida = await riesgoDesdeOportunidadDelCliente(correduria.id, clienteId, ramo)
    // Compañía actual (Allianz/Mapfre auto con cambio de seguro): si falta, de la póliza de auto en vigor de la cartera SOLO si es
    // una (cero o varias → sigue faltando y sale 422). Nunca pisa lo que ya trae; la purga no se toca.
    const conCompania = reconstruida.riesgo !== null && necesitaCompaniaActual(compania, ramo, reconstruida.riesgo)
      ? conCompaniaActualUnica(reconstruida, compania, ramo, await leerCompaniaActualUnicaCliente(correduria.id, clienteId))
      : reconstruida
    // Generali auto no busca por matrícula: su vehículo sale del último `ok` de Allianz/Mapfre del cliente (solo claves de catálogo).
    // Sin ninguno sigue el 422 `generali_sin_vehiculo` del encolado.
    const reconstruccion = conCompania.riesgo !== null && necesitaVehiculoEncadenado(compania, ramo)
      ? conVehiculoDeOrigen(conCompania, compania, ramo, await leerOrigenesVehiculoCliente(correduria.id, clienteId))
      : conCompania
    const previo = leido.riesgo === null ? null : riesgoParaReencolar(leido.riesgo)
    const d = decidirRiesgoProbar({ reconstruccion, previo, soloPurgados: leido.soloPurgados, validar: (riesgo) => validarEntradaRamo(ramo, riesgo, compania) })
    if (!d.ok) return NextResponse.json({ estado: 'rechazado', motivo: d.motivo, ...(d.errores ? { errores: d.errores } : {}) }, { status: d.status })
    const valida = d
    const r = await encolarTrabajo({ correduriaId: correduria.id, oportunidadId: null, clienteId, polizaId: null, compania, ...valida.entrada, solicitadoPor })
    if (r.estado === 'rechazado') return NextResponse.json({ estado: 'rechazado', motivo: r.motivo }, { status: r.status })
    const lanzado = await lanzarPendientes(correduria.id, compania).catch((e: unknown) => ({
      lanzados: [] as string[], fallidos: [], omitido: `error_lanzando: ${e instanceof Error ? e.message : String(e)}`,
    }))
    return NextResponse.json({ estado: 'encolado', trabajoId: r.trabajoId, duplicado: r.duplicado, estadoPrevio: r.estadoPrevio ?? null, mensaje: r.mensaje ?? null, lanzado: lanzado.lanzados.includes(r.trabajoId), detalle: lanzado.omitido ?? null }, { status: 202 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/probar', e) }, { status: 503 })
  }
})
