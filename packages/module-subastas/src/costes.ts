// ────────────────────────────────────────────────────────────────────────────
// Coste REAL de quedarse un inmueble subastado ("precio puerta abierta"). PURO.
//
// El descuento sobre tasación que pinta cualquier portal es ficción: lo que
// determina si una subasta es negocio es el remate MÁS todo lo que arrastra.
// La partida que más gente arruina es el impuesto de transmisión, porque desde
// enero de 2022 la base imponible de una adjudicación en subasta judicial NO es
// el precio de remate, sino el VALOR DE REFERENCIA del Catastro cuando es mayor:
// se puede rematar en 60.000 € y tributar sobre 110.000 €.
//
// Todo son ESTIMACIONES informativas, no asesoramiento fiscal: cada supuesto
// deja su aviso legible en `avisos` para que se vea de dónde sale cada euro.
// ────────────────────────────────────────────────────────────────────────────

import type { CosteAdquisicion, ParamsCoste, SubastaInmueble } from './types.ts'
import { deudaComunidadEstimada } from './comunidad.ts'
import { costeFinanciacion } from './financiacion.ts'
import { MIN_MUESTRA_CALIBRACION } from './adjudicaciones.ts'
import { umbralesPuja } from './umbrales.ts'
import { itpGeneral } from './impuestos.ts'

/** Porcentaje del valor de subasta que hay que consignar para poder pujar. */
export const PCT_DEPOSITO = 0.05

/** Los parámetros que SIEMPRE tienen valor por defecto (los opcionales no). */
type ParamsBase = Required<
  Omit<ParamsCoste, 'financiacion' | 'estimarComunidad' | 'aniosImpagoComunidad' | 'cuotaComunidadMensual'>
>

/**
 * Parámetros por defecto para Andalucía (2026). Los tipos impositivos son los
 * vigentes; el resto son órdenes de magnitud conservadores y sobreescribibles.
 */
export const PARAMS_ANDALUCIA: ParamsBase = {
  tipoItp: 0.07,   // tipo general de ITP en Andalucía
  tipoIva: 0.21,   // cuando el ejecutado es persona jurídica
  tipoAjd: 0.012,  // AJD, acompaña al IVA
  notariaRegistro: 1200,
  cancelacionCargas: 600,
  plusvaliaMunicipal: 0,
  comunidadPendiente: 0,
  ibiPendiente: 0,
  lanzamiento: 0,
}

/** Coste estimado de recuperar la posesión de un inmueble ocupado. */
export const LANZAMIENTO_ESTIMADO = 6000

/** Lo que hay que consignar para pujar en una subasta. */
export function deposito(valorSubasta: number | null | undefined, pct = PCT_DEPOSITO): number | null {
  if (valorSubasta == null || !Number.isFinite(valorSubasta) || valorSubasta <= 0) return null
  return redondear(valorSubasta * pct)
}

/**
 * Calcula el coste puerta abierta.
 *
 * @param s       la subasta ya normalizada
 * @param remate  precio de adjudicación a simular; por defecto el valor de subasta
 * @param params  parámetros de coste (por defecto, Andalucía)
 */
