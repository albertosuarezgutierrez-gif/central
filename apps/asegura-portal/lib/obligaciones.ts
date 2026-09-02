// Deriva las OBLIGACIONES de una identidad (qué le vence y hasta cuándo puede
// hacer algo) a partir de sus pólizas vivas de la cartera, y las devuelve ya
// ordenadas para pintar.
//
// 🔒 Aislamiento por CÓDIGO: no hay RLS que rescate un olvido. TODA consulta a
// `prisma.portalObligacion` filtra por `identidadId`, y ese id sale SIEMPRE de
// `lib/session` (la puerta única) — nunca de un parámetro de petición. Las
// funciones `…DeIdentidad` reciben el id ya resuelto por quien YA pasó por la
// puerta (la página de la bóveda lo hace una sola vez por render); las
// `…DeSesion` lo resuelven aquí. Lo vigila `test/regression-portal-aislamiento.test.ts`.
import { fechaAccionable, obligacionDerivable, type Procedencia } from '@central/module-seguros-portal'

import { carteraDeIdentidad, type CarteraPortal } from './cartera-lectura'
import { prisma } from './db'
import { getIdentidad } from './session'

export type ObligacionVista = {
  id: string
  titulo: string
  /** La fecha del hecho (cuándo vence de verdad). */
  fechaEvento: Date
  /** `fechaEvento` − DIAS_PREAVISO_TOMADOR: la última en la que aún se puede actuar. */
  fechaAccionable: Date
  /** De dónde sale el dato. Se pinta SIEMPRE: no es lo mismo `compania` que `declarado`. */
  procedencia: Procedencia
  /** El aviso ya salió. `false` = todavía no, no «no hace falta». */
  avisada: boolean
}

/**
 * Idempotente: `upsert` sobre `(identidad_id, poliza_id)`. Se puede llamar en
 * cada carga de la bóveda sin duplicar nada.
 *
 * `cartera` es opcional para no leer la cartera dos veces en el mismo render:
 * la página ya la tiene delante cuando llama aquí. Si no se pasa, se lee.
 *
 * Solo `import_ref IS NULL` llega hasta aquí: `carteraDeIdentidad()` ya devuelve
 * únicamente pólizas vivas (`lib/cartera-lectura.ts`), y `polizaGeneraObligacion()`
 * es el segundo cepo por si algún día alguien relaja ese `where`.
 */
export async function sincronizarObligacionesDeIdentidad(
  identidadId: string,
  cartera?: CarteraPortal,
): Promise<void> {
  const c = cartera ?? (await carteraDeIdentidad(identidadId))

  // Sin vínculo NO se toca nada: no es «esta identidad no tiene vencimientos»,
  // es «no sabemos qué ficha de la cartera es la suya». Borrar o crear aquí
  // sería afirmar algo que no se ha mirado.
  if (!c.vinculada) return

  const vivas: string[] = []
  const ops = []

  for (const titular of c.propias) {
    for (const p of titular.polizas) {
      // ⚠️ `confirmadaCima` NO sirve para este cepo: es `id_poliza_entidad !== null`
      // (la compañía ya la confirmó), que es una pregunta distinta de «vino por el
      // volcado histórico». Usarlo aquí dejaría fuera las pólizas que emitimos
      // nosotros y aún no ha confirmado CIMA, que sí tienen que avisar.
      //
      // 🚨 Y el segundo cepo, medido: `import_ref IS NULL` NO quiere decir «viva
      // y actual». De las 109 pólizas de CIMA, 42 están canceladas (5 con
      // vencimiento futuro) y 18 están activas con el vencimiento ya pasado —
      // la más vieja de enero de 2013. Sin `vigencia` el calendario diría
      // «tienes hasta el 13/02/2015 para renovar».
      if (!obligacionDerivable({ importRef: null, fechaVencimiento: p.fechaVencimiento, vigencia: p.vigencia })) {
        continue
      }
      // El cepo de arriba ya garantiza que hay fecha; esto se lo dice al tipo.
      const evento = p.fechaVencimiento
      if (evento === null) continue

      vivas.push(p.id)
      const accionable = fechaAccionable(evento)
      ops.push(
        prisma.portalObligacion.upsert({
          where: { identidadId_polizaId: { identidadId, polizaId: p.id } },
          create: {
            identidadId,
            polizaId: p.id,
            tipo: 'poliza',
            titulo: `${p.ramo} · ${p.compania}`,
            fechaEvento: evento,
            fechaAccionable: accionable,
            procedencia: 'compania',
          },
          // `avisadaAt` NO se toca: el sello del envío es lo único que impide
          // avisar dos veces de lo mismo.
          update: {
            titulo: `${p.ramo} · ${p.compania}`,
            fechaEvento: evento,
            fechaAccionable: accionable,
            actualizadaAt: new Date(),
          },
        }),
      )
    }
  }

  // Una póliza que ya no está viva en la cartera (cancelada, fusionada, fuera
  // de vigor) NO puede seguir pintando un vencimiento en el calendario del
  // cliente: sería la misma mentira que un semáforo verde sin datos. Solo se
  // podan las que vinieron de la CARTERA (`polizaId` no nulo): las declaradas
  // por la persona son suyas y no se borran solas.
  ops.push(
    prisma.portalObligacion.deleteMany({
      where: { identidadId, polizaId: { not: null, notIn: vivas } },
    }),
  )

  await prisma.$transaction(ops)
}

/** Envoltura que resuelve la identidad por la puerta única. */
export async function sincronizarObligacionesDeSesion(): Promise<void> {
  const identidad = await getIdentidad()
  if (!identidad) return
  await sincronizarObligacionesDeIdentidad(identidad.id)
}

export async function obligacionesDeIdentidad(identidadId: string): Promise<ObligacionVista[]> {
  const filas = await prisma.portalObligacion.findMany({
    where: { identidadId },
    orderBy: [{ fechaAccionable: 'asc' }, { fechaEvento: 'asc' }],
  })

  return filas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    fechaEvento: f.fechaEvento,
    fechaAccionable: f.fechaAccionable,
    procedencia: f.procedencia,
    avisada: f.avisadaAt !== null,
  }))
}

/** Envoltura que resuelve la identidad por la puerta única. */
export async function obligacionesDeSesion(): Promise<ObligacionVista[]> {
  const identidad = await getIdentidad()
  if (!identidad) return []
  return obligacionesDeIdentidad(identidad.id)
}

/**
 * Cuántas pólizas vivas de la cartera NO han podido entrar al calendario porque
 * la compañía no ha informado su fecha de vencimiento.
 *
 * No se descartan en silencio: cero obligaciones y «no tienes vencimientos» es
 * exactamente el «no lo he mirado» disfrazado de «no hay» que el repo persigue.
 * La pantalla lo dice y manda al cliente donde sí está el dato.
 *
 * Solo cuenta las que están en vigor por estado (`pendiente` = estado vigente
 * sin fecha). Una cancelada sin fecha no le interesa a nadie.
 */
export function polizasSinFechaDeVencimiento(cartera: CarteraPortal): number {
  let n = 0
  for (const titular of cartera.propias) {
    for (const p of titular.polizas) if (p.vigencia === 'pendiente') n += 1
  }
  return n
}
