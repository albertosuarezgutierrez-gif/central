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

/** Porcentaje del valor de subasta que hay que consignar para poder pujar. */
export const PCT_DEPOSITO = 0.05

/**
 * Parámetros por defecto para Andalucía (2026). Los tipos impositivos son los
 * vigentes; el resto son órdenes de magnitud conservadores y sobreescribibles.
 */
export const PARAMS_ANDALUCIA: Required<ParamsCoste> = {
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

  if (p.comunidadPendiente === 0) {
    avisos.push('No se han incluido derramas de comunidad pendientes: se heredan el año en curso y los 3 anteriores.')
  }
  if (p.plusvaliaMunicipal === 0) {
    avisos.push('No se ha incluido la plusvalía municipal (corresponde al ejecutado, pero conviene confirmarlo).')
  }

  const total = redondear(
    precio +
      cargasPreferentes +
      impuestoTransmision +
      p.notariaRegistro +
      p.cancelacionCargas +
      p.plusvaliaMunicipal +
      p.comunidadPendiente +
      p.ibiPendiente +
      lanzamiento,
  )

  return {
    remate: redondear(precio),
    cargasPreferentes: redondear(cargasPreferentes),
    impuestoTransmision,
    baseImponible: redondear(baseImponible),
    impuestoConcepto,
    notariaRegistro: p.notariaRegistro,
    cancelacionCargas: p.cancelacionCargas,
    plusvaliaMunicipal: p.plusvaliaMunicipal,
    comunidadPendiente: p.comunidadPendiente,
    ibiPendiente: p.ibiPendiente,
    lanzamiento,
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