export function calcularCoste(
  s: SubastaInmueble,
  remate?: number | null,
  params: ParamsCoste = {},
): CosteAdquisicion {
  const p = { ...PARAMS_ANDALUCIA, ...params }
  const avisos: string[] = []

  // ── ITP por comunidad autónoma ────────────────────────────────────────────
  // Si el caller no fija el tipo, manda la CCAA de la provincia del bien: el
  // 7% andaluz aplicado a una subasta de Asturias (8%) era un coste plausible
  // y mal. Sin provincia reconocida se queda el default y se avisa igual.
  // Con ejecutado empresa no aplica: esa adjudicación va por IVA + AJD.
  if (params.tipoItp == null && s.ejecutado !== 'juridica') {
    const itp = itpGeneral(s.provincia)
    if (itp != null) {
      p.tipoItp = itp.tipo
      if (itp.progresivo) {
        avisos.push(
          `ITP al ${pct(itp.tipo)} (primer tramo de la escala de ${itp.ccaa}): en importes altos el tipo real sube — confírmalo antes de pujar.`,
        )
      } else if (itp.ccaa !== 'Andalucía') {
        avisos.push(`ITP al ${pct(itp.tipo)} (tipo general de ${itp.ccaa}). Los tipos reducidos van aparte.`)
      }
    } else if (s.provincia) {
      avisos.push(`Provincia «${s.provincia}» sin CCAA reconocida: el ITP se asume al ${pct(p.tipoItp)} (Andalucía).`)
    }
  }

  const precio = remate ?? s.valorSubasta ?? 0
  if (precio <= 0) avisos.push('Sin valor de subasta publicado: el cálculo parte de 0 €.')

  const cargasPreferentes = s.cargas ?? 0
  if (s.cargasConocidas === false) {
    avisos.push('Las cargas NO están publicadas: pueden sumarse cargas anteriores que no se cancelan.')
  }

  // ── Impuesto de transmisión ───────────────────────────────────────────────
  // Base imponible: el mayor entre lo rematado y el valor de referencia catastral.
  const valorRef = s.valorReferencia ?? null
  const baseImponible = valorRef != null && valorRef > precio ? valorRef : precio
  if (valorRef != null && valorRef > precio) {
    avisos.push(
      `El impuesto se calcula sobre el valor de referencia del Catastro (${formatearEur(valorRef)}), ` +
        `no sobre el remate (${formatearEur(precio)}).`,
    )
  } else if (valorRef == null) {
    avisos.push('Sin valor de referencia del Catastro: el impuesto se estima sobre el remate y puede quedarse corto.')
  }

  let impuestoTransmision: number
  let impuestoConcepto: string
  if (s.ejecutado === 'juridica') {
    // Adjudicación de bienes de una empresa: va por IVA + AJD, no por ITP.
    impuestoTransmision = redondear(baseImponible * (p.tipoIva + p.tipoAjd))
    impuestoConcepto = `IVA ${pct(p.tipoIva)} + AJD ${pct(p.tipoAjd)}`
    avisos.push(
      'El ejecutado es una empresa: la operación tributa por IVA + AJD. Si es vivienda el IVA puede ser del 10%, ' +
        'y hay supuestos de exención con renuncia — confírmalo antes de pujar.',
    )
  } else {
    impuestoTransmision = redondear(baseImponible * p.tipoItp)
    impuestoConcepto = `ITP ${pct(p.tipoItp)}`
    if (s.ejecutado !== 'fisica') {
      avisos.push('No consta si el ejecutado es persona física o empresa: se asume ITP. Si fuera empresa, iría por IVA + AJD.')
    }
  }

  // ── Posesión ──────────────────────────────────────────────────────────────
  let lanzamiento = p.lanzamiento
  if (lanzamiento === 0 && (s.situacionPosesoria === 'ocupada' || s.situacionPosesoria === 'ocupada_desconocida')) {
    lanzamiento = LANZAMIENTO_ESTIMADO
    avisos.push(`Inmueble ocupado o de posesión dudosa: se estiman ${formatearEur(LANZAMIENTO_ESTIMADO)} de lanzamiento.`)
  }

  // ── Comunidad de propietarios (art. 9.1.e LPH) ────────────────────────────
  // Nadie publica lo que el ejecutado debe a su comunidad, y el comprador lo
  // hereda: sin estimarlo, el coste puerta abierta se queda sistemáticamente
  // corto en pisos, locales, garajes y trasteros.
  let comunidadPendiente = p.comunidadPendiente
  if (comunidadPendiente === 0 && p.estimarComunidad !== false) {
    const deuda = deudaComunidadEstimada({
      tipoBien: s.tipoBien ?? null,
      superficie: s.superficie ?? null,
      aniosImpago: p.aniosImpagoComunidad ?? null,
      cuotaMensual: p.cuotaComunidadMensual ?? null,
    })
    if (deuda.importe != null) comunidadPendiente = deuda.importe
    avisos.push(deuda.nota)
  } else if (comunidadPendiente === 0) {
    avisos.push('No se han incluido derramas de comunidad pendientes: se heredan el año en curso y los 3 anteriores.')
  }

  if (p.plusvaliaMunicipal === 0) {
    avisos.push('No se ha incluido la plusvalía municipal (corresponde al ejecutado, pero conviene confirmarlo).')
  }

  const subtotal = redondear(
    precio +
      cargasPreferentes +
      impuestoTransmision +
      p.notariaRegistro +
      p.cancelacionCargas +
      p.plusvaliaMunicipal +
      comunidadPendiente +
      p.ibiPendiente +
      lanzamiento,
  )

  // ── Coste del dinero ──────────────────────────────────────────────────────
  // Solo si se declara cómo se financia: inventar un puente que igual no existe
  // falsearía el coste tanto como ignorarlo. El desembolso a financiar es lo
  // que falta por poner, ya descontado el depósito consignado para pujar.
  let costeDinero = 0
  if (p.financiacion) {
    const consignado = deposito(s.valorSubasta) ?? 0
    const f = costeFinanciacion(Math.max(0, subtotal - consignado), p.financiacion)
    costeDinero = f.total
    if (costeDinero > 0) avisos.push(f.nota)
  }

  const total = redondear(subtotal + costeDinero)

  return {
    remate: redondear(precio),
    cargasPreferentes: redondear(cargasPreferentes),
    impuestoTransmision,
    baseImponible: redondear(baseImponible),
    impuestoConcepto,
    notariaRegistro: p.notariaRegistro,
    cancelacionCargas: p.cancelacionCargas,
    plusvaliaMunicipal: p.plusvaliaMunicipal,
    comunidadPendiente: redondear(comunidadPendiente),
    ibiPendiente: p.ibiPendiente,
    lanzamiento,
    costeFinanciacion: costeDinero,
    total,
    avisos,
  }
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

function pct(x: number): string {
  return `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })}%`
}

// Formato español (2.162,49 €) para los avisos. La UI usa el helper `eur()` de
// la app; aquí se replica porque el módulo es puro y no importa nada de fuera.
function formatearEur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

/** Puja máxima calculada, con su viabilidad legal al lado (tres estados). */
export interface PujaMaxima {
  /** Techo económico (bisección + tramo). `null` si ni pujando 0 hay descuento. */
  importe: number | null
  /** ¿Alcanza la puja mínima publicada? `null` = sin puja mínima que comprobar. */
  admisible: boolean | null
  /** ¿Llega al umbral de aprobación automática (70% LEC / 50% RGR)? `null` = sin régimen o sin tipo. */
  aprobacionDirecta: boolean | null
  notas: string[]
}

/**
 * Puja MÁXIMA para que la adquisición salga con al menos `descuentoObjetivo`
 * de descuento real sobre `valorMercado` — con el coste puerta abierta entero
 * dentro, no solo el remate.
 *
 * Se resuelve por bisección sobre `calcularCoste` (así hereda TODA la lógica
 * fiscal, incluida la base imponible por valor de referencia, sin duplicarla)
 * y se alinea hacia abajo al tramo de puja si la subasta los publica.
 * `importe: null` si ni pujando 0 se alcanza el objetivo (las cargas/impuestos
 * fijos ya se comen el descuento).
 *
 * El importe NO se sube hasta la puja mínima ni hasta un umbral legal (eso
 * violaría el descuento objetivo en silencio): si queda por debajo se marca
 * `admisible: false` / `aprobacionDirecta: false` con su nota.
 */
export function pujaMaximaParaDescuento(
  s: SubastaInmueble,
  valorMercado: number,
  descuentoObjetivo = 0.25,
  params: ParamsCoste = {},
): PujaMaxima {
  return valorarPuja(s, pujaBiseccion(s, valorMercado, descuentoObjetivo, params))
}

function pujaBiseccion(
  s: SubastaInmueble,
  valorMercado: number,
  descuentoObjetivo: number,
  params: ParamsCoste,
): number | null {
  if (!(valorMercado > 0) || descuentoObjetivo <= 0 || descuentoObjetivo >= 1) return null
  const costeMax = valorMercado * (1 - descuentoObjetivo)

  const coste = (remate: number) => calcularCoste(s, remate, params).total
  if (coste(0) > costeMax) return null

  let lo = 0
  let hi = valorMercado * 2
  if (coste(hi) <= costeMax) return alinearATramo(hi, s)
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (coste(mid) <= costeMax) lo = mid
    else hi = mid
  }
  const puja = Math.floor(lo)
  return puja > 0 ? alinearATramo(puja, s) : null
}

