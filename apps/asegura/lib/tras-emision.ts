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
import { estadoPortalDeFicha, nombreDe } from './invitacion-portal'
import { pdfArchivado, pdfDePoliza, TIPO_CORREO_EMISION_CON_POLIZA } from './poliza-pdf'
import { abrirAnulacionesPorSustitucion } from './sustituciones-auto'

export type ResultadoTrasEmision = {
  /**
   * `null` = no sustituye a ninguna · `abierta` = expediente esperando la firma del cliente ·
   * `en_curso` = ya estaba firmado/comunicado (no hay nada que firmar) · `sin_datos` = no se pudo abrir.
   */
  baja: 'abierta' | 'en_curso' | 'sin_datos' | 'error' | null
  /**
   * `no_resuelve` = su correo no le llevaría a SU ficha en el portal (duplicado sin resolver): no se
   * escribe, entraría y no vería la carta · `incierto` = se cortó esperando al proveedor: pudo salir,
   * NO se reenvía a ciegas.
   */
  correo: 'enviado' | 'sin_email' | 'baja_de_correo' | 'ilegible' | 'no_resuelve' | 'no_comprobado' | 'sin_portal' | 'apagado'
    | 'sin_proveedor' | 'rechazado' | 'incierto' | 'error'
}

/** Cortes de red o de espera: el proveedor pudo aceptar el mensaje antes de cortarse (misma regla que la cola). */
const CORTE = /timeout|timed out|ETIMEDOUT|ECONNRESET|ESOCKET|socket hang up|aborted/i

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export function correoEmisionActivo(v: string | undefined = process.env.ASEGURA_CORREO_EMISION): boolean {
  return v?.trim() !== '0'
}

export async function trasEmision(
  correduriaId: string,
  e: { clienteId: string; polizaId: string; polizaOrigenId: string | null },
  /**
   * Modo PRUEBA: el correo va a esta dirección (la de Alberto) y no al cliente, y no queda en la ficha
   * del cliente como enviado. El expediente de baja sí se abre: es real y no escribe a nadie.
   */
  opciones: {
    prueba?: string
    /**
     * `true` = si no está archivado, intentar traer el PDF de Codeoscopic ahora (el botón «Enviar al
     * cliente», sin prisa). Al emitir NO: `emitir` ya lo acaba de intentar y la respuesta tiene tope.
     */
    traerPdf?: boolean
  } = {},
): Promise<ResultadoTrasEmision> {
  const db = prismaAsegura()
  let baja: ResultadoTrasEmision['baja'] = null
  if (e.polizaOrigenId) {
    try {
      await db.$transaction((tx) => abrirAnulacionesPorSustitucion(tx, correduriaId, hoyMadrid()))
      // Lo que cuenta es si la vieja TIENE expediente vivo, no si lo abrió esta llamada: otro camino
      // (la ficha, una pasada anterior) pudo abrirlo antes y la firma sirve igual.
      const [x] = await db.$queryRaw<{ estado: string }[]>`
        select estado::text as estado from anulacion
        where poliza_id = ${e.polizaOrigenId}::uuid and correduria_id = ${correduriaId}::uuid and estado <> 'desistida'
        order by created_at desc limit 1`
      baja = x?.estado === 'solicitada' ? 'abierta' : x ? 'en_curso' : 'sin_datos'
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
      // La MISMA comprobación que la invitación al portal: el correo tiene que llevarle a SU ficha, o
      // entraría y no encontraría la carta (bóveda vacía, sin error). Y se le escribe a ESE correo.
      const f = await estadoPortalDeFicha(correduriaId, e.clienteId)
      if (!f) return { baja, correo: 'no_comprobado' }
      if (f.estado === 'ambiguo' || f.estado === 'resuelve_a_otra') return { baja, correo: 'no_resuelve' }
      if (f.estado === 'sin_email' || f.estado === 'ilegible' || f.estado === 'no_comprobado') return { baja, correo: f.estado }
      if (!f.emailInvitacion) return { baja, correo: 'no_comprobado' }
      destino = f.emailInvitacion
    }
    const nombre = await nombreDe(correduriaId, e.clienteId)
    // La póliza original de la compañía va ADJUNTA si ya la tenemos o se puede traer ahora (gratis). Si
    // aún no la ha generado, el correo lo dice y el cron `polizas-pdf` la manda cuando llegue.
    const pdf = await (opciones.traerPdf ? pdfDePoliza : pdfArchivado)(correduriaId, e.polizaId).catch((err) => {
      console.error('[tras-emision] no se pudo leer el PDF de la póliza (sale sin adjunto):', err instanceof Error ? err.message : err)
      return null
    })
    const cuerpo = cuerpoCorreoEmision({ nombre, enlace, conBaja: baja === 'abierta', conPoliza: pdf !== null })
    if (opciones.prueba) cuerpo.asunto = `[PRUEBA] ${cuerpo.asunto}`
    // Import dinámico: el cepo del cuerpo corre con `node --test`, que no resuelve Prisma.
    const { enviarCorreoSeguido } = await import('./correo-envio')
    const r = await enviarCorreoSeguido({
      correduriaId, clienteId: opciones.prueba ? null : e.clienteId, polizaId: opciones.prueba ? null : e.polizaId,
      tipo: opciones.prueba ? 'emision_prueba' : pdf ? TIPO_CORREO_EMISION_CON_POLIZA : 'emision', to: destino, ...cuerpo,
      ...(pdf ? { adjuntos: [{ nombre: pdf.nombre, contenido: pdf.contenido, tipo: 'application/pdf' }] } : {}),
    })
    if (r.resultado === 'rechazado' && CORTE.test(r.motivo ?? '')) return { baja, correo: 'incierto' }
    return { baja, correo: r.resultado }
  } catch (err) {
    console.error('[tras-emision] el correo al cliente no salió:', err instanceof Error ? err.message : err)
    return { baja, correo: 'error' }
  }
}

/**
 * `trasEmision` con TOPE de tiempo, para las rutas que ya han emitido y tienen que contestar: una
 * emisión hecha no puede acabar en «no sé si se ha emitido» porque el correo tardó. Pasado el tope se
 * dice lo que es — no se sabe — y el trabajo sigue en segundo plano hasta terminar.
 */
export async function trasEmisionConTope(
  correduriaId: string,
  e: { clienteId: string; polizaId: string; polizaOrigenId: string | null },
  ms = 12_000,
): Promise<ResultadoTrasEmision | { baja: null; correo: null; enCurso: true }> {
  let t: ReturnType<typeof setTimeout> | undefined
  const tope = new Promise<{ baja: null; correo: null; enCurso: true }>((res) => { t = setTimeout(() => res({ baja: null, correo: null, enCurso: true }), ms) })
  try {
    return await Promise.race([trasEmision(correduriaId, e), tope])
  } finally {
    clearTimeout(t)
  }
}
