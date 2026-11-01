import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { anotarCambio, auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { encolarTrabajo, lanzarPendientes, leerCompaniaActualUnicaCliente, leerOrigenesVehiculoCliente } from '@/lib/tarificador'
import { leerRiesgoParaReencolar } from '@/lib/tarificador-lectura'
import { riesgoParaReencolar } from '@/lib/tarificador-lectura-reglas'
import { leerVehiculoPolizaVinculadaCliente, riesgoDesdeOportunidadDelCliente, riesgoHogarDePolizasDelCliente } from '@/lib/tarificacion-lead'
import { abrirRiesgoDePoliza } from '@/lib/oportunidad-riesgo'
import { elegirReconstruccionHogar } from '@/lib/tarificador-hogar-poliza'
import { conCompaniaActualUnica, conVehiculoDeOrigen, conVehiculoDePoliza, decidirRiesgoProbar } from '@/lib/tarificador-relanzar-reglas'
import { necesitaCompaniaActual } from '@/lib/tarificador-compania-actual'
import { necesitaVehiculoEncadenado, tieneVehiculo } from '@/lib/tarificador-espera-vehiculo'
import { rpaActivo, validarEntradaRamo } from '@/lib/tarificador-reglas'
import { hayImagenTrabajo } from '@/lib/esquema-bd'
import { leerFilaImagen } from '@/lib/tarificador-imagen'
import { decidirPermisoPrueba, validarImagenPrueba } from '@/lib/tarificador-imagen-reglas'

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
 *
 * `imagen` (opcional, 27/10/2026): imagen de RAMA (`registry.fly.io/asegura-tarificador:rama-<sha7>`) para lanzar SOLO este
 * trabajo con ella. Solo con el interruptor `permitir_imagen_prueba` de `seguros.tarificador_imagen` encendido (si no → 403);
 * nunca `main-*` (producción) ni otra forma (400). Se registra en `imagen_prueba` del trabajo; con un duplicado vivo → 409.
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
  // Imagen de PRUEBA: se valida y se exige el interruptor ANTES de leer el riesgo o encolar nada.
  let imagenPrueba: string | null = null
  if (body.imagen !== undefined && body.imagen !== null && body.imagen !== '') {
    const v = validarImagenPrueba(body.imagen)
    if (!v.ok) return NextResponse.json({ estado: 'error', mensaje: v.motivo }, { status: 400 })
    const permiso = (await hayImagenTrabajo())
      ? decidirPermisoPrueba(await leerFilaImagen())
      : { ok: false as const, status: 403 as const, motivo: 'imagen_prueba_no_permitida: falta el SQL 2026-10-27_tarificador_imagen (columna imagen_prueba)' }
    if (!permiso.ok) return NextResponse.json({ estado: 'prohibido', motivo: permiso.motivo }, { status: permiso.status })
    imagenPrueba = v.imagen
  }
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  const solicitadoPor = actor.tipo === 'desconocido' ? `desconocido:${actor.motivo}` : `${actor.tipo}:${actor.id}`
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const leido = await leerRiesgoParaReencolar(correduria.id, clienteId, compania, ramo)
    // Purga (13/10/2026): el riesgo del trabajo cerrado ya no lleva matrícula ni conductor. Como el botón de plataforma, el
    // riesgo se arma de la oportunidad del cliente + su ficha; el del último trabajo solo es respaldo si aún está completo.
    const deOportunidad = await riesgoDesdeOportunidadDelCliente(correduria.id, clienteId, ramo)
    // Hogar sin riesgo previo utilizable (01/11/2026): se construye de la póliza de hogar EN VIGOR más reciente del cliente (mismo mapeo que
    // la precarga del PATCH de riesgo). Lo que aun así falte → 422 `riesgo_incompleto` con etiquetas; datos deducidos → `supuestos` (precio estimado).
    const dePoliza = ramo === 'hogar' && deOportunidad.riesgo === null ? await riesgoHogarDePolizasDelCliente(correduria.id, clienteId) : null
    const { reconstruccion: reconstruida, usaPoliza } = elegirReconstruccionHogar(deOportunidad, dePoliza)
    // Compañía actual (Allianz/Mapfre/Generali auto con cambio de seguro): si falta, de la póliza de auto en vigor de la cartera SOLO si es
    // una (cero o varias → sigue faltando y sale 422). Nunca pisa lo que ya trae; la purga no se toca.
    const conCompania = reconstruida.riesgo !== null && necesitaCompaniaActual(compania, ramo, reconstruida.riesgo)
      ? conCompaniaActualUnica(reconstruida, compania, ramo, await leerCompaniaActualUnicaCliente(correduria.id, clienteId))
      : reconstruida
    // Generali auto no busca por matrícula: su vehículo sale del último `ok` de Allianz/Mapfre del cliente (solo claves de catálogo).
    // Sin ninguno, marca/modelo/versión de la póliza VIVA vinculada a la oportunidad (31/10/2026); sin eso sigue el 422 `generali_sin_vehiculo`.
    const conOrigen = conCompania.riesgo !== null && necesitaVehiculoEncadenado(compania, ramo)
      ? conVehiculoDeOrigen(conCompania, compania, ramo, await leerOrigenesVehiculoCliente(correduria.id, clienteId))
      : conCompania
    const reconstruccion = conOrigen.riesgo !== null && necesitaVehiculoEncadenado(compania, ramo) && !tieneVehiculo(conOrigen.riesgo)
      ? conVehiculoDePoliza(conOrigen, compania, ramo, await leerVehiculoPolizaVinculadaCliente(correduria.id, clienteId, ramo))
      : conOrigen
    const previo = leido.riesgo === null ? null : riesgoParaReencolar(leido.riesgo)
    const d = decidirRiesgoProbar({ reconstruccion, previo, soloPurgados: leido.soloPurgados, validar: (riesgo) => validarEntradaRamo(ramo, riesgo, compania) })
    const avisos = usaPoliza && dePoliza ? dePoliza.avisos : []
    if (!d.ok) return NextResponse.json({ estado: 'rechazado', motivo: d.motivo, ...(d.errores ? { errores: d.errores } : {}), ...(avisos.length ? { avisos } : {}) }, { status: d.status })
    const valida = d
    // El riesgo salió de la póliza: se abre (o se reutiliza) la oportunidad de ESA póliza y el trabajo cuelga de ella. Mejor esfuerzo: si falla, se encola sin vincular.
    const desdePoliza = usaPoliza && dePoliza?.polizaId && valida.origen === 'oportunidad'
    const vinculo = desdePoliza ? await abrirRiesgoDePoliza(correduria.id, { polizaId: dePoliza.polizaId as string, actor: solicitadoPor }).catch(() => null) : null
    const oportunidadId = vinculo && vinculo.ok ? vinculo.oportunidadId : null
    const r = await encolarTrabajo({ correduriaId: correduria.id, oportunidadId, clienteId, polizaId: null, compania, ...valida.entrada, solicitadoPor, imagenPrueba })
    if (r.estado === 'rechazado') return NextResponse.json({ estado: 'rechazado', motivo: r.motivo }, { status: r.status })
    if (imagenPrueba) anotarCambio({ entidad: 'trabajo_tarificador', id: r.trabajoId, campo: 'imagen_prueba', antes: null, despues: imagenPrueba })
    const lanzado = await lanzarPendientes(correduria.id, compania).catch((e: unknown) => ({
      lanzados: [] as string[], fallidos: [], omitido: `error_lanzando: ${e instanceof Error ? e.message : String(e)}`,
    }))
    return NextResponse.json({ estado: 'encolado', trabajoId: r.trabajoId, duplicado: r.duplicado, estadoPrevio: r.estadoPrevio ?? null, mensaje: r.mensaje ?? null, lanzado: lanzado.lanzados.includes(r.trabajoId), detalle: lanzado.omitido ?? lanzado.fallidos.find((f) => f.id === r.trabajoId)?.motivo ?? null, imagenPrueba, ...(desdePoliza ? { origenRiesgo: 'poliza', oportunidadId, supuestos: dePoliza?.supuestos ?? [], ...(avisos.length ? { avisos } : {}) } : {}) }, { status: 202 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/probar', e) }, { status: 503 })
  }
})