/** Contrasta un techo de puja contra la puja mínima y los umbrales legales. */
function valorarPuja(s: SubastaInmueble, importe: number | null): PujaMaxima {
  const notas: string[] = []
  if (importe == null) return { importe, admisible: null, aprobacionDirecta: null, notas }

  const pujaMinima = s.pujaMinima ?? null
  let admisible: boolean | null = null
  if (pujaMinima != null) {
    admisible = pujaMinima === 0 || importe >= pujaMinima
    if (!admisible) {
      notas.push(
        `El techo queda por debajo de la puja mínima (${formatearEur(pujaMinima)}): ` +
          'con este objetivo de descuento no se puede pujar en esta subasta.',
      )
    }
  }

  const u = umbralesPuja(s)
  const directa = u.umbrales.find((x) => x.clave === 'aprobacion_directa') ??
    (u.regimen === 'administrativa' ? u.umbrales.find((x) => x.clave === 'suelo_laj') : undefined)
  let aprobacionDirecta: boolean | null = null
  if (directa != null) {
    aprobacionDirecta = importe >= directa.importe
    if (!aprobacionDirecta) {
      notas.push(
        u.regimen === 'judicial'
          ? 'El remate no sería de aprobación automática (art. 670 LEC): el ejecutado puede presentar mejor postor en 10 días.'
          : 'Por debajo del 50% del tipo: la adjudicación queda a criterio de la Mesa (RGR).',
      )
      const sueloLaj = u.umbrales.find((x) => x.clave === 'suelo_laj')
      const deuda = u.cantidadReclamada
      if (
        u.regimen === 'judicial' && sueloLaj != null && importe < sueloLaj.importe &&
        (deuda == null || importe < deuda)
      ) {
        notas.push('Por debajo del 50% del tipo y sin cubrir la deuda: la aprobación sería discrecional del LAJ.')
      }
    }
  }

  return { importe, admisible, aprobacionDirecta, notas }
}

