import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { riesgoHogarSinTomador } from '@/lib/tarificador-hogar-formulario'
import { fichaAsegura } from '@/lib/ficha-asegura'
import { encolarTarificacionComunidad, encolarTarificacionHogar, encolarTarificacionVehiculo, leerIntegracionesTarificador } from '@/lib/tarificador-asegura'
import { poblacionDesdeFicha } from '@/lib/tarificador-asegura-reglas'
import { CAMPOS_DE_FICHA, claveDeCompania, completarRiesgoVehiculoDesdeFicha, mensajeFaltanDeFicha, type CampoDeFicha } from '@/lib/tarificador-moto-formulario'
import { leerIntegraciones } from '@/lib/tarificador-probar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/correduria/tarificador/encolar { clienteId, oportunidadId?, riesgo } — pide «Precio Allianz
 * (bot)» de una comunidad; con `ramo: 'moto'` el `riesgo` es el FormularioAuto de una moto (13/10/2026). Solo un PRECIO: no emite ni contrata. La compañía y el ramo los fija el
 * servidor; el riesgo lo valida asegura. Reenvía el estado y el JSON de asegura tal cual.
 *
 * Moto (13/10/2026): si el riesgo no trae `poblacion`, se rellena con la población del domicilio de la ficha del cliente,
 * solo si su CP es el del riesgo (`poblacionDesdeFicha`). Mejor esfuerzo: si la ficha no se lee, se encola sin ella (el bot
 * pedirá a una persona si el CP tiene varias). El valor no se registra.
 *
 * `compania` (opcional, 13/10/2026, «Precio por bot» del cotizador de moto): clave de la compañía cuyo bot se usa. Sin ella,
 * Allianz como siempre. Con ella, SOLO si `(compania, ramo)` está entre las integraciones activas que devuelve asegura
 * (`/integraciones`); si esa lista no se puede leer, se corta (fail-closed). asegura vuelve a comprobarla (`rpa_autorizada`).
 * `completarDesdeFicha` (opcional, moto o auto): lista de datos que el navegador no tiene (`codigoPostal`, `fechaNacimiento`,
 * `fechaCarne`) y que el servidor lee de la ficha; si la ficha no los tiene, 422 sin encolar ni gastar nada.
 *
 * Hogar (19/10/2026): `ramo: 'hogar'` con el formulario de la vivienda sin tomador (solo Allianz; asegura lo rechaza en otras compañías).
 *
 * Auto (coche, 14/10/2026, Mapfre NSEI): exactamente el patrón de moto (`ramo: 'auto'`, FormularioAuto de coche; carné B de
 * la ficha). El NIF del tomador no viaja: lo pone asegura desde la ficha al entregar el trabajo.
 */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ estado: 'error', mensaje: 'cuerpo JSON requerido' }, { status: 400 })
  const clienteId = typeof b.clienteId === 'string' ? b.clienteId.trim() : ''
  const oportunidadId = b.oportunidadId == null || b.oportunidadId === '' ? null : typeof b.oportunidadId === 'string' ? b.oportunidadId.trim() : false
  if (!UUID.test(clienteId) || oportunidadId === false || (oportunidadId !== null && !UUID.test(oportunidadId))) {
    return NextResponse.json({ estado: 'error', mensaje: 'clienteId/oportunidadId tienen que ser uuid' }, { status: 400 })
  }
  if (!b.riesgo || typeof b.riesgo !== 'object' || Array.isArray(b.riesgo)) {
    return NextResponse.json({ estado: 'error', mensaje: 'falta el riesgo' }, { status: 400 })
  }
  if (b.ramo !== undefined && b.ramo !== 'comunidades' && b.ramo !== 'moto' && b.ramo !== 'auto' && b.ramo !== 'hogar') {
    return NextResponse.json({ estado: 'error', mensaje: 'ramo no soportado (comunidades, moto, auto u hogar)' }, { status: 400 })
  }
  const ramo = b.ramo === 'moto' || b.ramo === 'auto' || b.ramo === 'hogar' ? b.ramo : 'comunidades'
  const vehiculo = ramo === 'moto' || ramo === 'auto' ? ramo : null
  let compania: string | undefined
  if (b.compania !== undefined && b.compania !== null && b.compania !== '') {
    const c = claveDeCompania(b.compania)
    if (!c) return NextResponse.json({ estado: 'error', mensaje: 'compania no válida' }, { status: 400 })
    const ints = await leerIntegracionesTarificador()
    const l = leerIntegraciones(ints.status, ints.json)
    if (!l.ok) return NextResponse.json({ estado: 'error', mensaje: `No se pudo comprobar qué compañías tienen bot: ${l.mensaje}` }, { status: 502 })
    if (!l.integraciones.some((i) => i.compania === c && i.ramo === ramo)) {
      return NextResponse.json({ estado: 'error', mensaje: 'Esa compañía no tiene el bot activo para este ramo.' }, { status: 409 })
    }
    compania = c
  }
  let pedidos: CampoDeFicha[] = []
  if (b.completarDesdeFicha !== undefined) {
    const lista = b.completarDesdeFicha
    if (vehiculo === null || !Array.isArray(lista) || !lista.every((x) => (CAMPOS_DE_FICHA as readonly unknown[]).includes(x))) {
      return NextResponse.json({ estado: 'error', mensaje: 'completarDesdeFicha solo vale en moto o auto y con codigoPostal, fechaNacimiento o fechaCarne' }, { status: 400 })
    }
    pedidos = lista as CampoDeFicha[]
  }
  let riesgo = b.riesgo as Record<string, unknown>
  // La ficha se lee UNA vez (completar el riesgo y/o la población). `undefined` = aún no leída.
  let fichaLeida: Awaited<ReturnType<typeof fichaAsegura>> | null | undefined
  if (vehiculo !== null && pedidos.length > 0) {
    fichaLeida = await fichaAsegura(clienteId).catch(() => null)
    if (fichaLeida?.estado !== 'ok') return NextResponse.json({ estado: 'error', mensaje: 'No se pudo leer la ficha del cliente para completar el riesgo: vuelve a intentarlo.' }, { status: 502 })
    const c = completarRiesgoVehiculoDesdeFicha(vehiculo, riesgo, fichaLeida.ficha, pedidos)
    if (c.faltan.length) return NextResponse.json({ estado: 'error', mensaje: mensajeFaltanDeFicha(c.faltan, vehiculo), faltan: c.faltan }, { status: 422 })
    riesgo = c.riesgo
  }
  // Población: solo moto (Allianz Moto la pide por CP). El coche (Mapfre NSEI) no la usa: no se rellena.
  if (b.ramo === 'moto' && !(typeof riesgo.poblacion === 'string' && riesgo.poblacion.trim())) {
    const f = fichaLeida !== undefined ? fichaLeida : await fichaAsegura(clienteId).catch(() => null)
    const poblacion = f?.estado === 'ok' ? poblacionDesdeFicha(riesgo, f.ficha.contacto) : null
    if (poblacion) riesgo = { ...riesgo, poblacion }
  }
  // Hogar (19/10/2026, Allianz): el riesgo es el formulario de la vivienda SIN tomador. El DNI/NIE y el nacimiento del tomador
  // NO pasan por aquí: asegura los lee de la ficha, los comprueba al encolar y los inyecta al entregar el trabajo al bot.
  const r = ramo === 'hogar'
    ? await encolarTarificacionHogar(clienteId, oportunidadId, riesgoHogarSinTomador(riesgo), compania)
    : vehiculo !== null
    ? await encolarTarificacionVehiculo(vehiculo, clienteId, oportunidadId, riesgo, compania)
    : await encolarTarificacionComunidad(clienteId, oportunidadId, b.riesgo as Record<string, unknown>, compania)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
