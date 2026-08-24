// ────────────────────────────────────────────────────────────────────────────
// VEREDICTO de una subasta: el titular «interesa / no interesa / faltan datos»
// que Alberto pidió el 24/08/2026 («que me haga una especie de resumen: no
// interesa, o sí interesa»). Módulo PURO: la UI le pasa lo que ya sabe y aquí
// solo se DECIDE — los números salen de `calcularCoste` y
// `pujaMaximaParaDescuento`, nunca se inventan.
//
// La asimetría es deliberada y es la regla de la casa:
//  · 🔴 «no interesa» SÍ se puede afirmar con datos incompletos, porque toda
//    pieza que falte (cargas sin leer, valor orientativo a la baja NO — ver
//    abajo) solo puede EMPEORAR el resultado: si ni pujando 0€ sale el
//    descuento objetivo sin contar las cargas, con ellas sale peor.
//  · 🟢 «interesa» hay que GANÁRSELO: exige valor de mercado real (no una
//    estimación por €/m² de zona) y cargas resueltas — un «interesa» sobre un
//    coste al que le faltan las cargas es la mentira cara.
//  · 🟠 «faltan datos» dice EXACTAMENTE cuáles, porque cada uno manda a un
//    sitio distinto (subir la certificación, conseguir los m², esperar
//    comparables) — un «no se sabe» sin el qué no sirve para nada.
// ────────────────────────────────────────────────────────────────────────────
import { calcularCoste, pujaMaximaParaDescuento } from './costes.ts'
import { estadoCargas, type EntradaEstadoCargas, type EstadoCargas } from './cargas.ts'
import type { ParamsCoste, SubastaInmueble } from './types.ts'

export interface EntradaVeredicto {
  s: SubastaInmueble
  /** Valor de mercado que ya calculó el radar (tasación > valor de referencia > comparables). */
  valorMercado: number | null
  /** `true` = ese valor sale de la mediana de un municipio grande: orienta, no tasa. */
  valorOrientativo?: boolean
  /** Estado de las cargas, con lo mismo que ya consume `titularCargas`. */
  cargas: EntradaEstadoCargas
  /** Plan B para ESTIMAR el valor cuando el radar no lo trae: m² × €/m² de zona. */
  superficie?: number | null
  precioM2Zona?: number | null
  cerrada?: boolean
  params?: ParamsCoste
  /** Descuento real objetivo sobre el valor de mercado (default 25%). */
  descuentoObjetivo?: number
}

export type NivelVeredicto = 'interesa' | 'no_interesa' | 'faltan_datos' | 'cerrada'

export interface Veredicto {
  nivel: NivelVeredicto
  emoji: '🟢' | '🔴' | '🟠' | '⚫'
  titular: string
  /** Techo de puja para el descuento objetivo. `null` = ni pujando 0€ sale. */
  hastaPuja: number | null
  /** Descuento real pujando el TIPO entero (coste total vs valor). */
  descuentoAlTipo: number | null
  /** El valor sobre el que se decidió, y si fue una estimación por €/m². */
  valorUsado: number | null
  valorEstimado: boolean
  razones: string[]
  /** Qué falta para poder afirmar, pieza a pieza. */
  faltan: string[]
}

/** Estados de cargas con los que el coste real está COMPLETO. */
const CARGAS_RESUELTAS: EstadoCargas[] = ['sin_cargas', 'subsisten']

const eur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
const pct = (x: number) => `${Math.round(x * 100)}%`

/** Por qué las cargas no están resueltas, en el recado corto de cada estado. */
function motivoCargas(estado: EstadoCargas): string {
  switch (estado) {
    case 'sin_cuantificar':
      return 'constan cargas pero sin importe — el coste real está incompleto'
    case 'publicadas_sin_extraer':
      return 'la certificación está publicada pero sin leer — ábrela o súbela a la ficha'
    case 'ocultas_tras_login':
      return 'el Portal esconde los documentos — bájalos con tu sesión y súbelos a la ficha'
    case 'ocultas_pese_a_sesion':
      return 'ni con sesión las publica el Portal — pide la certificación al Registro'
    case 'no_publicadas':
      return 'no publicadas — pide la certificación registral'
    default:
      return 'sin revisar todavía'
  }
}

