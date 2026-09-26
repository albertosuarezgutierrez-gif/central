// Lo que pasa justo DESPUÉS de emitir una póliza con éxito (26/09/2026, dictado de Alberto):
//   1. Si sustituye a otra, se abre YA el expediente de baja de la vieja — sin esperar a la pasada de
//      `correduria-eventos` (06:15/12:15 UTC), que es la que lo abría hasta hoy. Es la MISMA función
//      (`abrirAnulacionesPorSustitucion`), idempotente: una póliza con expediente no se toca.
//   2. Se manda al cliente UN correo: su seguro está emitido y, si hay baja, la carta está esperando su
//      firma en el portal. La pulsación de «Emitir» es el OK de ese envío concreto.
//   3. Al firmar, la carta sale sola a la compañía (`enviarAnulacionTrasFirma`, en aprobaciones).
//
// Nada de esto puede deshacer ni ensuciar la emisión, que ya está hecha: cada paso es best-effort y
// devuelve lo que pasó de verdad (tres estados, no dos) para que Alberto lo vea en la respuesta.
//
// Interruptor: `ASEGURA_CORREO_EMISION=0` apaga el correo (el expediente se sigue abriendo).
import { prismaAsegura } from './asegura-db'
import { cuerpoCorreoEmision } from './correo-emision.ts'
import { enlacePortal } from './correo-invitacion-portal.ts'
import { estadoEmailDeFicha } from './email-ficha'
import { abrirAnulacionesPorSustitucion } from './sustituciones-auto'

export type ResultadoTrasEmision = {
  /** `null` = no sustituye a ninguna; `abierta` = hay expediente esperando la firma; `sin_datos` = no se pudo abrir. */
  baja: 'abierta' | 'sin_datos' | 'error' | null
  correo: 'enviado' | 'sin_email' | 'baja_de_correo' | 'ilegible' | 'sin_portal' | 'apagado' | 'sin_proveedor' | 'rechazado' | 'error'
}

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export function correoEmisionActivo(v: string | undefined = process.env.ASEGURA_CORREO_EMISION): boolean {
  return v?.trim() !== '0'
}

export async function trasEmision(
  correduriaId: string,
  e: { clienteId: string; polizaOrigenId: string | null },
  /**
   * Modo PRUEBA: el correo va a esta dirección (la de Alberto) y no al cliente, y no queda en la ficha
   * del cliente como enviado. El expediente de baja sí se abre: es real y no escribe a nadie.
   */
  opciones: { prueba?: string } = {},
): Promise<ResultadoTrasEmision> {
  const db = prismaAsegura()
  let baja: ResultadoTrasEmision['baja'] = null
  if (e.polizaOrigenId) {
    try {
      await db.$transaction((tx) => abrirAnulacionesPorSustitucion(tx, correduriaId, hoyMadrid()))
      // Lo que cuenta es si la vieja TIENE expediente vivo, no si lo abrió esta llamada: otro camino
      // (la ficha, una pasada anterior) pudo abrirlo antes y la firma sirve igual.
      const [x] = await db.$queryRaw<{ n: bigint }[]>`
        select count(*) as n from anulacion
        where poliza_id = ${e.polizaOrigenId}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'solicitada'`
      baja = Number(x?.n ?? 0) > 0 ? 'abierta' : 'sin_datos'
    } catch (err) {
      console.error('[tras-emision] no se pudo abrir la baja de la póliza anterior:', err instanceof Error ? err.message : err)
      baja = 'error'
    }
  }

  if (!opciones.prueba && !correoEmisionActivo()) return { baja, correo: 'apagado' }
  try {
    const enlace = enlacePortal()
    if (!enlace) return { baja, correo: 'sin_portal' }
    let destino: string
    if (opciones.prueba) {
      destino = opciones.prueba
    } else {
      const ficha = await estadoEmailDeFicha(correduriaId, e.clienteId)
      if (ficha.estado === 'baja_de_correo' || ficha.estado === 'ilegible') return { baja, correo: ficha.estado }
      if (ficha.estado !== 'ok') return { baja, correo: 'sin_email' }
      destino = ficha.email
    }
    const c = await db.cliente.findFirst({ where: { id: e.clienteId, correduriaId }, select: { nombre: true } })
    const cuerpo = cuerpoCorreoEmision({ nombre: c?.nombre ?? null, enlace, conBaja: baja === 'abierta' })
    if (opciones.prueba) cuerpo.asunto = `[PRUEBA] ${cuerpo.asunto}`
    // Import dinámico: el cepo del cuerpo corre con `node --test`, que no resuelve Prisma.
    const { enviarCorreoCliente } = await import('./correo-envio')
    const r = await enviarCorreoCliente({
      correduriaId, clienteId: opciones.prueba ? null : e.clienteId, tipo: opciones.prueba ? 'emision_prueba' : 'emision', to: destino, ...cuerpo,
    })
    return { baja, correo: r }
  } catch (err) {
    console.error('[tras-emision] el correo al cliente no salió:', err instanceof Error ? err.message : err)
    return { baja, correo: 'error' }
  }
}
