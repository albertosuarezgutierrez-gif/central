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
import { esCarteraViva } from '@central/module-seguros'
import {
  etiquetaRamo,
  fechaAccionable,
  obligacionDerivable,
  reparoDeclarada,
  type Procedencia,
} from '@central/module-seguros-portal'

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
 * Solo llega CARTERA VIVA: `carteraDeIdentidad()` ya filtra por
 * `WHERE_CARTERA_VIVA` (`lib/cartera-lectura.ts`), y aquí se vuelve a preguntar
 * con los datos REALES de la fila (`p.procedencia`) por si algún día alguien
 * relaja ese `where`. Desde el 03/09/2026 «viva» ya NO es `import_ref IS NULL`:
 * es `import_ref IS NULL` **O** `eiac_xml_hash IS NOT NULL` — una póliza que
 * CIMA actualiza sobre una fila del volcado conserva su `import_ref` viejo y
 * aun así hay que avisar de su vencimiento.
 */
export async function sincronizarObligacionesDeIdentidad(
  identidadId: string,
  cartera?: CarteraPortal,
): Promise<void> {
  // 1) Las pólizas que SUBE la persona. Van SIEMPRE, con vínculo o sin él:
  //    son lo único que tiene quien todavía no es cliente de la correduría, y
  //    hasta el 07/09/2026 no generaban nada — se guardaban y se enseñaban, y
  //    ahí acababa todo. Sin obligación no hay calendario y sin calendario no
  //    puede haber aviso, así que la intranet le decía a esa persona que su
  //    póliza estaba «controlada» sin que nadie mirase su vencimiento.
  //
  //    Va en su propia transacción y no mezclada con la de la cartera: tocan
  //    filas distintas (`poliza_declarada_id` contra `poliza_id`) y una no
  //    tiene por qué caerse porque falle la otra.
  await prisma.$transaction(await opsDeDeclaradas(identidadId))

  const c = cartera ?? (await carteraDeIdentidad(identidadId))

  // 2) Las de la CARTERA. Sin vínculo NO se toca nada de esto: no es «esta
  // identidad no tiene vencimientos», es «no sabemos qué ficha de la cartera
  // es la suya». Borrar o crear aquí sería afirmar algo que no se ha mirado.
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
      // Cepo 1 — de dónde viene la fila. Se pregunta con los valores REALES de
      // la BD, no con un `null` cableado: desde el 03/09/2026 una póliza del
      // volcado que CIMA mantiene al día (con `eiac_xml_hash`) SÍ es cartera
      // viva y SÍ tiene que avisar, y con el criterio viejo se quedaba fuera.
      if (!esCarteraViva(p.procedencia)) continue

      // Cepo 2 — medido: estar en la cartera viva NO quiere decir «viva y
      // actual». De las 109 pólizas de CIMA, 42 están canceladas (5 con
      // vencimiento futuro) y 18 están activas con el vencimiento ya pasado —
      // la más vieja de enero de 2013. Sin `vigencia` el calendario diría
      // «tienes hasta el 13/02/2015 para renovar».
      //
      // `obligacionDerivable()` vuelve a pasar por el cepo 1 (usa la misma
      // `esCarteraViva`), así que se le dan los valores REALES de la fila: es
      // redundante a propósito, para que la regla no dependa de que quien llama
      // se acuerde de filtrar antes.
      if (
        !obligacionDerivable({
          importRef: p.procedencia.importRef,
          eiacXmlHash: p.procedencia.eiacXmlHash,
          fechaVencimiento: p.fechaVencimiento,
          vigencia: p.vigencia,
        })
      ) {
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
            // La etiqueta, no el enum: este título es lo que el cliente lee en
            // «Tu calendario», y `responsabilidad_civil` no es castellano.
            titulo: `${etiquetaRamo(p.ramo) ?? p.ramo} · ${p.compania}`,
            fechaEvento: evento,
            fechaAccionable: accionable,
            procedencia: 'compania',
          },
          // `avisadaAt` NO se toca: el sello del envío es lo único que impide
          // avisar dos veces de lo mismo.
          update: {
            // La etiqueta, no el enum: este título es lo que el cliente lee en
            // «Tu calendario», y `responsabilidad_civil` no es castellano.
            titulo: `${etiquetaRamo(p.ramo) ?? p.ramo} · ${p.compania}`,
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

/**
 * Las obligaciones que salen de las pólizas que la PERSONA ha subido.
 *
 * Qué genera obligación y qué no lo decide `reparoDeclarada()`, que vive en
 * `@central/module-seguros-portal` con su test: una póliza sin fecha de
 * vencimiento no se puede contar hacia atrás, y una que nadie ha confirmado
 * lleva fechas que adivinó un extractor. Avisar sobre una fecha que leyó una
 * IA y que nadie ha mirado es PEOR que no avisar — el correo llega, la persona
 * se fía, y el día bueno era otro.
 *
 * 🚨 Lo que NO hace esta función es decir cuántas se quedaron fuera. Eso es
 * cosa de la pantalla (`reparosDeclaradasDeIdentidad()`), y no es un adorno: si la bóveda
 * enseña la póliza y calla que de ella no va a avisar, la persona se queda
 * creyendo que la vigilamos. Es la ausencia disfrazada de normalidad de
 * siempre.
 */
async function opsDeDeclaradas(identidadId: string) {
  const declaradas = await prisma.portalPolizaDeclarada.findMany({
    where: { identidadId },
    select: { id: true, compania: true, ramo: true, fechaVencimiento: true, confirmadaPorUsuario: true },
  })

  const avisables: string[] = []
  const ops = []

  for (const p of declaradas) {
    if (reparoDeclarada(p) !== null) continue
    // El reparo ya garantiza que hay fecha; esto se lo dice al tipo.
    const evento = p.fechaVencimiento
    if (evento === null) continue

    avisables.push(p.id)
    const accionable = fechaAccionable(evento)
    // La etiqueta, no el enum: esto es lo que se lee en «Tu calendario», y
    // `responsabilidad_civil` no es castellano. La compañía se OMITE si no se
    // sabe, en vez de escribir un «sin compañía» que nadie ha declarado.
    const ramoTxt = p.ramo ? (etiquetaRamo(p.ramo) ?? p.ramo) : 'Póliza'
    const titulo = p.compania ? `${ramoTxt} · ${p.compania}` : ramoTxt

    ops.push(
      prisma.portalObligacion.upsert({
        where: { identidadId_polizaDeclaradaId: { identidadId, polizaDeclaradaId: p.id } },
        create: {
          identidadId,
          polizaDeclaradaId: p.id,
          tipo: 'poliza',
          titulo,
          fechaEvento: evento,
          fechaAccionable: accionable,
          procedencia: 'declarado',
        },
        // `avisadaAt` NO se toca, igual que en la rama de la cartera: el sello
        // del envío es lo único que impide avisar dos veces de lo mismo, y esta
        // función corre en CADA carga de la bóveda.
        update: { titulo, fechaEvento: evento, fechaAccionable: accionable, actualizadaAt: new Date() },
      }),
    )
  }

  // Poda. La persona pudo borrar la póliza, quitarle la fecha o dejar de
  // confirmarla: en los tres casos su vencimiento deja de ser algo que podamos
  // afirmar, y una fila que sobrevive es un aviso que se manda sobre un dato
  // que ya no existe. Solo se podan las DECLARADAS; las de la cartera tienen
  // su propia poda más arriba.
  ops.push(
    prisma.portalObligacion.deleteMany({
      where: { identidadId, polizaDeclaradaId: { not: null, notIn: avisables } },
    }),
  )

  return ops
}

/**
 * De cuántas pólizas subidas por la persona NO se puede avisar, y por qué.
 *
 * 🚨 Esto no es una estadística: es la mitad honesta de la función de arriba.
 * `opsDeDeclaradas()` decide en silencio cuáles entran en el calendario, y sin
 * esta las demás desaparecerían sin dejar rastro — la bóveda enseñaría la
 * póliza guardada, no habría ningún vencimiento asociado, y la persona leería
 * eso como «está controlada». Tres estados, no dos: avisable · sin fecha ·
 * sin confirmar. Los dos últimos son «todavía no se sabe», y cada uno manda a
 * la persona a un sitio distinto a arreglarlo.
 */
export type ReparosDeclaradas = { sinFecha: number; sinConfirmar: number }

export async function reparosDeclaradasDeIdentidad(identidadId: string): Promise<ReparosDeclaradas> {
  const declaradas = await prisma.portalPolizaDeclarada.findMany({
    where: { identidadId },
    select: { fechaVencimiento: true, confirmadaPorUsuario: true },
  })

  const cuenta: ReparosDeclaradas = { sinFecha: 0, sinConfirmar: 0 }
  for (const p of declaradas) {
    const r = reparoDeclarada(p)
    if (r === 'sin_fecha') cuenta.sinFecha += 1
    else if (r === 'sin_confirmar') cuenta.sinConfirmar += 1
  }
  return cuenta
}

/** Envoltura que resuelve la identidad por la puerta única. */
export async function reparosDeclaradasDeSesion(): Promise<ReparosDeclaradas> {
  const identidad = await getIdentidad()
  if (!identidad) return { sinFecha: 0, sinConfirmar: 0 }
  return reparosDeclaradasDeIdentidad(identidad.id)
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
