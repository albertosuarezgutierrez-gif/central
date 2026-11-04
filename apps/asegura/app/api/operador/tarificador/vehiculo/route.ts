import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { hayVehiculoMatricula } from '@/lib/esquema-bd'
import { lanzarPendientes } from '@/lib/tarificador'
import { rpaActivo } from '@/lib/tarificador-reglas'
import { COMPANIA_VEHICULO, leerPeticionVehiculo, vehiculoActivo } from '@/lib/tarificador-vehiculo-reglas'
import { consultarOEncolarVehiculo } from '@/lib/tarificador-vehiculo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/operador/tarificador/vehiculo` `{ matricula, ramo?: 'auto' }` — marca/modelo/versión/1ª matriculación de una matrícula con
 * el bot RPA de Allianz (gratis) en vez de Avant2. Caché de 24 h → 200 `{ estado: 'cache', resultado }`; si no, encola un trabajo
 * `modo = 'vehiculo'` (sin cliente) → 202 `{ estado: 'encolado', trabajoId }` y se lee con `GET …/vehiculo/[id]`. Cerrojos: Bearer de
 * operador · `TARIFICADOR_RPA_ACTIVO=1` · `TARIFICADOR_VEHICULO_ACTIVO=1` · SQL 2026-11-04e aplicado · integración Allianz auto
 * `rpa_autorizada`. El worker se para en la pantalla del vehículo (TARIFICAR ≠ EMITIR). La matrícula no sale en errores ni logs.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!rpaActivo(process.env)) return NextResponse.json({ estado: 'apagado', mensaje: 'el tarificador RPA está apagado (TARIFICADOR_RPA_ACTIVO)' }, { status: 503 })
  if (!vehiculoActivo(process.env)) return NextResponse.json({ estado: 'apagado', mensaje: 'la consulta de vehículo está apagada (TARIFICADOR_VEHICULO_ACTIVO)' }, { status: 503 })
  const l = leerPeticionVehiculo(await req.json().catch(() => null))
  if (!l.ok) return NextResponse.json({ estado: 'error', errores: l.errores }, { status: 400 })
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  const solicitadoPor = actor.tipo === 'desconocido' ? `desconocido:${actor.motivo}` : `${actor.tipo}:${actor.id}`
  try {
    if (!(await hayVehiculoMatricula())) return NextResponse.json({ estado: 'error', mensaje: 'vehiculo_sin_esquema (aplicar 2026-11-04e_tarificador_vehiculo_matricula.sql)' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await consultarOEncolarVehiculo({ correduriaId: correduria.id, matricula: l.matricula, solicitadoPor })
    if (r.estado === 'rechazado') return NextResponse.json({ estado: 'rechazado', motivo: r.motivo }, { status: r.status })
    if (r.estado === 'cache') return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
    const lanzado = await lanzarPendientes(correduria.id, COMPANIA_VEHICULO).catch((e: unknown) => ({
      lanzados: [] as string[], fallidos: [], omitido: `error_lanzando: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}`,
    }))
    return NextResponse.json({ estado: 'encolado', trabajoId: r.trabajoId, duplicado: r.duplicado, lanzado: lanzado.lanzados.includes(r.trabajoId), detalle: lanzado.omitido ?? null }, { status: 202 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/vehiculo', e) }, { status: 503 })
  }
})
