// El derecho de SUPRESIÓN (art. 17 RGPD), contra la BD.
//
// 🚨 LO QUE ESTE FICHERO NO HACE, Y ES LA MITAD DEL DISEÑO: no borra nada.
//
// El art. 17.3 excluye la supresión cuando el tratamiento hace falta para
// cumplir una obligación legal (b) o para defender reclamaciones (e), y una
// correduría tiene las dos: la normativa de seguros y la de prevención del
// blanqueo obligan a conservar la documentación de la mediación, y del contrato
// pueden derivarse responsabilidades después. Las dos salidas fáciles están mal:
// un botón que borre de verdad destruye documentación que la ley obliga a
// guardar, y uno que diga «borrado» sin borrar es una mentira al interesado.
//
// Lo que sí es obligatorio, y es lo que hay aquí: **recibir la solicitud,
// acusarla con el alcance por escrito y dejarla en la cola del corredor con su
// reloj**. Las reglas y los plazos viven en el módulo puro
// (`@central/module-seguros-portal/supresion`); esto es solo la BD.
//
// 📌 Y la regla de la casa que decide dónde se ve: *un aviso que sale por una
// pantalla que esa persona no abre es un aviso que no existe*. Aquí lo que corre
// es un plazo legal de un mes, así que la solicitud **no se queda en esta app**:
// `apps/asegura` la sirve por su puerto de operador a `plataforma` → `/correduria`,
// que es la única pantalla que Alberto abre.
//
// 🔒 Aislamiento por CÓDIGO. El rol `prisma_asegura_portal` es NOBYPASSRLS pero
// esta tabla no tiene políticas para él: una consulta sin `where` respondería 200
// con las solicitudes de todo el mundo. La identidad SIEMPRE sale de la cookie
// (`lib/session`) y nunca del cuerpo de la petición.
import {
  YA_PENDIENTE,
  estadoPlazo,
  fechaLimite,
  loQueSeConserva,
  loQueSeSuprime,
  puedeRegistrar,
  type AlcanceSupresion,
  type EstadoPlazo,
  type EstadoSupresion,
} from '@central/module-seguros-portal'
import { VERSION_TEXTOS_LEGALES } from '@central/module-seguros'

import { prisma } from './db'
import { correduriaUnica } from './peticiones'
import { getIdentidad } from './session'

/** Tope del texto libre. El mismo que el CHECK de la BD: recortar solo aquí no es un tope. */
export const MAX_MOTIVO = 1000

/**
 * Normaliza el motivo que escribe la persona. La cadena vacía se convierte en
 * `null` a propósito: `''` es el valor de cajón que se cuela por `IS NULL`, `??`
 * y `COALESCE`, y dejaría al corredor leyendo «me lo explicó y no dijo nada».
 */
export function normalizarMotivo(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim()
  if (t === '') return null
  return t.slice(0, MAX_MOTIVO)
}

export type SolicitudDelPortal = {
  id: string
  recibidaEn: Date
  estado: EstadoSupresion
  plazo: EstadoPlazo
  fechaLimite: Date
  prorrogadaEn: Date | null
  prorrogaMotivo: string | null
  resueltaEn: Date | null
  respuesta: string | null
  motivo: string | null
}

/**
 * El acuse. Va a la pantalla TAL CUAL, y por eso lleva las dos listas: quien
 * pide que le borren tiene derecho a saber **desde el primer momento** que parte
 * de sus datos van a seguir ahí, y por qué (art. 12.4 — la negativa parcial hay
 * que motivarla). Enseñárselo solo un mes después, en la respuesta final, es
 * dejarle creer durante un mes que se borró todo.
 */
export type Acuse = {
  seSuprime: readonly AlcanceSupresion[]
  seConserva: readonly AlcanceSupresion[]
  /** La fecha COMPROMETIDA, calculada, no un «te contestaremos pronto». */
  fechaLimite: Date
}

export type ResultadoRegistro =
  | { estado: 'registrada'; solicitud: SolicitudDelPortal; acuse: Acuse }
  /** Ya tenía una en curso. No es un error: se le enseña la que tiene. */
  | { estado: 'ya_pendiente'; solicitud: SolicitudDelPortal; acuse: Acuse; aviso: string }

function aSolicitud(f: {
  id: string
  recibidaEn: Date
  estado: string
  prorrogadaEn: Date | null
  prorrogaMotivo: string | null
  resueltaEn: Date | null
  respuesta: string | null
  motivo: string | null
}): SolicitudDelPortal {
  // Un estado fuera del vocabulario NO se colapsa a `recibida`: se deja tal cual
  // y el reloj lo trata como pendiente (`estadoPlazo` solo para en los resueltos),
  // que es el lado conservador — una solicitud rara sigue apareciendo en la cola
  // en vez de desaparecer de ella.
  const base = {
    recibidaEn: f.recibidaEn,
    estado: f.estado as EstadoSupresion,
    prorrogadaEn: f.prorrogadaEn,
    resueltaEn: f.resueltaEn,
  }
  return {
    id: f.id,
    recibidaEn: f.recibidaEn,
    estado: f.estado as EstadoSupresion,
    plazo: estadoPlazo(base, new Date()),
    fechaLimite: fechaLimite(base),
    prorrogadaEn: f.prorrogadaEn,
    prorrogaMotivo: f.prorrogaMotivo,
    resueltaEn: f.resueltaEn,
    respuesta: f.respuesta,
    motivo: f.motivo,
  }
}

