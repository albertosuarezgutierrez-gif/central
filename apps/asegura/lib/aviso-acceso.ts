/**
 * Avisar por correo a quien tiene una autorización PENDIENTE.
 *
 * El texto y el envío viven en `lib/correo-aviso-acceso.ts`; aquí está la BD y
 * las cuatro comprobaciones que deciden si se manda algo:
 *
 *   1. **Las dos fichas son de esta correduría.** Un id que llega por el puerto
 *      no es prueba de nada.
 *   2. **Hay una autorización PENDIENTE de verdad** (`aceptado_en IS NULL`, sin
 *      revocar y sin caducar). Avisar de una vigente sería mandar a confirmar
 *      algo ya confirmado; de una caducada, mandar a una pantalla vacía.
 *   3. **El destinatario sale de la ficha AUTORIZADA**, nunca de la petición.
 *      Es la misma regla 3 de `lib/avisos-vencimiento.ts`: un destinatario que
 *      viaja en un JSON convierte este puerto en un relay de correo.
 *   4. **Hay dónde mandarle.** Sin email legible no se «envía 0 correos»: se
 *      dice `sin_email`, que es lo que Alberto tiene que arreglar. La regla de
 *      A QUÉ dirección se escribe vive desde el 05/09/2026 en `email-ficha.ts`,
 *      compartida con la invitación al portal: dos copias de «cuál es el correo
 *      de este cliente» divergen sin que nada falle.
 *
 * 🚨 Y lo que este puerto NO hace: **no acepta la autorización**. Sigue
 * pendiente después del correo, igual que antes. La doble aceptación es el
 * único punto del sistema donde se prueba que al otro lado está la persona que
 * Alberto tiene en la cabeza, y un botón del panel no puede saltárselo.
 */
import { estadoAutorizacion } from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'
import { emailDeFicha } from './email-ficha'
import { enlaceDeAutorizaciones, enviarAvisoAcceso } from './correo-aviso-acceso'

export type FalloAviso = 'no_encontrado' | 'sin_pendiente' | 'sin_email' | 'sin_portal' | 'error_envio'

export type ResultadoAviso =
  | { ok: true; caducaEn: Date }
  | { ok: false; estado: FalloAviso; motivo: string; status: 404 | 409 | 422 | 502 | 503 }

/**
 * Avisa a `autorizadoId` de que `otorganteId` le ha dado acceso y está esperando
 * su confirmación.
 */
export async function avisarAccesoPendiente(
  correduriaId: string,
  entrada: { otorganteId: string; autorizadoId: string; actor: string },
): Promise<ResultadoAviso> {
  const db = prismaAsegura()

  const [otorgante, autorizado] = await Promise.all([
    db.cliente.findFirst({
      where: { id: entrada.otorganteId, correduriaId, mergedIntoClienteId: null },
      select: { nombre: true, apellidos: true },
    }),
    db.cliente.findFirst({
      where: { id: entrada.autorizadoId, correduriaId, mergedIntoClienteId: null },
      select: { id: true },
    }),
  ])
  if (!otorgante || !autorizado) {
    return { ok: false, estado: 'no_encontrado', motivo: 'Alguna de las dos fichas no existe en esta correduría.', status: 404 }
  }

  // Pendiente de VERDAD: el estado lo decide el módulo puro sobre la fila, no un
  // `where` que dé por hecho que «sin aceptar» es «pendiente» — una sin aceptar
  // que ya pasó su fecha está caducada, y mandar a confirmarla lleva a una
  // pantalla donde no hay nada que pulsar.
  const ahora = new Date()
  const filas = await db.portalAutorizacion.findMany({
    where: {
      correduriaId,
      otorganteClienteId: entrada.otorganteId,
      autorizadoClienteId: entrada.autorizadoId,
      aceptadoEn: null,
      revocadoEn: null,
    },
    select: { aceptadoEn: true, caducaEn: true, revocadoEn: true },
  })
  const pendientes = filas.filter((f) => estadoAutorizacion(f, ahora) === 'pendiente')
  if (pendientes.length === 0) {
    return {
      ok: false,
      estado: 'sin_pendiente',
      motivo: 'No hay ninguna autorización pendiente de confirmar entre esas dos fichas.',
      status: 409,
    }
  }
  // La más lejana: es hasta cuándo puede confirmar, que es lo que dice el correo.
  const caducaEn = pendientes.reduce((a, f) => (f.caducaEn > a ? f.caducaEn : a), pendientes[0].caducaEn)

  const destino = await emailDeFicha(correduriaId, entrada.autorizadoId)
  if (!destino) {
    return {
      ok: false,
      estado: 'sin_email',
      motivo: 'Esa ficha no tiene ningún correo al que escribir (o está de baja de correo): añádeselo y vuelve a intentarlo.',
      status: 422,
    }
  }

  const enlace = enlaceDeAutorizaciones()
  if (!enlace) {
    return { ok: false, estado: 'sin_portal', motivo: 'No hay una dirección del portal configurada: no se puede avisar.', status: 503 }
  }

  const nombre = `${otorgante.nombre} ${otorgante.apellidos}`.trim()
  const enviado = await enviarAvisoAcceso(destino, { otorgante: nombre === '' ? null : nombre, enlace, caducaEn })
  if (!enviado) {
    return { ok: false, estado: 'error_envio', motivo: 'El proveedor de correo no aceptó el mensaje. Vuelve a intentarlo.', status: 502 }
  }

  // Queda en las dos fichas: a un tercero se le ha escrito, y eso se tiene que
  // poder ver. El correo NO se guarda; ya está cifrado en su ficha.
  await Promise.all([
    anotar(correduriaId, entrada.otorganteId, `Se avisa por correo a la ficha ${entrada.autorizadoId} de que tiene pendiente confirmar el acceso a sus seguros — enviado desde plataforma por ${entrada.actor}`),
    anotar(correduriaId, entrada.autorizadoId, `Aviso por correo: la ficha ${entrada.otorganteId} le ha dado acceso a sus seguros y está pendiente de que lo confirme — enviado desde plataforma por ${entrada.actor}`),
  ])

  return { ok: true, caducaEn }
}

async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[aviso-acceso] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
