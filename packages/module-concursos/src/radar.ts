// ────────────────────────────────────────────────────────────────────────────
// Radar PLACSP + OCR (F7) — PURO. Empareja anuncios ya normalizados con los
// criterios de la empresa y detecta pliegos escaneados. Determinista.
// El sondeo en vivo de PLACSP y el OCR son infraestructura de la app.
// ────────────────────────────────────────────────────────────────────────────

import type {
  AnuncioRadar,
  CoincidenciaRadar,
  CriteriosRadar,
} from './types'

/** Normaliza: minúsculas, sin acentos, espacios colapsados. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Evalúa un anuncio contra los criterios de la empresa. Casa si hay al menos un
 * match (CPV por prefijo o palabra clave) y el presupuesto, si se conoce y hay
 * límites, cae dentro del rango. Un presupuesto fuera de rango DESCARTA.
 */
export function coincideRadar(anuncio: AnuncioRadar, criterios: CriteriosRadar): CoincidenciaRadar {
  const motivos: string[] = []
  let puntuacion = 0

  // CPV por prefijo
  const cpvCrit = criterios.cpv ?? []
  const cpvAnun = anuncio.cpv ?? []
  for (const c of cpvCrit) {
    if (cpvAnun.some(a => a.startsWith(c))) {
      motivos.push(`CPV ${c} de interés`)
      puntuacion += 50
      break
    }
  }

  // Palabras clave en título + objeto
  const texto = norm(`${anuncio.titulo} ${anuncio.objeto ?? ''}`)
  for (const kw of criterios.palabras_clave ?? []) {
    if (texto.includes(norm(kw))) {
      motivos.push(`Palabra clave «${kw}»`)
      puntuacion += 30
    }
  }

  // Presupuesto: si hay límites y el anuncio trae importe, debe caer dentro.
  let presupuestoOk = true
  if (anuncio.presupuesto !== undefined) {
    if (criterios.presupuesto_min !== undefined && anuncio.presupuesto < criterios.presupuesto_min) presupuestoOk = false
    if (criterios.presupuesto_max !== undefined && anuncio.presupuesto > criterios.presupuesto_max) presupuestoOk = false
    if (!presupuestoOk) motivos.push('Presupuesto fuera del rango buscado')
  }

  const coincide = puntuacion > 0 && presupuestoOk
  return { coincide, puntuacion: coincide ? Math.min(100, puntuacion) : 0, motivos }
}

/** Anuncios que casan, ordenados por relevancia descendente. */
export function filtrarRadar(anuncios: AnuncioRadar[], criterios: CriteriosRadar): AnuncioRadar[] {
  return anuncios
    .map(a => ({ a, m: coincideRadar(a, criterios) }))
    .filter(x => x.m.coincide)
    .sort((x, y) => y.m.puntuacion - x.m.puntuacion)
    .map(x => x.a)
}

/** Caracteres mínimos de texto útil; por debajo, el PDF probablemente es escaneado. */
export const MIN_TEXTO_PLIEGO = 200

/**
 * Heurística: si el texto extraído del pliego es demasiado corto, el PDF está
 * escaneado (imagen) y hay que pasarle OCR antes de analizarlo.
 */
export function necesitaOcr(texto: string, minChars = MIN_TEXTO_PLIEGO): boolean {
  return (texto || '').trim().length < minChars
}
