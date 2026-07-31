// ────────────────────────────────────────────────────────────────────────────
// Scoring de oportunidad de una subasta. PURO y determinista.
//
// El descuento se calcula contra el COSTE PUERTA ABIERTA (ver costes.ts), no
// contra el precio de salida, y se penaliza por los riesgos que el anuncio
// declara (o calla). Si faltan los datos para calcularlo, la puntuación es
// `null` con su motivo: preferimos "no lo sé" a un número inventado, porque
// aquí se decide si inmovilizar dinero.
// ────────────────────────────────────────────────────────────────────────────

import { calcularCoste, deposito } from './costes.ts'
import type { Oportunidad, ParamsCoste, SubastaInmueble } from './types.ts'
import { ajusteEstado, granularidadZona, referenciaOrientativa, superficieValorable } from './valoracion.ts'

/** Multiplicadores de riesgo. Se aplican en cadena sobre el descuento. */
export const FACTORES = {
  ocupada: 0.55,
  ocupadaDesconocida: 0.65,
  posesionDesconocida: 0.8,
  cargasNoPublicadas: 0.7,
  sinVisita: 0.9,
  /** El valor sale de comparables de portal, no de una tasación: menos certeza. */
  valorEstimado: 0.85,
} as const

/**
 * Evalúa una subasta: coste real, descuento, depósito y puntuación 0-100.
 *
 * @param remate precio de adjudicación a simular; por defecto el valor de subasta
 * @param anioActual año de referencia para el ajuste por estado del edificio
 */
export function evaluarOportunidad(
  s: SubastaInmueble,
  remate?: number | null,
  params?: ParamsCoste,
  anioActual: number = new Date().getFullYear(),
): Oportunidad {
  const coste = calcularCoste(s, remate, params)
  const motivos: string[] = []
  const avisos: string[] = [...coste.avisos]

  // Cascada de referencias de mercado, de más a menos fiable. En la práctica el
  // BOE publica «Tasación 0,00 €» casi siempre y el valor de referencia del
  // Catastro exige certificado digital, así que el tercer escalón —el €/m² de
  // los comparables de la zona— es el que salva la mayoría de los casos.
  let valorMercado: number | null = null
  let valorMercadoReformado: number | null = null
  let valorOrientativo = false
  let origenValor: Oportunidad['origenValor'] = null
  if (s.tasacion != null && s.tasacion > 0) {
    valorMercado = s.tasacion
    origenValor = 'tasacion'
  } else if (s.valorReferencia != null && s.valorReferencia > 0) {
    valorMercado = s.valorReferencia
    origenValor = 'valor_referencia'
    avisos.push('Sin tasación publicada: se compara contra el valor de referencia del Catastro.')
  } else if (s.precioM2Mercado != null && s.precioM2Mercado > 0) {
    // Los tres correctivos del incidente de la Avenida Pedro Romero: metros que
    // no inflan, descuento por estado, y aviso si la zona es demasiado gruesa.
    const sup = superficieValorable(s.superficieRegistral ?? s.superficie, s.superficieCatastro)
    if (sup != null) {
      const estado = ajusteEstado(s.anioConstruccion, anioActual)
      valorMercadoReformado = Math.round(s.precioM2Mercado * sup.m2)
      valorMercado = Math.round(valorMercadoReformado * estado.factor)
      origenValor = 'comparables'

      const muestra = s.muestraMercado != null ? ` (${s.muestraMercado} anuncios)` : ''
      avisos.push(
        `Sin tasación ni valor de referencia: valor ESTIMADO con el precio de mercado de la zona` +
          `${muestra}, ${Math.round(s.precioM2Mercado)}€/m² × ${sup.m2} m². Es una estimación, no una tasación.`,
      )
      if (sup.aviso) avisos.push(sup.aviso)
      if (estado.nota) avisos.push(estado.nota)

      const gran = granularidadZona(s.zonaMercado, s.municipio)
      if (referenciaOrientativa(gran)) {
        valorOrientativo = true
        avisos.push(
          `El €/m² es la mediana de TODO el municipio (${s.municipio ?? 'la ciudad'}), donde el precio ` +
            `cambia mucho de un barrio a otro: sirve para hacerse una idea, no para decidir una puja. ` +
            `Hace falta un comparable del barrio.`,
        )
      }
    }
  }

  // La venta de adjudicado no es una subasta: no hay depósito ni puja.
  const esVentaDirecta = s.tipo === 'venta_adjudicado'
  const dep = esVentaDirecta ? null : deposito(s.valorSubasta)

  if (valorMercado == null) {
    return {
      coste,
      valorMercado: null,
      valorMercadoReformado: null,
      valorOrientativo: false,
      origenValor: null,
      descuento: null,
      deposito: dep,
      puntuacion: null,
      factorRiesgo: 1,
      motivos: ['Sin tasación, valor de referencia ni comparables de la zona: no se puede calcular el descuento.'],
      avisos,
    }
  }

  const descuento = 1 - coste.total / valorMercado
  if (descuento <= 0) {
    motivos.push('El coste real supera el valor de mercado estimado: no hay descuento.')
  } else {
    motivos.push(`Descuento del ${porcentaje(descuento)} sobre ${formatearEur(valorMercado)} contando todos los costes.`)
  }

  // ── Riesgos ───────────────────────────────────────────────────────────────
  let factorRiesgo = 1
  if (s.situacionPosesoria === 'ocupada') {
    factorRiesgo *= FACTORES.ocupada
    motivos.push('Ocupada: penaliza fuerte (desalojo largo e incierto).')
  } else if (s.situacionPosesoria === 'ocupada_desconocida') {
    factorRiesgo *= FACTORES.ocupadaDesconocida
    motivos.push('El anuncio no aclara si está ocupada.')
  } else if (s.situacionPosesoria === 'desconocida' || s.situacionPosesoria == null) {
    factorRiesgo *= FACTORES.posesionDesconocida
    motivos.push('Sin datos de situación posesoria.')
  } else {
    motivos.push('Libre de ocupantes.')
  }

  if (s.cargasConocidas === false) {
    factorRiesgo *= FACTORES.cargasNoPublicadas
    motivos.push('Cargas no publicadas.')
  }
  if (s.sinVisita) {
    factorRiesgo *= FACTORES.sinVisita
    motivos.push('Sin acceso al interior.')
  }
  if (origenValor === 'comparables') {
    factorRiesgo *= FACTORES.valorEstimado
    motivos.push('El valor de mercado es una estimación por comparables, no una tasación.')
  }

  const pctSubastado = s.porcentajeSubastado
  if (pctSubastado != null && pctSubastado > 0 && pctSubastado < 100) {
    factorRiesgo *= pctSubastado / 100
    motivos.push(`Solo se subasta el ${porcentaje(pctSubastado / 100)} del pleno dominio (proindiviso).`)
    avisos.push('Proindiviso: quedarías de copropietario con el resto de titulares.')
  }

  const bruto = descuento * 100 * factorRiesgo
  const puntuacion = Math.max(0, Math.min(100, Math.round(bruto)))

  return {
    coste,
    valorMercado,
    valorMercadoReformado,
    valorOrientativo,
    origenValor,
    descuento: Math.round(descuento * 10000) / 10000,
    deposito: dep,
    puntuacion,
    factorRiesgo: Math.round(factorRiesgo * 1000) / 1000,
    motivos,
    avisos,
  }
}

function porcentaje(x: number): string {
  return `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
}

function formatearEur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}
