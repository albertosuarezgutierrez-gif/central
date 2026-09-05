import {
  ALCANCE_SUPRESION,
  DIAS_AVISO,
  DIAS_PRORROGA,
  DIAS_RESPUESTA,
  diasRestantes,
  estadoPlazo,
  fechaLimite,
  type EstadoPlazo,
  type EstadoSupresion,
} from '@central/module-seguros-portal'

import { aseguraConfigurada, prismaAsegura } from './asegura-db'

/**
 * La cola de solicitudes del **derecho de supresión (art. 17 RGPD)** que llegan
 * por el portal del cliente.
 *
 * 🚨 Esto existe porque, si no, la solicitud no la ve NADIE. La regla de la casa
 * dice que un aviso que sale por una pantalla que esa persona no abre es un
 * aviso que no existe — y Alberto solo abre `plataforma` → `/correduria`. Una
 * solicitud registrada en la BD del portal y ninguna pantalla que la enseñe es
 * exactamente el caso fundacional de la cuna de la reserva 152490601, salvo que
 * aquí lo que corre por debajo es **un plazo legal de un mes** (art. 12.3) que se
 * incumple solo, en silencio y sin que nada falle.
 *
 * 🕐 Y por eso la cola **la ordena el RELOJ, no la fecha de llegada**: lo vencido
 * primero, luego lo urgente. Ordenar por antigüedad parece lo mismo y no lo es en
 * cuanto una solicitud se prorroga.
 */

export type SupresionEnCola = {
  id: string
  identidadId: string
  clienteId: string | null
  recibidaEn: Date
  estado: EstadoSupresion
  /** `resuelta` · `en_plazo` · `urgente` (≤7 días) · `vencido`. */
  plazo: EstadoPlazo
  fechaLimite: Date
  /** Negativo si ya venció. No se colapsa a 0: «llevo diez días fuera de plazo»
   *  y «se acaba hoy» son cosas distintas y la segunda tranquiliza. */
  diasRestantes: number
  prorrogadaEn: Date | null
  prorrogaMotivo: string | null
  resueltaEn: Date | null
  respuesta: string | null
  resueltaPor: string | null
  motivo: string | null
  versionTextos: string
}

export type ResumenSupresiones = {
  pendientes: number
  urgentes: number
  /** 🚨 Lo único que autoriza a decir «hay un plazo incumplido». */
  vencidas: number
}

export type ResultadoCola =
  | { estado: 'sin_configurar' }
  | {
      estado: 'ok'
      solicitudes: SupresionEnCola[]
      resumen: ResumenSupresiones
      /** El alcance que se le enseñó a la persona al pedirlo, para que el corredor
       *  conteste sobre lo MISMO que se le prometió y no sobre otra lista. */
      alcance: typeof ALCANCE_SUPRESION
      plazos: { respuesta: number; prorroga: number; aviso: number }
    }

const ORDEN: Record<EstadoPlazo, number> = { vencido: 0, urgente: 1, en_plazo: 2, resuelta: 3 }

export async function colaSupresiones(incluirResueltas = false): Promise<ResultadoCola> {
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  const db = prismaAsegura()

  const filas = await db.portalSupresion.findMany({
    where: incluirResueltas ? {} : { estado: { in: ['recibida', 'en_curso'] } },
    orderBy: { recibidaEn: 'asc' },
    take: 200,
  })

  const ahora = new Date()
  const solicitudes: SupresionEnCola[] = filas.map((f) => {
    const base = {
      recibidaEn: f.recibidaEn,
      estado: f.estado as EstadoSupresion,
      prorrogadaEn: f.prorrogadaEn,
      resueltaEn: f.resueltaEn,
    }
    return {
      id: f.id,
      identidadId: f.identidadId,
      clienteId: f.clienteId,
      recibidaEn: f.recibidaEn,
      estado: f.estado as EstadoSupresion,
      plazo: estadoPlazo(base, ahora),
      fechaLimite: fechaLimite(base),
      diasRestantes: diasRestantes(base, ahora),
      prorrogadaEn: f.prorrogadaEn,
      prorrogaMotivo: f.prorrogaMotivo,
      resueltaEn: f.resueltaEn,
      respuesta: f.respuesta,
      resueltaPor: f.resueltaPor,
      motivo: f.motivo,
      versionTextos: f.versionTextos,
    }
  })

  solicitudes.sort((a, b) => ORDEN[a.plazo] - ORDEN[b.plazo] || a.fechaLimite.getTime() - b.fechaLimite.getTime())

  return {
    estado: 'ok',
    solicitudes,
    resumen: {
      pendientes: solicitudes.filter((s) => s.plazo !== 'resuelta').length,
      urgentes: solicitudes.filter((s) => s.plazo === 'urgente').length,
      vencidas: solicitudes.filter((s) => s.plazo === 'vencido').length,
    },
    alcance: ALCANCE_SUPRESION,
    plazos: { respuesta: DIAS_RESPUESTA, prorroga: DIAS_PRORROGA, aviso: DIAS_AVISO },
  }
}

