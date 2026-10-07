// El CÓDIGO DE ACCESO del presupuesto por WhatsApp, del lado de asegura (07/10/2026).
//
// Alberto manda el enlace A MANO por WhatsApp (`whatsapp_enlace` → wa.me). Con el enlace va un
// código de 6 dígitos propio de ese presupuesto: abre la carátula del portal y sirve para firmar,
// también a quien no tiene correo en la ficha. Las reglas puras viven en
// `@central/module-seguros-portal` (`codigo-whatsapp.ts`); aquí solo la BD:
//
//   · se GENERA en `envio-presupuesto.ts` (mismo compare-and-swap que rota el token);
//   · se COMPRUEBA aquí, y SOLO aquí: el rol del portal no tiene GRANT sobre estas columnas (su
//     única escritura concedida es `visto_at`), así que el portal pregunta por el puente;
//   · el intento se RESERVA con una escritura condicionada ANTES de comparar (mismo patrón que el
//     OTP del portal y que `firma_otp_intentos`): dos peticiones en paralelo no se saltan el tope.
//
// 🚨 NUNCA se manda nada por WhatsApp desde aquí: el envío es de Alberto, desde su móvil.

import {
  estadoCodigoWhatsapp, formatoCodigoWhatsapp, formatoTokenVistaValido, hashCodigoWhatsapp, hashTokenVista, intentosQuedan,
  MAX_INTENTOS_WHATSAPP,
} from '@central/module-seguros-portal'
import { esMovilWhatsapp } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
import { campoIlegible, descifrarCampo } from './cartera-edicion'

export type ResultadoCodigoWhatsapp =
  | { estado: 'valido'; presupuestoId: string; clienteId: string }
  | { estado: 'incorrecto'; quedan: number }
  | { estado: 'bloqueado' }
  | { estado: 'caducado' }
  /** Este enlace no salió por WhatsApp (o se avisó después por correo): no hay código que comparar. */
  | { estado: 'sin_codigo' }
  /** El token no es de ningún presupuesto vivo de esta correduría (o se regeneró). */
  | { estado: 'no_encontrado' }
  | { estado: 'invalido' }

/**
 * Comprueba (y GASTA un intento de) el código de WhatsApp del presupuesto de ese `token`.
 * `presupuestoId`, si viene, tiene que ser el del token: la firma lo pasa para que un token de otro
 * presupuesto no firme este.
 */
