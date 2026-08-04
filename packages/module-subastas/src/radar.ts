// ────────────────────────────────────────────────────────────────────────────
// Radar: empareja una subasta ya normalizada con los criterios de una cuenta.
// PURO y determinista. Un criterio duro incumplido DESCARTA (no resta puntos):
// avisar de un piso en Lugo a quien solo mira Sevilla es ruido, no una señal
// floja.
// ────────────────────────────────────────────────────────────────────────────

import { norm } from './parsing.ts'
import type { CoincidenciaSubasta, CriteriosSubasta, Oportunidad, SubastaInmueble } from './types.ts'

/**
 * @param op evaluación de oportunidad ya calculada; sin ella no se puede aplicar
 *           el filtro de descuento mínimo y la puntuación sale solo de las
 *           palabras clave.
 */
export function coincideSubasta(
  s: SubastaInmueble,
  c: CriteriosSubasta,
  op?: Oportunidad | null,
): CoincidenciaSubasta {
  const motivos: string[] = []
  const descarta = (razon: string): CoincidenciaSubasta => ({
    casa: false,
    puntuacion: 0,
    motivos,
    descartadaPor: razon,
  })

  // ── Criterios duros ───────────────────────────────────────────────────────
  const provincias = c.provincias ?? []
  if (provincias.length) {
    const prov = norm(s.provincia ?? '')
    if (!prov) return descarta('sin provincia identificada')
    if (!provincias.some((p) => norm(p) === prov)) return descarta(`provincia fuera de zona (${s.provincia})`)
    motivos.push(`En ${s.provincia}`)
  }

  const tipos = c.tipos ?? []
  if (tipos.length && !tipos.includes(s.tipo)) return descarta(`tipo no buscado (${s.tipo})`)

  const precio = s.valorSubasta
  if (c.precioMin != null && precio != null && precio < c.precioMin) {
    return descarta('por debajo del precio mínimo')
  }
  if (c.precioMax != null) {
    if (precio == null) return descarta('sin precio publicado y hay tope de precio')
    if (precio > c.precioMax) return descarta('por encima del precio máximo')
  }

  if (c.excluirOcupadas && (s.situacionPosesoria === 'ocupada' || s.situacionPosesoria === 'ocupada_desconocida')) {
    return descarta('ocupada')
  }

  if (c.descuentoMin != null && c.descuentoMin > 0) {
    if (!op || op.descuento == null) return descarta('sin datos para calcular el descuento')
    if (op.descuento * 100 < c.descuentoMin) {
      return descarta(`descuento ${(op.descuento * 100).toFixed(1)}% por debajo del mínimo (${c.descuentoMin}%)`)
    }
  }

  // ── Puntuación ────────────────────────────────────────────────────────────
  // La base es la calidad de la oportunidad; las palabras clave son un empujón,
  // no la señal principal.
  let puntuacion = op?.puntuacion ?? 0

  const texto = norm(`${s.descripcion ?? ''} ${s.municipio ?? ''} ${s.autoridad ?? ''}`)
  for (const kw of c.palabrasClave ?? []) {
    const k = norm(kw)
    if (k && texto.includes(k)) {
      puntuacion += 10
      motivos.push(`Palabra clave «${kw}»`)
    }
  }

  if (op?.puntuacion != null) motivos.push(...op.motivos)

  return { casa: true, puntuacion: Math.max(0, Math.min(100, Math.round(puntuacion))), motivos }
}

/** Filtra y ordena por puntuación descendente. */
export function filtrarSubastas(
  subastas: Array<{ subasta: SubastaInmueble; oportunidad?: Oportunidad | null }>,
  criterios: CriteriosSubasta,
): Array<{ subasta: SubastaInmueble; coincidencia: CoincidenciaSubasta }> {
  return subastas
    .map(({ subasta, oportunidad }) => ({ subasta, coincidencia: coincideSubasta(subasta, criterios, oportunidad) }))
    .filter((r) => r.coincidencia.casa)
    .sort((a, b) => b.coincidencia.puntuacion - a.coincidencia.puntuacion)
}

/**
 * Clave para detectar el MISMO inmueble llegado por fuentes distintas (el BOE
 * lo subasta y Sareb lo lista porque es colateral de un préstamo suyo). La
 * referencia catastral es la única llave fiable; sin ella no se deduplica —
 * fusionar por dirección daría falsos positivos.
 */
export function claveInmueble(s: SubastaInmueble): string | null {
  return s.refCatastral ? s.refCatastral.toUpperCase() : null
}