export type ErrorResolver =
  | 'no_encontrada'
  | 'ya_resuelta'
  /** Marcar resuelta sin decir qué se contestó es lo que el art. 12.4 prohíbe. */
  | 'sin_respuesta'
  | 'sin_motivo_prorroga'

export type ResultadoResolver =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: ErrorResolver }
  | { estado: 'ok'; solicitud: SupresionEnCola }

/**
 * Contestar una solicitud, o prorrogarla.
 *
 * 🚨 **La respuesta es obligatoria y no tiene valor por defecto.** El art. 12.4
 * obliga a motivar la negativa, aunque sea parcial — y la parcial es el caso
 * NORMAL aquí, porque casi siempre habrá algo que la ley obliga a conservar. Un
 * «resuelta» sin texto marcaría el plazo como cumplido sin nada que lo acredite,
 * y además apagaría el reloj en la pantalla: el incumplimiento se volvería
 * invisible justo al producirse. La BD lo vuelve a exigir con su CHECK, porque un
 * cepo solo en el código no protege a un `UPDATE` escrito a mano.
 *
 * 🚨 **Prorrogar sin motivo tampoco se puede**: la prórroga hay que AVISARLA
 * dentro del primer mes explicando por qué. Prorrogar en silencio incumple igual
 * que no contestar, así que el sello sin motivo sería una prórroga inventada.
 */
export async function resolverSupresion(entrada: {
  id: string
  estado: Exclude<EstadoSupresion, 'recibida' | 'retirada'>
  respuesta?: string | null
  prorrogaMotivo?: string | null
  actor: string
}): Promise<ResultadoResolver> {
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  const db = prismaAsegura()

  const fila = await db.portalSupresion.findUnique({ where: { id: entrada.id } })
  if (!fila) return { estado: 'error', motivo: 'no_encontrada' }
  if (fila.estado !== 'recibida' && fila.estado !== 'en_curso') {
    return { estado: 'error', motivo: 'ya_resuelta' }
  }

  const respuesta = (entrada.respuesta ?? '').trim()
  const prorrogaMotivo = (entrada.prorrogaMotivo ?? '').trim()

  if (entrada.estado === 'en_curso') {
    // Ponerla «en curso» sin prórroga es solo abrirla: no toca el reloj y no
    // exige respuesta. Con prórroga, el motivo es obligatorio.
    if (prorrogaMotivo === '' && fila.prorrogadaEn === null) {
      const abierta = await db.portalSupresion.update({
        where: { id: entrada.id },
        data: { estado: 'en_curso' },
      })
      return { estado: 'ok', solicitud: (await colaConUna(abierta))! }
    }
    if (prorrogaMotivo === '') return { estado: 'error', motivo: 'sin_motivo_prorroga' }
    const prorrogada = await db.portalSupresion.update({
      where: { id: entrada.id },
      data: { estado: 'en_curso', prorrogadaEn: new Date(), prorrogaMotivo },
    })
    return { estado: 'ok', solicitud: (await colaConUna(prorrogada))! }
  }

  if (respuesta === '') return { estado: 'error', motivo: 'sin_respuesta' }

  const resuelta = await db.portalSupresion.update({
    where: { id: entrada.id },
    data: { estado: entrada.estado, resueltaEn: new Date(), respuesta, resueltaPor: entrada.actor },
  })
  return { estado: 'ok', solicitud: (await colaConUna(resuelta))! }
}

/** La misma proyección que la cola, para una sola fila. Se comparte a propósito:
 *  dos formas del mismo objeto acaban dando plazos distintos de la misma solicitud. */
async function colaConUna(f: {
  id: string
  identidadId: string
  clienteId: string | null
  recibidaEn: Date
  estado: string
  prorrogadaEn: Date | null
  prorrogaMotivo: string | null
  resueltaEn: Date | null
  respuesta: string | null
  resueltaPor: string | null
  motivo: string | null
  versionTextos: string
}): Promise<SupresionEnCola | null> {
  const ahora = new Date()
  const base = {
    recibidaEn: f.recibidaEn,
    estado: f.estado as EstadoSupresion,
    prorrogadaEn: f.prorrogadaEn,
    resueltaEn: f.resueltaEn,
  }
  return {
    id: f.id,
    identidadId: f.identidadId,
    clienteId: f.clienteId,
    recibidaEn: f.recibidaEn,
    estado: f.estado as EstadoSupresion,
    plazo: estadoPlazo(base, ahora),
    fechaLimite: fechaLimite(base),
    diasRestantes: diasRestantes(base, ahora),
    prorrogadaEn: f.prorrogadaEn,
    prorrogaMotivo: f.prorrogaMotivo,
    resueltaEn: f.resueltaEn,
    respuesta: f.respuesta,
    resueltaPor: f.resueltaPor,
    motivo: f.motivo,
    versionTextos: f.versionTextos,
  }
}
