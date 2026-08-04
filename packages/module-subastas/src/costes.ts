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

/**
 * Puja MÁXIMA para que la adquisición salga con al menos `descuentoObjetivo`
 * de descuento real sobre `valorMercado` — con el coste puerta abierta entero
 * dentro, no solo el remate.
 *
 * Se resuelve por bisección sobre `calcularCoste` (así hereda TODA la lógica
 * fiscal, incluida la base imponible por valor de referencia, sin duplicarla)
 * y se alinea hacia abajo al tramo de puja si la subasta los publica.
 * `null` si ni pujando 0 se alcanza el objetivo (las cargas/impuestos fijos ya
 * se comen el descuento).
 */
export function pujaMaximaParaDescuento(
  s: SubastaInmueble,
  valorMercado: number,
  descuentoObjetivo = 0.25,
  params: ParamsCoste = {},
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