export async function gastarCodigoWhatsapp(
  correduriaId: string, token: string, codigo: string, presupuestoId: string | null = null, ahora: Date = new Date(),
): Promise<ResultadoCodigoWhatsapp> {
  if (!formatoTokenVistaValido(token)) return { estado: 'no_encontrado' }
  if (!formatoCodigoWhatsapp(codigo)) return { estado: 'invalido' }
  const db = prismaAsegura()
  const tokenHash = await hashTokenVista(token)
  const fila = await db.presupuesto.findFirst({
    where: { tokenHash, correduriaId, ...(presupuestoId ? { id: presupuestoId } : {}) },
    select: { id: true, clienteId: true, whatsappCodigoHash: true, whatsappCodigoIntentos: true, venceEl: true, retiradoAt: true },
  })
  if (!fila) return { estado: 'no_encontrado' }
  const entradaHash = await hashCodigoWhatsapp(token, codigo)
  // Sin código, bloqueado o caducado se responde SIN gastar intento: no hay nada que adivinar.
  const previo = estadoCodigoWhatsapp(
    { codigoHash: fila.whatsappCodigoHash, intentos: fila.whatsappCodigoIntentos, venceEl: fila.venceEl, retirado: fila.retiradoAt !== null },
    entradaHash, ahora,
  )
  if (previo === 'sin_codigo' || previo === 'bloqueado' || previo === 'caducado') return { estado: previo }

  // El intento se gasta ANTES de comparar y en una sola sentencia.
  const [gastado] = await db.$queryRaw<{ hash: string | null; intentos: number; venceEl: Date }[]>`
    update presupuesto set whatsapp_codigo_intentos = whatsapp_codigo_intentos + 1
    where id = ${fila.id}::uuid and correduria_id = ${correduriaId}::uuid and token_hash = ${tokenHash}
      and whatsapp_codigo_hash is not null and whatsapp_codigo_intentos < ${MAX_INTENTOS_WHATSAPP}::int
      and retirado_at is null and vence_el > ${ahora}
    returning whatsapp_codigo_hash as hash, whatsapp_codigo_intentos as intentos, vence_el as "venceEl"`
  if (!gastado) {
    // Ha cambiado entre leer y gastar (otro intento a la vez, regenerado, retirado): se vuelve a mirar.
    const otra = await db.presupuesto.findFirst({
      where: { id: fila.id, tokenHash, correduriaId },
      select: { whatsappCodigoHash: true, whatsappCodigoIntentos: true, venceEl: true, retiradoAt: true },
    })
    if (!otra) return { estado: 'no_encontrado' }
    const e = estadoCodigoWhatsapp(
      { codigoHash: otra.whatsappCodigoHash, intentos: otra.whatsappCodigoIntentos, venceEl: otra.venceEl, retirado: otra.retiradoAt !== null },
      entradaHash, ahora,
    )
    // Lo único que no se devuelve es un acierto: sin intento reservado no se compara.
    return e === 'sin_codigo' || e === 'caducado' ? { estado: e } : { estado: 'bloqueado' }
  }

  const estado = estadoCodigoWhatsapp(
    { codigoHash: gastado.hash, intentos: gastado.intentos - 1, venceEl: gastado.venceEl, retirado: false },
    entradaHash, ahora,
  )
  if (estado === 'valido') {
    // Acierto: los fallos seguidos vuelven a cero (sobre ESE hash: si se regeneró, no se toca el nuevo).
    await db.presupuesto.updateMany({
      where: { id: fila.id, whatsappCodigoHash: gastado.hash },
      data: { whatsappCodigoIntentos: 0 },
    })
    return { estado: 'valido', presupuestoId: fila.id, clienteId: fila.clienteId }
  }
  if (estado === 'incorrecto') return { estado: 'incorrecto', quedan: intentosQuedan(gastado.intentos) }
  return { estado }
}

/**
 * La ficha dueña del presupuesto, para quien entró con el código del WhatsApp (el portal guarda el
 * token en su cookie de acceso, que solo pone tras un código válido). `null` = el token ya no es el
 * de ese presupuesto (se regeneró o se avisó por correo), está retirado, vencido o sin código.
 *
 * 🚨 La ficha sale del PROPIO presupuesto, nunca de un `clienteId` que llegue de fuera.
 */
export async function fichaDeTokenWhatsapp(correduriaId: string, token: string, presupuestoId: string, ahora: Date = new Date()): Promise<{ clienteId: string } | null> {
  if (!formatoTokenVistaValido(token)) return null
  const fila = await prismaAsegura().presupuesto.findFirst({
    where: {
      id: presupuestoId, correduriaId, tokenHash: await hashTokenVista(token),
      retiradoAt: null, whatsappCodigoHash: { not: null }, venceEl: { gt: ahora },
    },
    select: { clienteId: true },
  })
  return fila ? { clienteId: fila.clienteId } : null
}

export type MovilDeFicha = 'ok' | 'sin_movil' | 'ilegible' | 'no_encontrado'

/**
 * ¿Tiene la ficha un móvil al que se le pueda mandar un WhatsApp? Ilegible ≠ inexistente: un
 * teléfono que la clave PII no abre NO cuenta como «no tiene» (se arregla en Vercel).
 */
export async function movilDeFicha(correduriaId: string, clienteId: string): Promise<MovilDeFicha> {
  const c = await prismaAsegura().cliente.findFirst({
    where: { id: clienteId, correduriaId, mergedIntoClienteId: null },
    select: { telefono: true, telefonos: { select: { telefono: true } } },
  })
  if (!c) return 'no_encontrado'
  let hayIlegible = false
  for (const v of [c.telefono, ...c.telefonos.map((t) => t.telefono)]) {
    if (typeof v !== 'string' || v.trim() === '') continue
    if (campoIlegible(v)) { hayIlegible = true; continue }
    if (esMovilWhatsapp(descifrarCampo(v))) return 'ok'
  }
  return hayIlegible ? 'ilegible' : 'sin_movil'
}
