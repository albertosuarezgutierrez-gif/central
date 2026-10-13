import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { hayExplorador } from '@/lib/esquema-bd'
import { lanzarPendientes } from '@/lib/tarificador'
import { encolarExploracion } from '@/lib/tarificador-explorador'
import { rpaActivo } from '@/lib/tarificador-reglas'
import { exploradorActivo, leerPeticionEncolarExploracion } from '@/lib/tarificador-explorador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/operador/tarificador/exploracion` — encola una EXPLORACIÓN IA del tarificador RPA (13/10/2026). Body:
 * `{ entrada: 'allianz:particulares:hogar', trabajoOrigenId? | oportunidadId? }` (anclas EXCLUYENTES; las dos → 400).
 * Sin ancla = SINTÉTICA (sin cliente: todo lo personal es de prueba y, si el portal pide NIF, para). Con ancla = datos REALES:
 *  · `trabajoOrigenId`: un trabajo `tarificar` de esta correduría, con cliente y del mismo ramo (se copian su cliente y su riesgo).
 *  · `oportunidadId` (vía «c», 13/10/2026): una oportunidad de HOGAR de esta correduría. Riesgo = ficha de SU cliente
 *    (NIF, nombre, apellidos, nacimiento dd/mm/aaaa; descifrada aquí, nunca en el cuerpo) + `info_riesgo.datosVivienda`.
 *    USO (`datosVivienda.ocupacion`) y RÉGIMEN (`datosVivienda.uso`) obligatorios y explícitos: sin ellos, 409
 *    `oportunidad_incompleta` (nunca un valor por defecto). Año y m² que falten se OMITEN: el portal los autocompleta
 *    del Catastro. Tomador distinto del cliente o empresa → 409.
 * En los dos casos el trigger de la BD (`tarificacion_exploracion_ancla_valida`) re-exige el mismo cliente y correduría, y
 * con datos reales el worker NUNCA pone un valor de prueba en una clave del riesgo que falte.
 *
 * Cerrojos (todos fail-closed): Bearer de operador · `TARIFICADOR_RPA_ACTIVO=1` · `TARIFICADOR_EXPLORADOR_ACTIVO=1` (APAGADO
 * por defecto) · esquema aplicado · entrada de la lista cerrada · fila de `companias_integracion` de esa compañía/ramo activa
 * y `rpa_autorizada` · una exploración viva por compañía. Nunca emite: el worker para en SMS/OTP/CAPTCHA/emisión.
 * Encola y, si hay hueco, lanza la máquina (`lanzarPendientes`); el mapa sale en `seguros.tarificador_exploraciones`.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!rpaActivo(process.env)) return NextResponse.json({ estado: 'apagado', mensaje: 'el tarificador RPA está apagado (TARIFICADOR_RPA_ACTIVO)' }, { status: 503 })
  if (!exploradorActivo(process.env)) return NextResponse.json({ estado: 'apagado', mensaje: 'el explorador IA está apagado (TARIFICADOR_EXPLORADOR_ACTIVO)' }, { status: 503 })
  const l = leerPeticionEncolarExploracion(await req.json().catch(() => null))
  if (!l.ok) return NextResponse.json({ estado: 'error', errores: l.errores }, { status: 400 })

  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  const solicitadoPor = actor.tipo === 'desconocido' ? `desconocido:${actor.motivo}` : `${actor.tipo}:${actor.id}`
  try {
    if (!(await hayExplorador())) return NextResponse.json({ estado: 'error', mensaje: 'explorador_sin_esquema (aplicar 2026-10-13_tarificador_explorador.sql)' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await encolarExploracion({ correduriaId: correduria.id, entrada: l.p.entrada, trabajoOrigenId: l.p.trabajoOrigenId, oportunidadId: l.p.oportunidadId, solicitadoPor })
    if (r.estado === 'rechazado') return NextResponse.json({ estado: 'rechazado', motivo: r.motivo }, { status: r.status })
    const lanzado = await lanzarPendientes(correduria.id, r.compania).catch((e: unknown) => ({
      lanzados: [] as string[], fallidos: [], omitido: `error_lanzando: ${e instanceof Error ? e.message : String(e)}`,
    }))
    return NextResponse.json({
      estado: 'encolado', trabajoId: r.trabajoId, exploracionId: r.exploracionId, conDatosReales: r.conDatosReales,
      lanzado: lanzado.lanzados.includes(r.trabajoId), detalle: lanzado.omitido ?? null,
    }, { status: 202 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/exploracion', e) }, { status: 503 })
  }
})
