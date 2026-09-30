import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { CLAVES_DATOS_RIESGO } from '@central/module-seguros'
import { editarDatosRiesgo, leerRiesgo } from '@/lib/oportunidad-riesgo'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/oportunidad/riesgo?id=` — el riesgo entero para su pantalla (29/09/2026):
 * la oportunidad, sus figuras (con el vínculo y lo que les falta), los vínculos del cliente para
 * elegir y las variantes P1…Pn con su mejor precio, su presupuesto y lo que cambió entre ellas.
 * Sin DNI ni petición al vendor: solo nombres y diferencias.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error', motivo: 'falta id' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const r = await leerRiesgo(correduria.id, id)
    if (!r) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', ...r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('oportunidad/riesgo', e) }, { status: 500 })
  }
}

/**
 * `PATCH /api/operador/oportunidad/riesgo` (30/09/2026) — edita y/o CONFIRMA los datos del riesgo de una
 * oportunidad de CUALQUIER ramo, sin salir de su pantalla.
 *
 *   { correduriaId?, oportunidadId, <clave>: {…parcial…}, confirmar?: boolean, actor? }
 *
 * `<clave>` es EXACTAMENTE UNA de: `datosVehiculo` (auto, moto) · `datosVivienda` (hogar) · `datosCapital`
 * (vida, salud, decesos) · `datosComercio` (comercio) · `datosRiesgoLibre` (RC, comunidades, otros). Tiene que corresponder al tipo
 * de la oportunidad: si no, 400. Sin clave, o con dos, 400.
 *
 * - Se guarda en esa clave NUEVA de `info_riesgo`: el resto de claves se conservan y la `vehiculo` de texto no se
 *   pisa nunca. Una clave ausente = no se toca; `null`/`''` = borrar ese dato.
 * - `confirmar: true` sella `confirmadoAt`; cualquier edición sin confirmar lo borra.
 * - Nada de esto gasta dinero ni llama a Codeoscopic.
 * - La correduría es la única de asegura; si el cuerpo trae un `correduriaId` distinto, 403.
 *
 * Respuesta: `{ estado: 'ok', clave, datos, faltan, cambios }` y, para el vehículo, además `datosVehiculo` y
 * `faltanVehiculo` (compatibilidad con la pantalla de antes).
 */
export const PATCH = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const actor = typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim() : 'plataforma'
  const oportunidadId = typeof b.oportunidadId === 'string' ? b.oportunidadId.trim() : ''
  if (oportunidadId === '') return NextResponse.json({ estado: 'error', motivo: 'falta oportunidadId' }, { status: 400 })
  const claves = CLAVES_DATOS_RIESGO.filter((k) => b[k] !== undefined)
  if (claves.length !== 1) {
    return NextResponse.json({ estado: 'error', motivo: `hace falta exactamente una clave de datos (${CLAVES_DATOS_RIESGO.join(' | ')}), un objeto` }, { status: 400 })
  }
  const clave = claves[0]
  const datos = b[clave]
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) {
    return NextResponse.json({ estado: 'error', motivo: `falta ${clave} (un objeto)` }, { status: 400 })
  }
  if (b.confirmar !== undefined && typeof b.confirmar !== 'boolean') {
    return NextResponse.json({ estado: 'error', motivo: 'confirmar tiene que ser true o false' }, { status: 400 })
  }
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    if (b.correduriaId !== undefined && b.correduriaId !== correduria.id) {
      return NextResponse.json({ estado: 'error', motivo: 'correduriaId no es el de esta correduría' }, { status: 403 })
    }
    const r = await editarDatosRiesgo(correduria.id, { oportunidadId, clave, datos, confirmar: b.confirmar === true, actor })
    if (!r.ok) return NextResponse.json({ estado: 'error', motivo: r.motivo, errores: r.errores ?? null }, { status: r.status })
    return NextResponse.json({
      estado: 'ok', clave: r.clave, datos: r.datos, faltan: r.faltan, cambios: r.cambios,
      ...(r.clave === 'datosVehiculo' ? { datosVehiculo: r.datos, faltanVehiculo: r.faltan } : {}),
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('oportunidad/riesgo', e) }, { status: 500 })
  }
})
