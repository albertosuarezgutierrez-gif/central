// ────────────────────────────────────────────────────────────────────────────
// Radar: empareja una subasta ya normalizada con los criterios de una cuenta.
// PURO y determinista. Un criterio duro incumplido DESCARTA (no resta puntos):
// avisar de un piso en Lugo a quien solo mira Sevilla es ruido, no una señal
// floja.
// ────────────────────────────────────────────────────────────────────────────

import { tipoBien } from './extraccion.ts'
import { norm } from './parsing.ts'
import type { CoincidenciaSubasta, CriteriosSubasta, Oportunidad, SubastaInmueble } from './types.ts'

// ── Helpers del perfil de inversión (puros). `null` = «no se sabe». ──────────

/** true/false si consta que es (o no) una casa; null si no se puede saber. */
export function esUnifamiliar(s: SubastaInmueble): boolean | null {
  const t = norm(s.descripcion ?? '')
  const tipo = s.tipoBien ?? tipoBien(s.descripcion)
  if (tipo === 'otro') return null
  if (tipo !== 'vivienda') return false
  if (/unifamiliar|chalet|adosad|pareado|\bcasa\b|villa\b/.test(t)) return true
  if (s.planta || /\bpiso\b|apartamento|\bduplex|\batico|\bestudio\b|\bplanta\s+\w+\s+(?:puerta|letra)|\bescalera\b/.test(t)) return false
  return null
}

/** Piscina: true si el texto la cita, false si dice «sin piscina», null si calla. */
export function tienePiscina(s: SubastaInmueble): boolean | null {
  const t = norm(s.descripcion ?? '')
  if (/\bsin\s+piscina/.test(t)) return false
  return /piscina/.test(t) ? true : null
}

/** m² de parcela/solar/terreno/jardín citados en la descripción; null si no hay. */
export function superficieParcela(s: SubastaInmueble): number | null {
  const t = norm(s.descripcion ?? '')
  const m = /(?:parcela|solar|terreno|jardin)[^.;]{0,80}?(\d[\d.,]*)\s*(?:m2|m²|metros)/.exec(t)
  if (!m) return null
  const n = Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

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

  // ── Perfil de inversión ───────────────────────────────────────────────────
  const pendientes: string[] = []

  const municipios = (c.municipios ?? []).map(norm).filter(Boolean)
  if (municipios.length) {
    const mun = norm(s.municipio ?? '')
    if (!mun) return descarta('sin municipio identificado')
    if (!municipios.includes(mun)) return descarta(`municipio fuera de la lista (${s.municipio})`)
    motivos.push(`Municipio ${s.municipio}`)
  }

  if (c.soloUnifamiliar) {
    const u = esUnifamiliar(s)
    
    if (u === false) return descarta('no es vivienda unifamiliar')
    if (u === null) pendientes.push('unifamiliar')
    else motivos.push('Vivienda unifamiliar')
  }

  const minimo = (valor: number | null | undefined, min: number | undefined, nombre: string): CoincidenciaSubasta | null => {
    if (min == null) return null
    if (valor == null) { pendientes.push(nombre); return null }
    if (valor < min) return descarta(`${nombre} ${valor} por debajo del mínimo (${min})`)
    motivos.push(`${valor} ${nombre}`)
    return null
  }
  const dorm = minimo(s.dormitorios, c.dormitoriosMin, 'dormitorios')
  if (dorm) return dorm
  const ban = minimo(s.banos, c.banosMin, 'baños')
  if (ban) return ban

  // «Piscina o parcela grande»: con ambos declarados basta UNO de los dos.
  const piscina = c.requierePiscina ? tienePiscina(s) : undefined
  const parcela = c.superficieParcelaMin != null ? superficieParcela(s) : undefined
  const parcelaOk = parcela != null && parcela >= (c.superficieParcelaMin ?? 0)
  if (piscina !== undefined && parcela !== undefined) {
    if (piscina === true) motivos.push('Con piscina')
    if (parcelaOk) motivos.push(`Parcela ${parcela} m²`)
    if (piscina !== true && !parcelaOk) {
      if (piscina === false && parcela != null) return descarta('sin piscina y parcela por debajo del mínimo')
      pendientes.push('piscina o parcela')
    }
  } else if (piscina !== undefined) {
    if (piscina === false) return descarta('sin piscina')
    if (piscina === null) pendientes.push('piscina')
    else motivos.push('Con piscina')
  } else if (parcela !== undefined) {
    if (parcela === null) pendientes.push('parcela')
    else if (!parcelaOk) return descarta(`parcela ${parcela} m² por debajo del mínimo (${c.superficieParcelaMin})`)
    else motivos.push(`Parcela ${parcela} m²`)
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

  if (pendientes.length) motivos.push(`Pendiente de confirmar: ${pendientes.join(', ')}`)
  return {
    casa: true,
    puntuacion: Math.max(0, Math.min(100, Math.round(puntuacion))),
    motivos,
    ...(pendientes.length ? { pendientes } : {}),
  }
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