// ── Escenarios de coste informativos ─────────────────────────────────────────
// El coste por defecto (y el score) simulan el remate al 100% de la salida — el
// estado conservador. Estos escenarios enseñan cuánto costaría rematar a los
// niveles donde de verdad se adjudican las subastas, sin tocar el score.

export interface EscenarioCoste {
  origen: 'aprobacion_directa' | 'mediana_provincial'
  /** Fracción del valor de subasta a la que se simula el remate. */
  pct: number
  remate: number
  total: number
  etiqueta: string
}

export function escenariosCoste(
  s: SubastaInmueble,
  params: ParamsCoste = {},
  medianaProvincial?: { ratio: number; muestraRatio: number; provincia: string } | null,
): EscenarioCoste[] {
  const v = s.valorSubasta
  if (v == null || v <= 0 || s.tipo === 'venta_adjudicado') return []

  const escenarios: EscenarioCoste[] = []
  const u = umbralesPuja(s)
  const directa = u.umbrales.find((x) => x.clave === 'aprobacion_directa') ??
    (u.regimen === 'administrativa' ? u.umbrales.find((x) => x.clave === 'suelo_laj') : undefined)
  if (directa?.pct != null) {
    const remate = directa.importe
    escenarios.push({
      origen: 'aprobacion_directa',
      pct: directa.pct,
      remate,
      total: calcularCoste(s, remate, params).total,
      etiqueta:
        `Si se rematara al ${Math.round(directa.pct * 100)}% del tipo (${formatearEur(remate)}, ` +
        `umbral de aprobación ${u.regimen === 'judicial' ? 'automática, art. 670 LEC' : 'de la Mesa, RGR'})`,
    })
  }

  if (
    medianaProvincial != null && medianaProvincial.ratio > 0 &&
    medianaProvincial.muestraRatio >= MIN_MUESTRA_CALIBRACION
  ) {
    const remate = redondear(v * medianaProvincial.ratio)
    escenarios.push({
      origen: 'mediana_provincial',
      pct: medianaProvincial.ratio,
      remate,
      total: calcularCoste(s, remate, params).total,
      etiqueta:
        `Si se rematara al ${Math.round(medianaProvincial.ratio * 100)}% del tipo (${formatearEur(remate)}, ` +
        `mediana real de ${medianaProvincial.provincia} sobre ${medianaProvincial.muestraRatio} adjudicaciones)`,
    })
  }

  return escenarios
}

/** El portal solo acepta pujas en tramos desde el valor de salida: se alinea hacia abajo. */
function alinearATramo(puja: number, s: SubastaInmueble): number {
  const salida = s.valorSubasta
  const tramo = s.tramos
  if (salida == null || tramo == null || tramo <= 0 || puja <= salida) return puja
  return redondear(salida + Math.floor((puja - salida) / tramo) * tramo)
}

// ── Rentabilidad como alojamiento turístico, con datos PROPIOS ───────────────

export interface YieldTuristico {
  /** Ingreso anual neto estimado si rindiera como los pisos de referencia. */
  ingresoAnual: number
  /** Ingreso / coste puerta abierta. */
  yieldBruto: number
  aniosRecuperacion: number
}

/**
 * Yield estimado POR DORMITORIO: `ingresoPorDormitorio` sale del histórico real
 * de los pisos del usuario (€ netos/año por dormitorio). Es la métrica
 * disponible con sus datos (sus pisos no tienen m² registrados, sí dormitorios).
 * Estimación, no proyección: el que decide es un humano.
 */
export function yieldTuristico(
  ingresoPorDormitorio: number,
  dormitorios: number,
  costeTotal: number,
): YieldTuristico | null {
  if (!(ingresoPorDormitorio > 0) || !(dormitorios > 0) || !(costeTotal > 0)) return null
  const ingresoAnual = redondear(ingresoPorDormitorio * dormitorios)
  return {
    ingresoAnual,
    yieldBruto: ingresoAnual / costeTotal,
    aniosRecuperacion: Math.round((costeTotal / ingresoAnual) * 10) / 10,
  }
}
