import type { PolizaDeclaradaFicha, PolizaFicha } from '../ficha-asegura'
import type { OportunidadDeCliente } from '../seguimiento-asegura'
import { RAMOS_OPORTUNIDAD, claveMatricula, claveNumeroPoliza } from '@central/module-seguros'

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
      /**
       * La póliza a la que ESTA sustituye (cambio de compañía ya emitido). Va dentro de
       * la tarjeta de la nueva: dos tarjetas del mismo bien se leían como dos seguros.
       */
      sustituye?: PolizaFicha
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
 * El vencimiento de una oportunidad, en TRES estados (Alberto, 30/09/2026): fecha futura conocida
 * (entra por fecha) · fecha pasada · sin fecha. Los dos últimos son «vencimiento desconocido:
 * preguntar al cliente». NUNCA se proyecta ni se inventa una fecha: un 19/11/2017 no es 2027.
 * `ultimaFecha` es solo contexto (lo último que se anotó), no un vencimiento.
 */
export type EstadoVencimiento =
  | { estado: 'futuro'; fecha: string }
  | { estado: 'desconocido'; ultimaFecha: string | null }

/** `YYYY-MM-DD` real (ida y vuelta: un 2026-02-30 no cuenta) o `null`. */
function diaIso(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string') return null
  const dia = iso.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const d = new Date(`${dia}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dia ? null : dia
}

/** Hoy o después = futuro (vence hoy sigue en vigor hoy). */
export function estadoVencimiento(iso: string | null | undefined, hoy: Date): EstadoVencimiento {
  const dia = diaIso(iso)
  if (dia === null) return { estado: 'desconocido', ultimaFecha: null }
  // Hoy de MADRID, como el resto de la ficha: entre 00:00 y 02:00 el día UTC sigue siendo ayer.
  return dia >= hoy.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }) ? { estado: 'futuro', fecha: dia } : { estado: 'desconocido', ultimaFecha: dia }
}

export function fechaFutura(iso: string | null | undefined, hoy: Date): string | null {
  const e = estadoVencimiento(iso, hoy)
  return e.estado === 'futuro' ? e.fecha : null
}

/**
 * El vencimiento que se enseña en la tarjeta de una póliza en Oportunidades: el anotado en su
 * seguimiento MANDA (lo corrige Alberto cuando el escaneo o el volcado traen mal la fecha, y es
 * el que dispara el aviso); sin él, el de la póliza. Solo si es futuro: `fecha: null` = desconocido.
 */
export function vencimientoPoliza(s: Extract<SeguroCliente, { clase: 'poliza' }>, hoy: Date): { fecha: string | null; delSeguimiento: boolean } {
  const anotado = s.oportunidad?.fechaFinVigencia ?? null
  if (anotado) return { fecha: fechaFutura(anotado, hoy), delSeguimiento: true }
  return { fecha: fechaFutura(s.poliza.fechaVencimiento, hoy), delSeguimiento: false }
}

function fechaDe(s: SeguroCliente, hoy: Date): string | null {
  if (s.clase === 'poliza') return s.oportunidad?.proximaTarea?.fechaLimite ?? vencimientoPoliza(s, hoy).fecha
  if (s.clase === 'oportunidad') return s.oportunidad.proximaTarea?.fechaLimite ?? fechaFutura(s.oportunidad.fechaFinVigencia, hoy)
  return fechaFutura(s.declarada.fechaVencimiento, hoy)
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
  // Viva ya sustituida por otra (cambio de compañía emitido): se pinta DENTRO de la nueva.
  const sustituidas: PolizaFicha[] = []

  for (const p of polizas) {
    if (!p.viva) { historicas.push(p); continue }
    const estado = p.estado.trim()
    if (p.sustituida && !PERDIDA_A_COMPETENCIA.has(estado) && estado !== 'fin_riesgo') { sustituidas.push(p); continue }
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
  for (const v of sustituidas) {
    const nueva = conNosotros.find(s => s.clase === 'poliza' && s.poliza.sustituyeA === v.id && !s.sustituye)
    // Sin la nueva a la vista (otra ficha, o ya no viva) la vieja se queda con nosotros:
    // cubre hasta su vencimiento, y su tarjeta dice que está sustituida.
    if (nueva && nueva.clase === 'poliza') nueva.sustituye = v
    else conNosotros.push({ clase: 'poliza', id: v.id, poliza: v, oportunidad: null })
  }

  // El volcado histórico es «otro seguro conocido»: se pinta como oportunidad DERIVADA (no se
  // escribe en la tabla de oportunidades). Una por BIEN —el mismo coche repetido con otra
  // prima es un solo seguro—, la de vencimiento más reciente. No sale si de ese bien ya
  // sabemos algo más nuevo: una póliza viva (con nosotros, perdida o en `fin_riesgo`), una
  // aportada desde el portal, una oportunidad PERDIDA sin datos con que casarla (misma regla
  // por ramo de siempre) o CUALQUIER oportunidad (abierta, ganada o perdida) de ese mismo
  // riesgo —matrícula o nº de póliza—: la derivada duplicaría a la real.
  // Las abiertas SIN esos datos no bloquean: se enganchan a esta tarjeta más abajo.
  const coberturas: Bien[] = [
    ...conNosotros.flatMap(s => (s.clase === 'poliza' ? [bienDe(s.poliza)] : [])),
    ...enCompetencia.map(s => bienDe(s.poliza)),
    ...sustituidas.map(bienDe),
    ...yaNoExiste.flatMap(s => (s.clase === 'poliza' ? [bienDe(s.poliza)] : [])),
    ...(declaradas ?? []).flatMap(d => (d.ramo ? [{ tipo: d.ramo, matricula: claveMatricula(d.matricula), titulo: null }] : [])),
    ...(oportunidades ?? [])
      .filter(o => o.estado === 'perdida' && o.motivoPerdida !== 'error_alta' && !tieneClaves(o))
      .flatMap(o => (o.ramo ? [{ tipo: o.ramo, matricula: null, titulo: null }] : [])),
  ]
  // Quitar la tarjeta de un bien quita ese bien: si no, la siguiente más vieja del mismo
  // ramo ocuparía su sitio y «Eliminar» parecería no haber hecho nada.
  const descartadas = [...vivasDescartadas, ...historicas.filter(p => p.leadDescartado)]
  const bienesDescartados = descartadas.map(bienDe)
  // Agrupar: primero los que TIENEN matrícula o título (esos sí se distinguen); una fila sin
  // ninguno de los dos solo se une si el ramo tiene UN único grupo identificado. Con varios
  // (o ninguno) queda como grupo propio: no puede ser «el mismo» de dos coches a la vez.
  const grupos: { rep: PolizaFicha; filas: PolizaFicha[] }[] = []
  const filas = historicas
    .filter(p => !p.leadDescartado && p.estado.trim() !== 'fin_riesgo')
    // La más reciente primero; sin fecha, al final.
    .sort((x, y) => (y.fechaVencimiento ?? '').localeCompare(x.fechaVencimiento ?? ''))
  for (const p of filas.filter(p => identificado(bienDe(p)))) {
    const g = grupos.find(g => g.filas.some(f => casaBien(bienDe(f), bienDe(p)) === 'si'))
    if (g) g.filas.push(p)
    else grupos.push({ rep: p, filas: [p] })
  }
  for (const p of filas.filter(p => !identificado(bienDe(p)))) {
    const delRamo = grupos.filter(g => g.rep.tipo === p.tipo)
    const propio = delRamo.find(g => g.filas.every(f => !identificado(bienDe(f))))
    const g = delRamo.length === 1 && identificado(bienDe(delRamo[0].rep)) ? delRamo[0] : propio
    if (g) g.filas.push(p)
    else grupos.push({ rep: p, filas: [p] })
  }
  // ¿Esta cobertura/descarte tapa a este grupo? Con bien identificado, solo su bien; sin él,
  // solo si es la ÚNICA candidata del ramo (si hay varias, no se sabe cuál es y no oculta ninguna).
  const tapa = (c: Bien, g: { filas: PolizaFicha[] }) => {
    const r = g.filas.map(f => casaBien(c, bienDe(f)))
    if (r.includes('si')) return true
    return r.includes('quiza') && grupos.filter(x => x.rep.tipo === g.filas[0].tipo).length === 1
  }
  const visibles = grupos.filter(g => !coberturas.some(c => tapa(c, g)) && !bienesDescartados.some(d => tapa(d, g)))
  const reales = (oportunidades ?? []).filter(o => !(o.estado === 'perdida' && o.motivoPerdida === 'error_alta'))
  const representante = visibles
    .filter(g => !reales.some(o => (o.ramo === null || o.ramo === g.rep.tipo) && g.filas.some(f => mismoRiesgo(o, f))))
    .map(g => g.rep)
  for (const p of representante) {
    enCompetencia.push({ clase: 'poliza', id: p.id, poliza: p, oportunidad: null, historica: true })
  }
  const enTarjeta = new Set(representante.map(p => p.id))
  const historicasPlegadas = historicas.filter(p => !enTarjeta.has(p.id) && !p.leadDescartado)

  const sueltas: SeguroCliente[] = []
  if (oportunidades) {
    // Las abiertas primero: son las que se enganchan a una póliza perdida del mismo ramo.
    const abiertas = oportunidades.filter(abierta)
    // Las que cuelgan de una póliza concreta, antes: si no, una sin póliza del mismo ramo podría
    // quedarse la tarjeta de esa póliza y la suya acabaría suelta.
    const enOrden = [...abiertas.filter(o => o.polizaId != null), ...abiertas.filter(o => o.polizaId == null)]
    for (const o of enOrden) {
      // Mismo ramo no basta: dos matrículas distintas son dos coches, y engancharla pintaba
      // el Ford Mondeo de Pelayo de 2015 en vez del Kalos de MUSSAP (Rafael Campa,
      // 28/09/2026). Solo la matrícula: la compañía y el nº de la oportunidad son los de la
      // competencia y difieren de los de nuestra póliza perdida aunque sea el mismo seguro.
      // La que cuelga de una póliza concreta (renovación, o abierta al anotarle el vencimiento)
      // va a SU tarjeta: con dos del mismo ramo, casar por ramo la pintaría en la otra.
      const hueco = enCompetencia.find(s => s.oportunidad === null && o.polizaId != null && s.poliza.id === o.polizaId)
        ?? enCompetencia.find(s => s.oportunidad === null && o.ramo !== null && s.poliza.tipo === o.ramo
          && !otraMatricula(o.matricula, s.poliza.matricula))
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

/** Lo que identifica un seguro: ramo, matrícula y título del bien. Lo que falta no contradice. */
type Bien = { tipo: string; matricula: string | null; titulo: string | null }

function bienDe(p: PolizaFicha): Bien {
  const t = (p.objeto?.titulo ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return { tipo: p.tipo, matricula: claveMatricula(p.matricula), titulo: t === '' ? null : t }
}

const identificado = (b: Bien) => b.matricula !== null || b.titulo !== null

/** ¿Es el mismo bien? `quiza` = mismo ramo pero sin dato común con que compararlos. */
function casaBien(a: Bien, b: Bien): 'si' | 'no' | 'quiza' {
  if (a.tipo !== b.tipo) return 'no'
  if (a.matricula && b.matricula) return a.matricula === b.matricula ? 'si' : 'no'
  if (a.titulo && b.titulo) return a.titulo === b.titulo ? 'si' : 'no'
  return 'quiza'
}

function tieneClaves(o: OportunidadDeCliente): boolean {
  return claveMatricula(o.matricula) !== null || claveNumeroPoliza(o.numeroPoliza) !== null
}

/** El MISMO riesgo, por matrícula o nº de póliza (la compañía no basta: cambia al competir). */
function mismoRiesgo(o: OportunidadDeCliente, p: PolizaFicha): boolean {
  const m = claveMatricula(o.matricula), n = claveNumeroPoliza(o.numeroPoliza)
  return (m !== null && m === claveMatricula(p.matricula)) || (n !== null && n === claveNumeroPoliza(p.numeroPoliza))
}

function otraMatricula(a: string | null, b: string | null): boolean {
  const x = claveMatricula(a), y = claveMatricula(b)
  return x !== null && y !== null && x !== y
}

/** Una oportunidad abierta del cliente sin próxima tarea está huérfana: nadie la va a mover. */
export function estaHuerfana(o: OportunidadDeCliente): boolean {
  return abierta(o) && o.proximaTarea === null && o.aparcadaHasta === null
}


/**
 * Los SEGUROS del cliente = lo «con nosotros» (póliza en cartera en vigor, o emitida y pendiente
 * de CIMA), con la póliza que sustituyen dentro. Es lo ÚNICO que cuenta en «Pólizas vivas»,
 * recibos, próximo aviso y ramos contratados: las filas del volcado y lo que ya no cubre son
 * oportunidades, no seguros.
 */
export function segurosDeReparto(r: RepartoSeguros): PolizaFicha[] {
  return r.conNosotros.flatMap(s => (s.clase === 'poliza' ? [s.poliza, ...(s.sustituye ? [s.sustituye] : [])] : []))
}

/**
 * Cuántas oportunidades hay que trabajar: las abiertas, las derivadas de pólizas de otras casas
 * (volcado, canceladas) y lo que aportó el cliente. Una perdida que se reintentará al vencimiento
 * no es «abierta». `null` = no se pudieron leer las oportunidades: el número sería un suelo, no se dice.
 */
export function contarOportunidades(r: RepartoSeguros): number | null {
  if (!r.oportunidadesLeidas) return null
  return r.oportunidades.filter(s => !(s.clase === 'oportunidad' && !abierta(s.oportunidad))).length
}

/** Con qué se precarga el alta de una oportunidad creada desde una fila del volcado. */
export type PrecargaAlta = {
  ramo: string
  aseguradora: string
  numeroPoliza: string | null
  matricula: string | null
  vehiculo: string | null
  /** SOLO si es futura: una fecha pasada del volcado no se propone. */
  fechaFinVigencia: string | null
  /** La fecha del volcado ya pasó: el formulario avisa de que hay que preguntar al cliente. */
  fechaObsoleta: string | null
}

export function precargaAlta(p: PolizaFicha, hoy: Date): PrecargaAlta {
  const v = estadoVencimiento(p.fechaVencimiento, hoy)
  return {
    // Un ramo que el alta no admite queda vacío (coherente con el select: «Elige…»).
    ramo: (RAMOS_OPORTUNIDAD as readonly string[]).includes(p.tipo) ? p.tipo : '',
    aseguradora: p.aseguradora,
    numeroPoliza: p.numeroPoliza,
    matricula: p.matricula,
    vehiculo: p.objeto?.titulo ?? null,
    fechaFinVigencia: v.estado === 'futuro' ? v.fecha : null,
    fechaObsoleta: v.estado === 'desconocido' ? v.ultimaFecha : null,
  }
}
