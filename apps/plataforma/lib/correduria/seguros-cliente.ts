import type { PolizaDeclaradaFicha, PolizaFicha } from '../ficha-asegura'
import type { OportunidadDeCliente } from '../seguimiento-asegura'

/**
 * Los seguros de un cliente en los TRES cubos con los que trabaja una
 * correduría (Alberto, 24/09/2026: «los seguros pueden estar con nosotros,
 * oportunidad porque está en la competencia, o ya no existe; y ya dentro, el
 * seguimiento de venta»).
 *
 *   con nosotros  → póliza en vigor que trae CIMA (o emitida y pendiente de CIMA).
 *   oportunidad   → lo tiene otra compañía: póliza cancelada/vencida/«competencia»,
 *                   oportunidad abierta o perdida por algo que se puede reintentar,
 *                   o póliza aportada desde el portal.
 *   ya no existe  → el riesgo desapareció: póliza en `fin_riesgo` u oportunidad
 *                   perdida porque el cliente «ya no lo necesita».
 *
 * El volcado histórico (2013-2018, sin CIMA) va APARTE: son leads, pero 28.000
 * filas viejas no pueden ahogar lo que está vivo.
 *
 * Pura y sin JSX: la ficha la pinta, este fichero decide, y el test lo vigila.
 */

export type SeguroCliente =
  | {
      clase: 'poliza'
      id: string
      poliza: PolizaFicha
      /** La oportunidad abierta del mismo ramo, si la hay: la tarjeta lleva a su seguimiento. */
      oportunidad: OportunidadDeCliente | null
    }
  | { clase: 'oportunidad'; id: string; oportunidad: OportunidadDeCliente }
  | { clase: 'declarada'; id: string; declarada: PolizaDeclaradaFicha }

export type RepartoSeguros = {
  conNosotros: SeguroCliente[]
  oportunidades: SeguroCliente[]
  yaNoExiste: SeguroCliente[]
  /** Volcado histórico sin CIMA: leads viejos, se enseñan plegados. */
  historicas: PolizaFicha[]
  /** `false` = no se pudieron leer las oportunidades: el cubo puede estar incompleto. */
  oportunidadesLeidas: boolean
  /** `false` = no se pudieron leer las aportadas desde el portal. */
  declaradasLeidas: boolean
}

export const ESTADOS_ABIERTOS = ['competencia', 'en_negociacion', 'pendiente_cliente'] as const

/** Estados de póliza que significan «se fue a otra compañía». */
const PERDIDA_A_COMPETENCIA = new Set(['cancelada', 'vencida', 'competencia'])
/** Motivos de pérdida en los que el riesgo ya no existe. */
const RIESGO_DESAPARECIDO = new Set(['cliente_desiste'])

function abierta(o: OportunidadDeCliente): boolean {
  return (ESTADOS_ABIERTOS as readonly string[]).includes(o.estado)
}

function porFecha(a: string | null, b: string | null): number {
  // Sin fecha, al final: no se sabe cuándo toca, no «toca ya».
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a < b ? -1 : 1
}

function fechaDe(s: SeguroCliente): string | null {
  if (s.clase === 'poliza') return s.oportunidad?.proximaTarea?.fechaLimite ?? s.poliza.fechaVencimiento
  if (s.clase === 'oportunidad') return s.oportunidad.proximaTarea?.fechaLimite ?? s.oportunidad.fechaFinVigencia
  return s.declarada.fechaVencimiento
}

export function repartirSegurosCliente({ polizas, declaradas, oportunidades }: {
  polizas: PolizaFicha[]
  declaradas: PolizaDeclaradaFicha[] | null
  /** `null` = no se pudieron leer. */
  oportunidades: OportunidadDeCliente[] | null
}): RepartoSeguros {
  const conNosotros: SeguroCliente[] = []
  const enCompetencia: Extract<SeguroCliente, { clase: 'poliza' }>[] = []
  const yaNoExiste: SeguroCliente[] = []
  const historicas: PolizaFicha[] = []

  for (const p of polizas) {
    if (!p.viva) { historicas.push(p); continue }
    const estado = p.estado.trim()
    const s = { clase: 'poliza' as const, id: p.id, poliza: p, oportunidad: null }
    if (estado === 'fin_riesgo') yaNoExiste.push(s)
    else if (PERDIDA_A_COMPETENCIA.has(estado)) enCompetencia.push(s)
    // Emitida y aún sin CIMA, en vigor, «anula al vencimiento» (sigue cubierta hasta
    // entonces) o un estado que no se reconoce: está con nosotros mientras no se sepa
    // lo contrario — que es como ya la cuenta la cabecera de la ficha.
    else conNosotros.push(s)
  }

  const sueltas: SeguroCliente[] = []
  if (oportunidades) {
    // Las abiertas primero: son las que se enganchan a una póliza perdida del mismo ramo.
    const abiertas = oportunidades.filter(abierta)
    for (const o of abiertas) {
      const hueco = enCompetencia.find(s => s.oportunidad === null && o.ramo !== null && s.poliza.tipo === o.ramo)
      if (hueco) hueco.oportunidad = o
      else sueltas.push({ clase: 'oportunidad', id: o.id, oportunidad: o })
    }
    const ramosCubiertos = new Set<string>([
      ...abiertas.map(o => o.ramo ?? ''),
      ...enCompetencia.map(s => s.poliza.tipo),
    ])
    // De las perdidas, la más reciente de cada ramo sin nada abierto. `error_alta` es un
    // descarte (se abrió por error): no es ni venta perdida ni riesgo, no se enseña.
    const perdidas = oportunidades
      .filter(o => o.estado === 'perdida' && o.motivoPerdida !== 'error_alta')
      .sort((a, b) => (b.cerradaAt ?? b.creada).localeCompare(a.cerradaAt ?? a.creada))
    const vistos = new Set<string>()
    for (const o of perdidas) {
      const ramo = o.ramo ?? `sin-ramo:${o.id}`
      if (vistos.has(ramo)) continue
      vistos.add(ramo)
      if (o.motivoPerdida !== null && RIESGO_DESAPARECIDO.has(o.motivoPerdida)) {
        yaNoExiste.push({ clase: 'oportunidad', id: o.id, oportunidad: o })
      } else if (!ramosCubiertos.has(o.ramo ?? '')) {
        // Perdida por precio, competidor… el seguro sigue existiendo en otra casa:
        // se reintenta al vencimiento.
        sueltas.push({ clase: 'oportunidad', id: o.id, oportunidad: o })
      }
    }
    // Las ganadas no salen: su póliza ya está en «con nosotros».
  }

  const aportadas: SeguroCliente[] = (declaradas ?? [])
    // `yaEnCartera` = la misma póliza subida por el cliente: no es de la competencia.
    .filter(d => d.yaEnCartera !== true)
    .map(d => ({ clase: 'declarada' as const, id: d.id, declarada: d }))

  const ordenar = (l: SeguroCliente[]) => l.sort((a, b) => porFecha(fechaDe(a), fechaDe(b)))

  return {
    conNosotros: ordenar(conNosotros),
    oportunidades: ordenar([...enCompetencia, ...sueltas, ...aportadas]),
    yaNoExiste,
    historicas,
    oportunidadesLeidas: oportunidades !== null,
    declaradasLeidas: declaradas !== null,
  }
}

/** Una oportunidad abierta del cliente sin próxima tarea está huérfana: nadie la va a mover. */
export function estaHuerfana(o: OportunidadDeCliente): boolean {
  return abierta(o) && o.proximaTarea === null && o.aparcadaHasta === null
}

