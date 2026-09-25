// Un correo NUEVO en la ficha se prueba con un código a ESE correo (25/09/2026).
//
// 🚨 Por qué existe: el correo de la ficha es la LLAVE del portal — quien entra con él recibe la
// ficha entera con nivel `gestionar` (`lib/vinculo.ts`). Hasta hoy «Mis datos» y «Añadir correo»
// lo escribían sin comprobar nada, así que quien tuviera la sesión un rato (o un padre que puso el
// correo de su hijo, el caso Guzmán Pueyo/Lozano) dejaba la ficha abierta a otra persona de forma
// permanente. Ahora el correo no se guarda sin el código que le llega a él.
//
// El código va a `portal_codigo`, el mismo almacén que el del login, pero con un `valor_hash`
// PROPIO que mete la identidad dentro: así un código de cambio no abre sesión (el login busca por
// `hashCanal(correo)`), no lo puede canjear otra identidad, y su tope por destino no se mezcla con
// el del login. Misma pimienta, mismo hash del código y la misma reserva atómica del intento que
// `/api/acceso/verificar`.
import { MAX_INTENTOS, destinoValido, estadoCodigo, generarCodigo, type EstadoCodigo } from '@central/module-seguros-portal'

import { hashCanal, hashCodigo } from './auth'
import { enviarCodigoCambioCorreo } from './correo-cambio'
import { prisma } from './db'
import { rateLimit } from './rate-limit'
import { getIdentidad } from './session'

/** Códigos por (identidad, correo) y hora: corta el ruido sin castigar un despiste. */
const MAX_POR_DESTINO = 3
/** Por identidad y hora, en memoria: el tope real es el de la BD, este corta ráfagas. */
const MAX_POR_IDENTIDAD = 6
const VENTANA_MS = 60 * 60 * 1000

function valorHashCambio(identidadId: string, email: string): string {
  return hashCanal(`cambio-correo:${identidadId}:${email.trim().toLowerCase()}`)
}

export type ResultadoPedirCodigo = 'codigo_enviado' | 'invalido' | 'demasiados' | 'envio_fallido'

export async function pedirCodigoCambioCorreo(identidadId: string, email: string): Promise<ResultadoPedirCodigo> {
  if (!destinoValido('email', email)) return 'invalido'
  if (!rateLimit(`cambio-correo:${identidadId}`, MAX_POR_IDENTIDAD, VENTANA_MS).allowed) return 'demasiados'

  const valorHash = valorHashCambio(identidadId, email)
  const desde = new Date(Date.now() - VENTANA_MS)
  const recientes = await prisma.portalCodigo.count({ where: { valorHash, creadoEn: { gte: desde } } })
  if (recientes >= MAX_POR_DESTINO) return 'demasiados'

  const codigo = generarCodigo()
  await prisma.portalCodigo.create({ data: { tipo: 'email', valorHash, codigo: hashCodigo(codigo) } })
  return (await enviarCodigoCambioCorreo(email, codigo)) ? 'codigo_enviado' : 'envio_fallido'
}

/** La puerta de la ruta: la identidad sale de la cookie, nunca del cuerpo. */
export async function pedirCodigoCambioCorreoDeSesion(email: string): Promise<ResultadoPedirCodigo | 'sin_sesion'> {
  const identidad = await getIdentidad()
  if (!identidad) return 'sin_sesion'
  return pedirCodigoCambioCorreo(identidad.id, email)
}

export type ResultadoCanje = EstadoCodigo | 'sin_codigo'

/**
 * Comprueba el código SIN gastarlo: `valido` = ese correo es de quien tiene la sesión. Se reserva el
 * intento ANTES de comparar (una ráfaga en paralelo no se salta el tope de 5), igual que el login.
 *
 * 🚨 El código se gasta con `gastar()` SOLO si el guardado sale bien: gastarlo antes dejaba a quien
 * tropezaba con otro campo (una calle inválida, el puente caído) con un código muerto y sin salida.
 */
export async function comprobarCodigoCambioCorreo(
  identidadId: string,
  email: string,
  codigo: string,
): Promise<{ estado: ResultadoCanje; gastar: () => Promise<void> }> {
  const nada = async () => {}
  const valorHash = valorHashCambio(identidadId, email)
  const guardado = await prisma.portalCodigo.findFirst({ where: { tipo: 'email', valorHash }, orderBy: { creadoEn: 'desc' } })
  if (!guardado) return { estado: 'sin_codigo', gastar: nada }

  const reservado = await prisma.portalCodigo.updateMany({
    where: { id: guardado.id, usadoEn: null, intentos: { lt: MAX_INTENTOS } },
    data: { intentos: { increment: 1 } },
  })
  if (reservado.count === 0) return { estado: guardado.usadoEn ? 'ya_usado' : 'bloqueado', gastar: nada }

  const estado = estadoCodigo(
    { codigoHash: guardado.codigo, creadoEn: guardado.creadoEn, intentos: guardado.intentos, usadoEn: guardado.usadoEn },
    hashCodigo(codigo),
    new Date(),
  )
  const gastar = async () => {
    await prisma.portalCodigo.updateMany({ where: { id: guardado.id, usadoEn: null }, data: { usadoEn: new Date() } })
  }
  return { estado, gastar: estado === 'valido' ? gastar : nada }
}
