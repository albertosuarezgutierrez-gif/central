import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { hayPilotaje } from '@/lib/esquema-bd'
import { lanzarPendientes } from '@/lib/tarificador'
import { rpaActivo } from '@/lib/tarificador-reglas'
import { exploradorActivo } from '@/lib/tarificador-explorador-reglas'
import { leerPeticionEncolarPilotaje } from '@/lib/tarificador-pilotaje-reglas'
import { encolarPilotaje } from '@/lib/tarificador-pilotaje'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/operador/tarificador/pilotaje` `{ entrada }` — encola una sesión del MODO PILOTADO (03/11/2026): SIEMPRE sintética
 * (sin cliente, riesgo `{}`). El worker hace login + la entrada cerrada del explorador y luego espera comandos pantalla a pantalla
 * (`GET/POST /api/operador/tarificador/pilotaje/[id]`, o por SQL en `seguros.tarificador_pilotaje_pasos`). Cerrojos: Bearer de
 * operador · `TARIFICADOR_RPA_ACTIVO=1` · `TARIFICADOR_EXPLORADOR_ACTIVO=1` · esquema aplicado · entrada de la lista cerrada (sin
 * login asistido) · integración activa y `rpa_autorizada` · un pilotaje vivo por compañía. TARIFICAR ≠ EMITIR.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!rpaActivo(process.env)) return NextResponse.json({ estado: 'apagado', mensaje: 'el tarificador RPA está apagado (TARIFICADOR_RPA_ACTIVO)' }, { status: 503 })
  if (!exploradorActivo(process.env)) return NextResponse.json({ estado: 'apagado', mensaje: 'el explorador está apagado (TARIFICADOR_EXPLORADOR_ACTIVO)' }, { status: 503 })
  const l = leerPeticionEncolarPilotaje(await req.json().catch(() => null))
  if (!l.ok) return NextResponse.json({ estado: 'error', errores: l.errores }, { status: 400 })
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  const solicitadoPor = actor.tipo === 'desconocido' ? `desconocido:${actor.motivo}` : `${actor.tipo}:${actor.id}`
  try {
    if (!(await hayPilotaje())) return NextResponse.json({ estado: 'error', mensaje: 'pilotaje_sin_esquema (aplicar 2026-11-03c_tarificador_pilotaje.sql)' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await encolarPilotaje({ correduriaId: correduria.id, entrada: l.entrada, solicitadoPor })
    if (r.estado === 'rechazado') return NextResponse.json({ estado: 'rechazado', motivo: r.motivo }, { status: r.status })
    const lanzado = await lanzarPendientes(correduria.id, r.compania).catch((e: unknown) => ({
      lanzados: [] as string[], fallidos: [], omitido: `error_lanzando: ${e instanceof Error ? e.message : String(e)}`,
    }))
    return NextResponse.json({ estado: 'encolado', trabajoId: r.trabajoId, lanzado: lanzado.lanzados.includes(r.trabajoId), detalle: lanzado.omitido ?? null }, { status: 202 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/pilotaje', e) }, { status: 503 })
  }
})
