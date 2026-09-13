// Recordatorios que el propio cliente se pone (ITV, carnet, caldera,
// extintores, o texto libre) — la mitad de `portal_obligacion` que no cuelga
// de ninguna póliza ni bien de la cartera. Ver la cabecera de
// `packages/module-seguros-portal/src/recordatorio-libre.ts` para el porqué.
//
// 🔒 Mismo aislamiento por CÓDIGO que `lib/obligaciones.ts`: toda consulta
// filtra por `identidadId`, que sale SIEMPRE de `lib/session`.
import {
  siguienteOcurrencia,
  type RecordatorioNormalizado,
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
  /** `cartera:<id>` / `declarada:<id>` de la póliza a la que está colgado este
   *  recordatorio, o `null` si no está asignado a ninguna. Mismo formato que
   *  `PolizaOpcionParte.valor` en `ParteSiniestro.tsx`, para que la pantalla
   *  pueda buscar su matrícula/dirección en la MISMA lista sin otra vuelta al
   *  servidor. */
  poliza: string | null
}

/** Los CINCO tipos que son «recordatorio propio»; el resto (`poliza`, `recibo`)
 *  los deriva `sincronizarObligacionesDeIdentidad()` de la cartera/declaradas.
 *  Es el discriminador correcto desde el 13/09/2026: un recordatorio propio SÍ
 *  puede llevar `polizaId`/`polizaDeclaradaId` (para decir de qué seguro es),
 *  así que esos dos campos ya no sirven para distinguirlo de una obligación
 *  derivada — el `tipo` sí, porque `sincronizarObligacionesDeIdentidad()`
 *  nunca escribe estos cinco. */
const TIPOS_PROPIOS: TipoRecordatorio[] = ['itv', 'carnet', 'mantenimiento', 'revision_gas', 'libre']
const FILTRO_PROPIOS = { tipo: { in: TIPOS_PROPIOS } }

/**
 * Da de alta un recordatorio propio. La fecha que teclea la persona ES la
 * fecha en la que quiere que le avisen — `fechaAccionable` es la MISMA, sin
 * restarle los 30 días del art. 22 LCS (eso es de una renovación de póliza,
 * un plazo que el cliente no elige; esto lo elige él).
 *
 * 🚨 Recibe el `valor` ya NORMALIZADO (`normalizarRecordatorio()`) Y con la
 * PERTENENCIA de `polizaId`/`polizaDeclaradaId` ya comprobada por quien llama
 * — esta función no vuelve a mirarlo, igual que `crearParte()` con un
 * `ParteNormalizado`. La comprobación vive en la ruta (mismo orden de
 * `POST /api/siniestros`: identidad → validación → PERTENENCIA → escritura).
 */
export async function crearRecordatorio(identidadId: string, valor: RecordatorioNormalizado): Promise<{ id: string }> {
  const fila = await prisma.portalObligacion.create({
    data: {
      identidadId,
      tipo: valor.tipo,
      titulo: valor.titulo,
      fechaEvento: valor.fechaEvento,
      fechaAccionable: valor.fechaEvento,
      repiteCadaMeses: valor.repiteCadaMeses,
      polizaId: valor.polizaId,
      polizaDeclaradaId: valor.polizaDeclaradaId,
      procedencia: 'declarado',
    },
    select: { id: true },
  })
  return fila
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
    poliza: f.polizaId ? `cartera:${f.polizaId}` : f.polizaDeclaradaId ? `declarada:${f.polizaDeclaradaId}` : null,
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
 *
 * 🚨 Dos cepos que se vieron morder en `code-review` (Graphify) antes de
 * mergear:
 *  1. `fechaEvento` es medianoche UTC del día, pero `hoy` (el `new Date()` por
 *     defecto) lleva la HORA actual — comparar `fechaEvento < hoy` a pelo
 *     adelanta el ciclo el MISMO día del evento, en cuanto pasa la
 *     medianoche, antes de que la persona haya tenido ocasión de hacer nada
 *     ese día. Se compara contra la medianoche de HOY (`diaUtc()`), el mismo
 *     criterio que ya usan `obligacion.ts` y `cobro-declarado.ts`.
 *  2. Un solo `siguienteOcurrencia()` solo avanza UN ciclo. Alguien que no
 *     abre el portal en varios ciclos (una ITV mensual, tres meses sin
 *     entrar) se quedaría con una fecha que sigue en el pasado hasta que
 *     visite la bóveda tantas veces como ciclos se le hayan escapado. Se
 *     avanza en bucle hasta que la fecha vuelve a ser de hoy en adelante.
 */
function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export async function avanzarRecordatoriosRecurrentesDeIdentidad(identidadId: string, hoy: Date = new Date()): Promise<void> {
  const hoyUtc = diaUtc(hoy)
  // `orderBy: id` es a propósito: dos llamadas concurrentes para la MISMA identidad (dos
  // pestañas abiertas a la vez) que tocaran las mismas filas en orden distinto podrían
  // bloquearse la una a la otra dentro del `$transaction` (deadlock de Postgres). Sin un
  // orden determinista, Postgres no garantiza en qué orden devuelve las filas de un
  // `findMany` sin `ORDER BY` — hallazgo de code-review (Graphify).
  const pendientes = await prisma.portalObligacion.findMany({
    where: {
      identidadId,
      ...FILTRO_PROPIOS,
      repiteCadaMeses: { not: null },
      OR: [{ avisadaAt: { not: null } }, { avisadaPushAt: { not: null } }],
      fechaEvento: { lt: hoyUtc },
    },
    select: { id: true, fechaEvento: true, repiteCadaMeses: true },
    orderBy: { id: 'asc' },
  })
  if (pendientes.length === 0) return

  await prisma.$transaction(
    pendientes.map((p) => {
      // El `where` de arriba ya garantiza `repiteCadaMeses !== null`.
      const meses = p.repiteCadaMeses as number
      let siguiente = siguienteOcurrencia(p.fechaEvento, meses)
      while (siguiente.getTime() < hoyUtc.getTime()) siguiente = siguienteOcurrencia(siguiente, meses)
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
