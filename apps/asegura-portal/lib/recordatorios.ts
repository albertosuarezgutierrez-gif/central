// Recordatorios que el propio cliente se pone (ITV, carnet, caldera,
// extintores, o texto libre) — la mitad de `portal_obligacion` que no cuelga
// de ninguna póliza ni bien de la cartera. Ver la cabecera de
// `packages/module-seguros-portal/src/recordatorio-libre.ts` para el porqué.
//
// 🔒 Mismo aislamiento por CÓDIGO que `lib/obligaciones.ts`: toda consulta
// filtra por `identidadId`, que sale SIEMPRE de `lib/session`.
import {
  normalizarRecordatorio,
  siguienteOcurrencia,
  type EntradaRecordatorio,
  type TipoRecordatorio,
} from '@central/module-seguros-portal'

import { prisma } from './db'
import { getIdentidad } from './session'

export type RecordatorioVista = {
  id: string
  tipo: TipoRecordatorio
  titulo: string
  fechaEvento: Date
  fechaAccionable: Date
  repiteCadaMeses: number | null
  avisada: boolean
}

/** Lo que distingue un recordatorio PROPIO de una obligación derivada: sin
 *  bien, sin póliza de cartera y sin póliza declarada detrás. */
const FILTRO_PROPIOS = { bienId: null, polizaId: null, polizaDeclaradaId: null } as const

export type ResultadoCrear = { ok: true; id: string } | { ok: false; error: string }

/**
 * Da de alta un recordatorio propio. La fecha que teclea la persona ES la
 * fecha en la que quiere que le avisen — `fechaAccionable` es la MISMA, sin
 * restarle los 30 días del art. 22 LCS (eso es de una renovación de póliza,
 * un plazo que el cliente no elige; esto lo elige él).
 */
export async function crearRecordatorio(identidadId: string, entrada: EntradaRecordatorio): Promise<ResultadoCrear> {
  const normalizado = normalizarRecordatorio(entrada)
  if (!normalizado.ok) return { ok: false, error: normalizado.error }
  const { tipo, titulo, fechaEvento, repiteCadaMeses } = normalizado.datos

  const fila = await prisma.portalObligacion.create({
    data: {
      identidadId,
      tipo,
      titulo,
      fechaEvento,
      fechaAccionable: fechaEvento,
      repiteCadaMeses,
      procedencia: 'declarado',
    },
    select: { id: true },
  })
  return { ok: true, id: fila.id }
}

/** Solo borra lo suyo: el `where` lleva `identidadId` Y `...FILTRO_PROPIOS`,
 *  así que ni una petición con el id de la obligación de OTRO ni el id de una
 *  obligación derivada de póliza (que no tiene dueño de este botón) borran nada. */
export async function borrarRecordatorio(identidadId: string, id: string): Promise<boolean> {
  const { count } = await prisma.portalObligacion.deleteMany({
    where: { id, identidadId, ...FILTRO_PROPIOS },
  })
  return count > 0
}

export async function recordatoriosDeIdentidad(identidadId: string): Promise<RecordatorioVista[]> {
  const filas = await prisma.portalObligacion.findMany({
    where: { identidadId, ...FILTRO_PROPIOS },
    orderBy: [{ fechaAccionable: 'asc' }],
  })
  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo as TipoRecordatorio,
    titulo: f.titulo,
    fechaEvento: f.fechaEvento,
    fechaAccionable: f.fechaAccionable,
    repiteCadaMeses: f.repiteCadaMeses,
    // `avisadaAt` (el correo) nunca se pone en estas filas — no tienen póliza
    // de la que sacar un destinatario (ver la cabecera de
    // `avanzarRecordatoriosRecurrentesDeIdentidad`) — así que «ya avisado»
    // aquí solo puede leerse del push.
    avisada: f.avisadaPushAt !== null,
  }))
}

/** Envoltura que resuelve la identidad por la puerta única. */
export async function recordatoriosDeSesion(): Promise<RecordatorioVista[]> {
  const identidad = await getIdentidad()
  if (!identidad) return []
  return recordatoriosDeIdentidad(identidad.id)
}

/**
 * Empuja al ciclo siguiente los recordatorios RECURRENTES cuyo aviso ya salió
 * y cuya fecha ya pasó. Es lo que hace que un «ITV cada 12 meses» no se quede
 * mudo para siempre tras el primer aviso: sin este paso, `avisadaAt` seguiría
 * puesto y el cron (que solo mira `avisada_at IS NULL`) no volvería a tocarlo
 * jamás.
 *
 * 🚨 Solo avanza lo que YA se avisó por ALGÚN canal (`avisadaAt` O
 * `avisadaPushAt`, no null): un recordatorio recurrente cuya fecha pasó sin
 * que nadie lo viera todavía tiene que seguir apareciendo como vencido, no
 * saltar en silencio al año que viene.
 *
 * 🚨 Y tiene que ser un «o», no un «y», y no puede ser solo `avisadaAt`: el
 * cron de CORREO (`apps/asegura/lib/avisos-vencimiento.ts`) resuelve el
 * destinatario a través de la PÓLIZA (`o.polizaId ? destinatarioDeCliente(...)
 * : null`), y un recordatorio propio no tiene — es SIEMPRE `sinCanal` para ese
 * cron, así que `avisadaAt` para estas filas no se pone NUNCA, tenga o no
 * suscripción push la persona. El único canal que de verdad puede avisar de
 * un recordatorio propio es el push (`/api/cron/avisos-push`, que si no
 * escribe `avisadaPushAt` en `debeAvisarPush` cuando el envío se acepta).
 * Exigir `avisadaAt` habría dejado esta función sin efecto para SIEMPRE — el
 * caso que el docstring de arriba dice evitar, con el candado puesto en la
 * cerradura equivocada.
 *
 * Se llama desde el mismo sitio que sincroniza las obligaciones de póliza
 * (`sincronizarObligacionesDeIdentidad`, en cada carga de la bóveda) para que
 * comparta el único punto de entrada que ya lee la campana de avisos.
 */
export async function avanzarRecordatoriosRecurrentesDeIdentidad(identidadId: string, hoy: Date = new Date()): Promise<void> {
  const pendientes = await prisma.portalObligacion.findMany({
    where: {
      identidadId,
      ...FILTRO_PROPIOS,
      repiteCadaMeses: { not: null },
      OR: [{ avisadaAt: { not: null } }, { avisadaPushAt: { not: null } }],
      fechaEvento: { lt: hoy },
    },
    select: { id: true, fechaEvento: true, repiteCadaMeses: true },
  })
  if (pendientes.length === 0) return

  await prisma.$transaction(
    pendientes.map((p) => {
      // El `where` de arriba ya garantiza `repiteCadaMeses !== null`.
      const siguiente = siguienteOcurrencia(p.fechaEvento, p.repiteCadaMeses as number)
      return prisma.portalObligacion.update({
        where: { id: p.id },
        data: {
          fechaEvento: siguiente,
          fechaAccionable: siguiente,
          avisadaAt: null,
          avisadaPushAt: null,
          actualizadaAt: new Date(),
        },
      })
    }),
  )
}
