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
 * El volcado histórico (2013-2018, sin CIMA) también es «lo tiene en otra
 * compañía» (Alberto, 25/09/2026: «póliza en competencia es oportunidad»): la
 * MÁS RECIENTE de cada ramo que no esté ya cubierto sale como tarjeta de
 * oportunidad —era el auto de Rafael Campa que se le ofrecía por WhatsApp y
 * que la ficha escondía en una nota al pie—. El resto sigue aparte, plegado:
 * una por ramo basta para trabajarlo sin que 20 fichas viejas ahoguen lo vivo.
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
      /** Viene del volcado histórico: su fecha es de hace años, solo vale el día y el mes. */
      historica?: true
    }
  | { clase: 'oportunidad'; id: string; oportunidad: OportunidadDeCliente }
  | { clase: 'declarada'; id: string; declarada: PolizaDeclaradaFicha }

export type RepartoSeguros = {
  conNosotros: SeguroCliente[]
  oportunidades: SeguroCliente[]
  yaNoExiste: SeguroCliente[]
  /** Volcado histórico sin CIMA que NO sale como tarjeta (ramo ya cubierto u otra más reciente). */
  historicas: PolizaFicha[]
  /** Volcado histórico que el corredor QUITÓ de Oportunidades (se puede recuperar). */
  descartadas: PolizaFicha[]
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

/**
 * El próximo aniversario (hoy incluido) de una fecha de vencimiento ya pasada:
 * un seguro anual renueva el mismo día cada año, así que un «vence 24/10/2023»
 * anotado hace años dice «le toca el 24/10/2026». Una fecha futura se devuelve
 * tal cual. `null` si la fecha no se puede leer — no se inventa ninguna.
 */
export function proximoAniversario(iso: string | null, hoy: Date): string | null {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const [a, m, d] = [+iso.slice(0, 4), +iso.slice(5, 7), +iso.slice(8, 10)]
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  const en = (anio: number) => {
    // 29/02 en un año no bisiesto renueva el 28/02; el resto se recorta al último día del mes.
    const dia = Math.min(d, new Date(Date.UTC(anio, m, 0)).getUTCDate())
    return Date.UTC(anio, m - 1, dia)
  }
  if (en(a) >= hoyUtc) return new Date(en(a)).toISOString().slice(0, 10)
  let anio = hoy.getUTCFullYear()
  if (en(anio) < hoyUtc) anio++
  return new Date(en(anio)).toISOString().slice(0, 10)
}

/**
 * La fecha que se enseña para el vencimiento de una OPORTUNIDAD. Si venció hace
 * menos de un año es una renovación que se acaba de pasar: se deja tal cual
 * (atrasada, que es lo que hay que ver). Si es más vieja, el dato es de hace
 * años y lo útil es su próximo aniversario.
 */
export function vencimientoOportunidad(iso: string | null, hoy: Date): string | null {
  const proxima = proximoAniversario(iso, hoy)
  if (proxima === null || iso === null) return proxima
  const fin = iso.slice(0, 10)
  const haceUnAnio = new Date(Date.UTC(hoy.getUTCFullYear() - 1, hoy.getUTCMonth(), hoy.getUTCDate())).toISOString().slice(0, 10)
  return fin > haceUnAnio ? fin : proxima
}

function fechaDe(s: SeguroCliente, hoy: Date): string | null {
  if (s.clase === 'poliza') {
    return s.oportunidad?.proximaTarea?.fechaLimite
      ?? (s.historica ? proximoAniversario(s.poliza.fechaVencimiento, hoy) : s.poliza.fechaVencimiento)
  }
  if (s.clase === 'oportunidad') return s.oportunidad.proximaTarea?.fechaLimite ?? vencimientoOportunidad(s.oportunidad.fechaFinVigencia, hoy)
  return s.declarada.fechaVencimiento
}

export function repartirSegurosCliente({ polizas, declaradas, oportunidades, hoy = new Date() }: {
  polizas: PolizaFicha[]
  declaradas: PolizaDeclaradaFicha[] | null
  /** `null` = no se pudieron leer. */
  oportunidades: OportunidadDeCliente[] | null
  /** Por defecto `new Date()`; parámetro para los tests. */
  hoy?: Date
}): RepartoSeguros {
  const conNosotros: SeguroCliente[] = []
  const enCompetencia: Extract<SeguroCliente, { clase: 'poliza' }>[] = []
  const yaNoExiste: SeguroCliente[] = []
  const historicas: PolizaFicha[] = []
  // Viva perdida a la competencia que el corredor QUITÓ de Oportunidades (se puede recuperar).
  const vivasDescartadas: PolizaFicha[] = []

  for (const p of polizas) {
    if (!p.viva) { historicas.push(p); continue }
    const estado = p.estado.trim()
    const s = { clase: 'poliza' as const, id: p.id, poliza: p, oportunidad: null }
    if (estado === 'fin_riesgo') yaNoExiste.push(s)
    else if (PERDIDA_A_COMPETENCIA.has(estado)) {
      if (p.leadDescartado) vivasDescartadas.push(p)
      else enCompetencia.push(s)
    }
    // Emitida y aún sin CIMA, en vigor, «anula al vencimiento» (sigue cubierta hasta
    // entonces) o un estado que no se reconoce: está con nosotros mientras no se sepa
    // lo contrario — que es como ya la cuenta la cabecera de la ficha.
    else conNosotros.push(s)
  }

  // Del volcado histórico, la más reciente de cada ramo del que no sepamos nada más
  // nuevo: ni póliza viva (con nosotros, perdida o en `fin_riesgo`), ni una aportada
  // desde el portal, ni una oportunidad PERDIDA (su competidor y su fecha son de hoy,
  // y una de «ya no lo necesita» dice que el riesgo desapareció). Las abiertas no
  // bloquean: se enganchan a esta tarjeta más abajo.
  const ramosVivos = new Set<string>([
    ...conNosotros.flatMap(s => (s.clase === 'poliza' ? [s.poliza.tipo] : [])),
    ...enCompetencia.map(s => s.poliza.tipo),
    ...yaNoExiste.flatMap(s => (s.clase === 'poliza' ? [s.poliza.tipo] : [])),
    ...(declaradas ?? []).flatMap(d => (d.ramo ? [d.ramo] : [])),
    ...(oportunidades ?? [])
      .filter(o => o.estado === 'perdida' && o.motivoPerdida !== 'error_alta')
      .flatMap(o => (o.ramo ? [o.ramo] : [])),
  ])
  // Quitar la tarjeta de un ramo quita el RAMO: si no, la siguiente más vieja del mismo
  // ramo ocuparía su sitio y «Eliminar» parecería no haber hecho nada.
  const descartadas = [...vivasDescartadas, ...historicas.filter(p => p.leadDescartado)]
  const ramosDescartados = new Set(descartadas.map(p => p.tipo))
  const representante = new Map<string, PolizaFicha>()
  for (const p of historicas) {
    if (p.estado.trim() === 'fin_riesgo' || ramosVivos.has(p.tipo) || ramosDescartados.has(p.tipo)) continue
    const previa = representante.get(p.tipo)
    if (!previa || (p.fechaVencimiento ?? '') > (previa.fechaVencimiento ?? '')) representante.set(p.tipo, p)
  }
  for (const p of representante.values()) {
    enCompetencia.push({ clase: 'poliza', id: p.id, poliza: p, oportunidad: null, historica: true })
  }
  const enTarjeta = new Set([...representante.values()].map(p => p.id))
  const historicasPlegadas = historicas.filter(p => !enTarjeta.has(p.id) && !p.leadDescartado)

  const sueltas: SeguroCliente[] = []
  if (oportunidades) {
    // Las abiertas primero: son las que se enganchan a una póliza perdida del mismo ramo.
    const abiertas = oportunidades.filter(abierta)
    for (const o of abiertas) {
      const hueco = enCompetencia.find(s => s.oportunidad === null && o.ramo !== null && s.poliza.tipo === o.ramo)
      if (hueco) hueco.oportunidad = o
      else sueltas.push({ clase: 'oportunidad', id: o.id, oportunidad: o })
    }
    // Un ramo ya «cubierto» (con nosotros, abierto o con su póliza perdida en pantalla) no
    // repite tarjeta por una perdida vieja: ni la ofrece reintentar (venta ya hecha) ni la
    // da por desaparecida (el riesgo existe). Sin ramo no se puede casar con nada.
    const ramosCubiertos = new Set<string>([
      ...abiertas.flatMap(o => (o.ramo ? [o.ramo] : [])),
      ...enCompetencia.map(s => s.poliza.tipo),
      ...conNosotros.flatMap(s => (s.clase === 'poliza' ? [s.poliza.tipo] : [])),
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
      if (o.ramo !== null && ramosCubiertos.has(o.ramo)) continue
      if (o.motivoPerdida !== null && RIESGO_DESAPARECIDO.has(o.motivoPerdida)) {
        yaNoExiste.push({ clase: 'oportunidad', id: o.id, oportunidad: o })
      } else {
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

  const ordenar = (l: SeguroCliente[]) => l.sort((a, b) => porFecha(fechaDe(a, hoy), fechaDe(b, hoy)))

  return {
    conNosotros: ordenar(conNosotros),
    oportunidades: ordenar([...enCompetencia, ...sueltas, ...aportadas]),
    yaNoExiste,
    historicas: historicasPlegadas,
    descartadas,
    oportunidadesLeidas: oportunidades !== null,
    declaradasLeidas: declaradas !== null,
  }
}

/** Una oportunidad abierta del cliente sin próxima tarea está huérfana: nadie la va a mover. */
export function estaHuerfana(o: OportunidadDeCliente): boolean {
  return abierta(o) && o.proximaTarea === null && o.aparcadaHasta === null
}

