// El cambio de la cuenta de los recibos se confirma con un código al CORREO DE ACCESO (29/09/2026).
//
// 🚨 Por qué: la cuenta es donde la compañía carga el dinero. La sesión del portal dura 30 días y
// puede quedarse abierta en un móvil ajeno; pedir la cuenta nueva con solo la sesión dejaría a quien
// la tenga un rato mandar los recibos de otro a una cuenta suya. Con el código, cambiarla exige
// además abrir el correo con el que se entra.
//
// El portal no guarda el correo en claro (solo su hash en `portal_canal`), así que la persona lo
// escribe y aquí se comprueba que es un correo VERIFICADO de esta identidad antes de mandar nada.
//
// El código queda atado a la identidad Y a la cuenta (`valor_hash`): no sirve para otra cuenta ni lo
// canjea otra identidad, y no abre sesión (el login busca por `hashCanal(correo)`). Mismo almacén,
// hash y reserva atómica del intento que `verificar-correo.ts`.
import { ibanValido, normalizarIban } from '@central/module-seguros'
import { MAX_INTENTOS, destinoValido, estadoCodigo, generarCodigo, type EstadoCodigo } from '@central/module-seguros-portal'

import { hashCanal, hashCodigo } from './auth'
import { enviarCodigoCambioCuenta } from './correo-cambio'
import { prisma } from './db'
import { rateLimit } from './rate-limit'

const MAX_POR_CUENTA = 3
const MAX_POR_IDENTIDAD = 5
const VENTANA_MS = 60 * 60 * 1000

function valorHashCuenta(identidadId: string, iban: string): string {
  return hashCanal(`cambio-cuenta:${identidadId}:${iban}`)
}

/** `**** 1234`: lo único de la cuenta que viaja en el correo. */
export function mascaraIban(iban: string): string {
  return `**** ${iban.slice(-4)}`
}

export type ResultadoPedirCodigoCuenta = 'codigo_enviado' | 'iban_invalido' | 'correo_no_es_tuyo' | 'demasiados' | 'envio_fallido'

export async function pedirCodigoCambioCuenta(identidadId: string, email: string, ibanBruto: string): Promise<ResultadoPedirCodigoCuenta> {
  const iban = normalizarIban(ibanBruto)
  if (!iban || iban.length > 34 || !ibanValido(iban)) return 'iban_invalido'
  if (!destinoValido('email', email)) return 'correo_no_es_tuyo'
  if (!rateLimit(`cambio-cuenta:${identidadId}`, MAX_POR_IDENTIDAD, VENTANA_MS).allowed) return 'demasiados'

  // Solo a un correo con el que ESTA identidad ya entra (verificado). Un correo cualquiera probaría
  // que la persona controla ese buzón, no que sea el titular de la sesión.
  const canal = await prisma.portalCanal.findFirst({
    where: { identidadId, tipo: 'email', valorHash: hashCanal(email), verificadoEn: { not: null } },
    select: { id: true },
  })
  if (!canal) return 'correo_no_es_tuyo'

  const valorHash = valorHashCuenta(identidadId, iban)
  const recientes = await prisma.portalCodigo.count({ where: { valorHash, creadoEn: { gte: new Date(Date.now() - VENTANA_MS) } } })
  if (recientes >= MAX_POR_CUENTA) return 'demasiados'

  const codigo = generarCodigo()
  await prisma.portalCodigo.create({ data: { tipo: 'email', valorHash, codigo: hashCodigo(codigo) } })
  return (await enviarCodigoCambioCuenta(email.trim(), codigo, mascaraIban(iban))) ? 'codigo_enviado' : 'envio_fallido'
}

export type ResultadoCanjeCuenta = EstadoCodigo | 'sin_codigo' | 'iban_invalido'

/** Comprueba el código SIN gastarlo; `gastar()` solo si la solicitud llega a guardarse. */
export async function comprobarCodigoCambioCuenta(
  identidadId: string,
  ibanBruto: string,
  codigo: string,
): Promise<{ estado: ResultadoCanjeCuenta; iban: string | null; gastar: () => Promise<void> }> {
  const nada = async () => {}
  const iban = normalizarIban(ibanBruto)
  if (!iban || !ibanValido(iban)) return { estado: 'iban_invalido', iban: null, gastar: nada }
  const guardado = await prisma.portalCodigo.findFirst({
    where: { tipo: 'email', valorHash: valorHashCuenta(identidadId, iban) },
    orderBy: { creadoEn: 'desc' },
  })
  if (!guardado) return { estado: 'sin_codigo', iban, gastar: nada }

  const reservado = await prisma.portalCodigo.updateMany({
    where: { id: guardado.id, usadoEn: null, intentos: { lt: MAX_INTENTOS } },
    data: { intentos: { increment: 1 } },
  })
  if (reservado.count === 0) return { estado: guardado.usadoEn ? 'ya_usado' : 'bloqueado', iban, gastar: nada }

  const estado = estadoCodigo(
    { codigoHash: guardado.codigo, creadoEn: guardado.creadoEn, intentos: guardado.intentos, usadoEn: guardado.usadoEn },
    hashCodigo(codigo),
    new Date(),
  )
  const gastar = async () => {
    await prisma.portalCodigo.updateMany({ where: { id: guardado.id, usadoEn: null }, data: { usadoEn: new Date() } })
  }
  return { estado, iban, gastar: estado === 'valido' ? gastar : nada }
}
