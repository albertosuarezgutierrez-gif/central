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

/** Multiplicadores de riesgo. Se aplican en cadena sobre el descuento. */
export const FACTORES = {
  ocupada: 0.55,
  ocupadaDesconocida: 0.65,
  posesionDesconocida: 0.8,
  cargasNoPublicadas: 0.7,
  sinVisita: 0.9,
} as const

/**
 * Evalúa una subasta: coste real, descuento, depósito y puntuación 0-100.
 *
 * @param remate precio de adjudicación a simular; por defecto el valor de subasta
 */
export function evaluarOportunidad(
  s: SubastaInmueble,
  remate?: number | null,
  params?: ParamsCoste,
): Oportunidad {
  const coste = calcularCoste(s, remate, params)
  const motivos: string[] = []
  const avisos: string[] = [...coste.avisos]

  // La referencia de mercado es la tasación; si no la hay, el valor de referencia
  // del Catastro es el mejor sustituto disponible.
  let valorMercado: number | null = null
  if (s.tasacion != null && s.tasacion > 0) {
    valorMercado = s.tasacion
  } else if (s.valorReferencia != null && s.valorReferencia > 0) {
    valorMercado = s.valorReferencia
    avisos.push('Sin tasación publicada: se compara contra el valor de referencia del Catastro.')
  }

  // La venta de adjudicado no es una subasta: no hay depósito ni puja.
  const esVentaDirecta = s.tipo === 'venta_adjudicado'
  const dep = esVentaDirecta ? null : deposito(s.valorSubasta)

  if (valorMercado == null) {
    return {
      coste,
      valorMercado: null,
      descuento: null,
      deposito: dep,
      puntuacion: null,
      factorRiesgo: 1,
      motivos: ['Sin tasación ni valor de referencia: no se puede calcular el descuento.'],
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