const CAMPOS = {
  id: true,
  recibidaEn: true,
  estado: true,
  prorrogadaEn: true,
  prorrogaMotivo: true,
  resueltaEn: true,
  respuesta: true,
  motivo: true,
} as const

function acuseDe(s: SolicitudDelPortal): Acuse {
  return { seSuprime: loQueSeSuprime(), seConserva: loQueSeConserva(), fechaLimite: s.fechaLimite }
}

/**
 * Registra la solicitud. **El instante que se guarda es el de ahora**, no el de
 * cuando el corredor la abra: si el mes del art. 12.3 arrancara al mirarla, no
 * mirarla nunca sería una forma de no incumplir jamás.
 *
 * 🚨 La carrera se resuelve con el índice único parcial de la BD
 * (`idx_portal_supresion_pendiente`), no con un `SELECT` y un `if`: entre los dos
 * cabe otra solicitud, y dos relojes legales sobre el mismo caso es exactamente
 * lo que la tabla evita. El `SELECT` previo existe solo para poder ENSEÑARLE la
 * que ya tiene; la autoridad es el índice.
 */
export async function registrarSupresion(
  identidadId: string,
  entrada: { motivo?: string | null; ip?: string | null; userAgent?: string | null },
): Promise<ResultadoRegistro> {
  const previas = await prisma.portalSupresion.findMany({
    where: { identidadId },
    select: CAMPOS,
    orderBy: { recibidaEn: 'desc' },
  })
  const yaAbierta = previas.map(aSolicitud).find((s) => s.estado === 'recibida' || s.estado === 'en_curso')
  if (!puedeRegistrar(previas.map((p) => ({ recibidaEn: p.recibidaEn, estado: p.estado as EstadoSupresion }))) && yaAbierta) {
    return { estado: 'ya_pendiente', solicitud: yaAbierta, acuse: acuseDe(yaAbierta), aviso: YA_PENDIENTE }
  }

  // La ficha de la cartera, si su acceso está enlazado. `null` NO significa «no
  // es cliente»: significa que no hay vínculo. Un lead también ejerce el derecho
  // y su solicitud se registra igual.
  const vinculo = await prisma.portalVinculo.findFirst({
    where: { identidadId },
    select: { clienteId: true, correduriaId: true },
  })

  try {
    const fila = await prisma.portalSupresion.create({
      data: {
        correduriaId: vinculo?.correduriaId ?? (await correduriaUnica()),
        identidadId,
        clienteId: vinculo?.clienteId ?? null,
        motivo: normalizarMotivo(entrada.motivo),
        // Sin la versión de los textos no se puede reconstruir QUÉ se le dijo que
        // se iba a conservar: el alcance cambia cuando cambian los textos.
        versionTextos: VERSION_TEXTOS_LEGALES,
        ip: entrada.ip ?? null,
        userAgent: entrada.userAgent ?? null,
      },
      select: CAMPOS,
    })
    const s = aSolicitud(fila)
    return { estado: 'registrada', solicitud: s, acuse: acuseDe(s) }
  } catch (e) {
    // P2002 = el índice único parcial. Otra solicitud entró entre el SELECT y el
    // INSERT: se relee y se le enseña la suya, en vez de un 500 que le haría
    // creer que su petición no ha quedado registrada en ninguna parte.
    if (typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002') {
      const abierta = await prisma.portalSupresion.findFirst({
        where: { identidadId, estado: { in: ['recibida', 'en_curso'] } },
        select: CAMPOS,
      })
      if (abierta) {
        const s = aSolicitud(abierta)
        return { estado: 'ya_pendiente', solicitud: s, acuse: acuseDe(s), aviso: YA_PENDIENTE }
      }
    }
    throw e
  }
}

/** Lo que ve la persona en su pantalla: sus solicitudes, la más reciente primero. */
export async function supresionesDeIdentidad(identidadId: string): Promise<SolicitudDelPortal[]> {
  const filas = await prisma.portalSupresion.findMany({
    where: { identidadId },
    select: CAMPOS,
    orderBy: { recibidaEn: 'desc' },
    take: 20,
  })
  return filas.map(aSolicitud)
}

/**
 * Retirarla. La retira QUIEN LA PIDIÓ, y **no se colapsa con «denegada»**: una
 * dice «me he arrepentido» y la otra «me han dicho que no». Confundirlas borra
 * el único rastro de quién decidió qué.
 *
 * No se borra la fila —el rol no tiene DELETE— porque es la prueba de que
 * ejerció el derecho y de que se le atendió.
 */
export async function retirarSupresion(identidadId: string, id: string): Promise<SolicitudDelPortal | null> {
  // El `where` lleva la identidad SIEMPRE: sin ella, un id de otro retiraría la
  // solicitud de otra persona y no fallaría nada.
  const r = await prisma.portalSupresion.updateMany({
    where: { id, identidadId, estado: { in: ['recibida', 'en_curso'] } },
    data: { estado: 'retirada', resueltaEn: new Date(), respuesta: 'Retirada por la persona que la solicitó.' },
  })
  if (r.count === 0) return null
  const fila = await prisma.portalSupresion.findFirst({ where: { id, identidadId }, select: CAMPOS })
  return fila ? aSolicitud(fila) : null
}

/**
 * Lo mismo, resolviendo la identidad **por la cookie** (`lib/session`), que es
 * la puerta única del portal. Es la que usa la pantalla: así el `identidadId`
 * no viaja nunca por un parámetro que alguien pueda pasar a mano.
 */
export async function supresionesDelUsuario(): Promise<SolicitudDelPortal[] | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return supresionesDeIdentidad(identidad.id)
}