export function veredicto(e: EntradaVeredicto): Veredicto {
  const vacio = {
    hastaPuja: null as number | null,
    descuentoAlTipo: null as number | null,
    valorUsado: null as number | null,
    valorEstimado: false,
    razones: [] as string[],
    faltan: [] as string[],
  }
  if (e.cerrada) {
    return { nivel: 'cerrada', emoji: '⚫', titular: 'Subasta cerrada: ya no se puede pujar.', ...vacio }
  }

  const cargasEst = estadoCargas(e.cargas).estado
  const cargasResueltas = CARGAS_RESUELTAS.includes(cargasEst)
  const faltan: string[] = []
  if (!cargasResueltas) faltan.push(`las CARGAS: ${motivoCargas(cargasEst)}`)

  // El valor que decide. Sin el del radar, se ESTIMA por m² × €/m² de zona —
  // marcado siempre: una estimación nunca sostiene un 🟢 ni un 🔴.
  let valor = e.valorMercado
  let estimado = false
  if (valor == null && (e.superficie ?? 0) > 0 && (e.precioM2Zona ?? 0) > 0) {
    valor = e.superficie! * e.precioM2Zona!
    estimado = true
  }

  if (valor == null) {
    faltan.unshift('el VALOR DE MERCADO: sin tasación, sin valor de referencia del Catastro y sin comparables de la zona')
    if ((e.superficie ?? 0) <= 0) {
      faltan.push(
        (e.precioM2Zona ?? 0) > 0
          ? `los m² del inmueble — con ellos, los ~${Math.round(e.precioM2Zona!).toLocaleString('es-ES', { useGrouping: 'always' })}€/m² de la zona darían al menos una referencia`
          : 'los m² del inmueble',
      )
    }
    return {
      nivel: 'faltan_datos',
      emoji: '🟠',
      titular: 'Sin veredicto posible todavía: falta la cifra que lo decide.',
      ...vacio,
      faltan,
    }
  }

  const objetivo = e.descuentoObjetivo ?? 0.25
  const params = e.params ?? {}
  const tieneTipo = e.s.valorSubasta != null && e.s.valorSubasta > 0
  const descuentoAlTipo = tieneTipo ? 1 - calcularCoste(e.s, null, params).total / valor : null
  const pm = pujaMaximaParaDescuento(e.s, valor, objetivo, params)

  const razones: string[] = []
  if (estimado) {
    razones.push(
      `Valor ESTIMADO: ${e.superficie} m² × ~${Math.round(e.precioM2Zona!).toLocaleString('es-ES', { useGrouping: 'always' })}€/m² de la zona ≈ ${eur(valor)} — orienta, no tasa.`,
    )
  } else if (e.valorOrientativo) {
    razones.push('El valor de mercado es orientativo (mediana de municipio grande): afina con comparables antes de pujar fuerte.')
  }
  if (descuentoAlTipo != null) {
    razones.push(
      descuentoAlTipo > 0
        ? `Pujando el tipo entero, el coste real deja un descuento del ${pct(descuentoAlTipo)} sobre el valor.`
        : `Pujando el tipo entero, el coste real YA supera el valor (${pct(-descuentoAlTipo)} por encima).`,
    )
  }
  // El «¿es un chollo de verdad?» depende de quién más puja. El ejecutante
  // puede pujar HASTA la deuda reclamada sin desembolso real (se la cobra a sí
  // mismo): un techo por debajo de esa cifra compite contra dinero gratis.
  if (pm.importe != null && (e.s.cantidadReclamada ?? 0) > 0) {
    razones.push(
      pm.importe < e.s.cantidadReclamada!
        ? `⚠️ Tu techo queda por debajo de la deuda reclamada (${eur(e.s.cantidadReclamada!)}): hasta ahí el ejecutante puede sobrepujarte sin gastar un euro.`
        : `Tu techo supera la deuda reclamada (${eur(e.s.cantidadReclamada!)}): a partir de esa cifra el ejecutante ya puja con dinero real — más opciones de que el chollo se quede.`,
    )
  }
  if (e.s.situacionPosesoria === 'ocupada') {
    razones.push('⚠️ Consta OCUPADA: al coste y al plazo súmales el lanzamiento.')
  }
  razones.push(...pm.notas)

  const base = { ...vacio, hastaPuja: pm.importe, descuentoAlTipo, valorUsado: valor, valorEstimado: estimado, razones, faltan }

  // 🔴 afirmable aunque falten piezas: lo que falta solo puede empeorarlo.
  // …salvo que el propio valor sea una estimación: una estimación corta de m²
  // o de €/m² mataría en falso una subasta buena, así que con valor estimado
  // el techo se enseña pero no se sentencia.
  if (!estimado && pm.importe == null) {
    return {
      ...base,
      nivel: 'no_interesa',
      emoji: '🔴',
      titular: `No interesa: ni pujando 0€ sale un ${pct(objetivo)} de descuento real — los costes fijos${cargasResueltas ? ' y las cargas' : ''} se lo comen.`,
    }
  }
  if (!estimado && pm.admisible === false) {
    return {
      ...base,
      nivel: 'no_interesa',
      emoji: '🔴',
      titular: `No interesa: para lograr un ${pct(objetivo)} de descuento habría que quedarse por debajo de la puja mínima.`,
    }
  }

  if (estimado || !cargasResueltas) {
    const pendiente = [
      estimado ? 'el valor es una estimación por €/m²' : null,
      !cargasResueltas ? 'las cargas están sin confirmar' : null,
    ].filter(Boolean).join(' y ')
    return {
      ...base,
      nivel: 'faltan_datos',
      emoji: '🟠',
      titular:
        pm.importe != null
          ? `Los números apuntan bien — hasta ${eur(pm.importe)} habría ≥${pct(objetivo)} de descuento real — pero ${pendiente}: resuélvelo antes de decidir.`
          : `Los números NO salen con lo que se sabe, pero ${pendiente}: resuélvelo antes de descartarla.`,
    }
  }

  return {
    ...base,
    nivel: 'interesa',
    emoji: '🟢',
    titular: `Interesa pujando hasta ${eur(pm.importe!)}: por debajo, la compra sale con ≥${pct(objetivo)} de descuento real, con todos los costes y cargas dentro.`,
  }
}
