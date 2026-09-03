import { NextResponse } from 'next/server'

import { autorizacionesDeIdentidad, conceder, type ErrorConceder } from '@/lib/autorizaciones'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * Las autorizaciones de la persona que tiene la sesión: las que ha concedido
 * (con el registro de quién ha entrado a mirar), las que le han concedido a ella
 * y a quién más podría autorizar.
 *
 * Las reglas viven en `@central/module-seguros-portal/autorizacion` y la BD en
 * `lib/autorizaciones.ts`. Esta ruta no decide nada: resuelve la identidad,
 * llama y traduce errores a códigos HTTP.
 */

/** Un uuid mal formado revienta dentro de Prisma con un 500 en vez de contestar qué falta. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** El código HTTP de cada motivo. Un mapa, no una cadena de `if`: el que añada un motivo nuevo lo ve. */
const ESTADO_HTTP: Record<ErrorConceder, number> = {
  datos_invalidos: 400,
  // 400 y no 403: no es «no puedes», es «ese permiso no se concede desde esta
  // ficha» — y la respuesta lleva `mensaje` con la razón, que desde el
  // 03/09/2026 depende de si quien cede es una persona o una sociedad.
  alcance_no_disponible: 400,
  // Falta un dato de la petición (con qué título se representa a la sociedad),
  // así que 400: la misma persona con el mismo alcance SÍ puede, diciéndolo.
  titulo_requerido: 400,
  ficha_no_tuya: 403,
  nivel_insuficiente: 403,
  sin_relacion: 409,
  ya_concedida: 409,
}

/**
 * Las cabeceras de procedencia, para poder demostrar el consentimiento (art.
 * 7.1 RGPD). `null` cuando no vienen: **no se inventa una IP**.
 *
 * 🚨 `x-forwarded-for` es una LISTA (`cliente, proxy1, proxy2`) y la columna es
 * `inet`: meterla entera revienta el INSERT con un 22P02 y tumba la concesión
 * entera. Se coge el primer salto y, si no tiene forma de IP, se guarda `null`
 * — un valor de cajón en una columna de auditoría es peor que el hueco.
 */
function ipDe(req: Request): string | null {
  const cabecera = req.headers.get('x-forwarded-for')
  if (!cabecera) return null
  const primera = cabecera.split(',')[0]?.trim() ?? ''
  if (primera === '') return null
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/
  const ipv6 = /^[0-9a-f:]+$/i
  return ipv4.test(primera) || (primera.includes(':') && ipv6.test(primera)) ? primera : null
}

function userAgentDe(req: Request): string | null {
  const ua = req.headers.get('user-agent')?.trim()
  return ua ? ua.slice(0, 500) : null
}

export async function GET() {
  // La identidad SIEMPRE sale de la cookie, nunca de un query param.
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  // Sin `try/catch`: si la BD falla, que salga 500. Un `{ otorgadas: [] }` de
  // consuelo le diría a alguien que no ha autorizado a nadie cuando puede que
  // sí — y sobre eso decide si revoca.
  const datos = await autorizacionesDeIdentidad(identidad.id)

  // Las fechas salen en ISO por `Date.toJSON()`: no se reformatean aquí para
  // que la pantalla y esta ruta no puedan discrepar del mismo instante.
  return NextResponse.json(datos)
}

/**
 * José concede: «que María pueda ver los seguros de esta ficha mía». Nace
 * PENDIENTE de que ella acepte.
 *
 * Si la ficha que cede es una SOCIEDAD, lo que se concede puede ser además
 * representación (`partes`, `documentos`) y entonces el cuerpo trae
 * `tituloRepresentacion`. Quién puede qué NO se decide aquí: lo decide
 * `conceder()` leyendo el tipo de persona de la ficha, porque el tipo está en la
 * BD y el cuerpo de una petición no es una fuente de verdad sobre él.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  }

  // `null` y `3` son JSON válidos: sin esta guarda el acceso a las propiedades
  // revienta con un 500 en vez de decir qué falta.
  const c = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>
  const otorganteClienteId = typeof c.otorganteClienteId === 'string' ? c.otorganteClienteId : ''
  const autorizadoClienteId = typeof c.autorizadoClienteId === 'string' ? c.autorizadoClienteId : ''
  const alcance = typeof c.alcance === 'string' ? c.alcance : ''
  if (!UUID.test(otorganteClienteId) || !UUID.test(autorizadoClienteId) || alcance === '') {
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  }

  // 🚨 Los dos `clienteId` llegan en el cuerpo y no los firma nadie: quien
  // comprueba que la ficha otorgante es de esta identidad es `conceder()`,
  // contra `portal_vinculo`. Esta ruta solo comprueba la FORMA.
  const r = await conceder({
    identidadId: identidad.id,
    otorganteClienteId,
    autorizadoClienteId,
    alcance,
    // Sin validar aquí: el vocabulario lo fija el módulo puro y quien decide si
    // hace falta —y si la ficha es siquiera una sociedad— es `conceder`. Esta
    // ruta solo comprueba la FORMA, y la forma de un título es «una cadena».
    tituloRepresentacion: c.tituloRepresentacion,
    ip: ipDe(req),
    userAgent: userAgentDe(req),
  })

  if (!r.ok) {
    // El `mensaje` viaja siempre: un `alcance_no_disponible` sin su razón es
    // exactamente el silencio que el módulo puro existe para evitar.
    return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: ESTADO_HTTP[r.error] })
  }

  return NextResponse.json({ id: r.id, estado: r.estado, caducaEn: r.caducaEn }, { status: 201 })
}
