// ────────────────────────────────────────────────────────────────────────────
// Parseo PURO de los textos de un anuncio de subasta. Sin red ni BD: los
// adaptadores de cada fuente descargan y trocean; aquí solo se interpreta texto.
// Todo devuelve `null` cuando no se puede extraer con confianza — nunca un
// valor inventado, porque aguas abajo se calcula dinero con esto.
// ────────────────────────────────────────────────────────────────────────────

import type { Ejecutado, SituacionPosesoria, TipoSubasta } from './types.ts'

/** Minúsculas, sin acentos, espacios colapsados. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Importe en formato español → number. `"1.234.567,89 €"` → `1234567.89`.
 *
 * El punto es separador de MILLARES y la coma decimal. Cuando solo hay puntos
 * es ambiguo (`"1.234"` = mil doscientos treinta y cuatro, pero `"1234.56"`
 * sería decimal anglosajón): se resuelve mirando si todos los grupos tras el
 * primer punto tienen exactamente 3 dígitos, que es la firma del millar.
 */
export function parseImporteEs(raw: string | null | undefined): number | null {
  if (raw == null) return null
  //   = espacio duro, habitual en los HTML del BOE.
  const s = String(raw).replace(/[ \s]/g, '').replace(/€|EUR(OS)?/gi, '').trim()
  if (!s) return null
  if (!/\d/.test(s)) return null

  const negativo = /^-/.test(s)
  const cuerpo = s.replace(/^[-+]/, '')
  if (!/^[\d.,]+$/.test(cuerpo)) return null

  const tienePunto = cuerpo.includes('.')
  const tieneComa = cuerpo.includes(',')

  let normalizado: string
  if (tieneComa) {
    // La coma manda como decimal: los puntos son millares.
    normalizado = cuerpo.replace(/\./g, '').replace(',', '.')
    // Más de una coma = formato corrupto.
    if ((cuerpo.match(/,/g) ?? []).length > 1) return null
  } else if (tienePunto) {
    const grupos = cuerpo.split('.')
    const esMillar = grupos.length > 1 && grupos.slice(1).every((g) => g.length === 3)
    normalizado = esMillar ? grupos.join('') : cuerpo
  } else {
    normalizado = cuerpo
  }

  const n = Number(normalizado)
  if (!Number.isFinite(n)) return null
  return negativo ? -n : n
}

/**
 * Fecha española → ISO 8601. Acepta `dd/mm/aaaa`, `dd-mm-aaaa`, con hora
 * opcional (`dd/mm/aaaa hh:mm[:ss]`) y también una ISO ya formada.
 */
export function parseFechaEs(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null

  // Ya viene en ISO.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})([T ](\d{2}):(\d{2})(:(\d{2}))?)?/)
  if (iso) {
    const [, y, m, d, , hh, mm, , ss] = iso
    return construirIso(+y, +m, +d, hh ? +hh : 0, mm ? +mm : 0, ss ? +ss : 0)
  }

  const es = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (!es) return null
  const [, d, m, y, hh, mm, ss] = es
  return construirIso(+y, +m, +d, hh ? +hh : 0, mm ? +mm : 0, ss ? +ss : 0)
}

function construirIso(y: number, m: number, d: number, hh: number, mm: number, ss: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return null
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm, ss))
  // Rechaza fechas imposibles que Date "corrige" sola (31/02 → 03/03).
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString()
}

/** Identificador del Portal de Subastas: `SUB-JA-2026-123456`. */
export function extraerIdSubasta(texto: string | null | undefined): string | null {
  if (!texto) return null
  const m = String(texto).match(/SUB-[A-Z]{2}-\d{4}-\d+/i)
  return m ? m[0].toUpperCase() : null
}

/** Identificador del anuncio en el BOE: `BOE-B-2026-12345`. */
export function extraerIdBoe(texto: string | null | undefined): string | null {
  if (!texto) return null
  const m = String(texto).match(/BOE-[A-Z]-\d{4}-\d+/i)
  return m ? m[0].toUpperCase() : null
}

/**
 * Referencia catastral: 20 caracteres alfanuméricos. Es la llave para enriquecer
 * con el Catastro y para deduplicar el MISMO inmueble entre fuentes distintas.
 */
export function extraerRefCatastral(texto: string | null | undefined): string | null {
  if (!texto) return null
  const m = String(texto).match(/\b[0-9A-Z]{20}\b/i)
  if (!m) return null
  const rc = m[0].toUpperCase()
  // Una referencia catastral SIEMPRE mezcla letras y dígitos; 20 dígitos seguidos
  // suele ser un número de cuenta o un expediente.
  if (!/[A-Z]/.test(rc) || !/\d/.test(rc)) return null
  return rc
}

const REGLAS_TIPO: Array<[RegExp, TipoSubasta]> = [
  [/administracion concursal|concurso de acreedores|liquidacion concursal/, 'concursal'],
  [/tesoreria general de la seguridad social|\btgss\b|seguridad social/, 'seguridad_social'],
  [/agencia (estatal de )?administracion tributaria|agencia tributaria|\baeat\b/, 'agencia_tributaria'],
  [/notari|notaria|notarial/, 'notarial'],
  [/juzgado|tribunal|letrad[oa] de la administracion de justicia|ejecucion hipotecaria/, 'judicial'],
  [/ayuntamiento|diputacion|enajenacion de bien(es)? patrimonial(es)?/, 'administrativa'],
]

/**
 * Clasifica el tipo de subasta por el CONTENIDO del anuncio, que es lo fiable.
 * El prefijo del identificador (`SUB-JA`, `SUB-NE`…) se usa solo como pista de
 * respaldo: su tabla completa hay que confirmarla contra datos reales del portal.
 */
export function clasificarTipo(texto: string | null | undefined, identificador?: string | null): TipoSubasta {
  const t = norm(texto ?? '')
  for (const [re, tipo] of REGLAS_TIPO) if (re.test(t)) return tipo

  const pref = (identificador ?? '').toUpperCase().match(/^SUB-([A-Z]{2})-/)?.[1]
  if (pref === 'JA') return 'judicial'
  if (pref === 'NE') return 'notarial'
  return 'otra'
}

const RE_INMUEBLE =
  /vivienda|piso\b|casa\b|chalet|chale|adosad|finca|parcela|solar|local\b|garaje|trastero|nave\b|apartamento|duplex|atico|urbana|rustica|terreno|edificio/
const RE_MUEBLE =
  /vehiculo|turismo\b|motocicleta|ciclomotor|furgoneta|camion|remolque|maquinaria|mobiliario|joya|obra de arte|embarcacion|aeronave/

/**
 * ¿El lote es un inmueble? Se exige señal positiva de inmueble y ausencia de
 * señal de bien mueble: el BOE subasta coches y maquinaria en el mismo feed.
 */
export function esInmueble(texto: string | null | undefined): boolean {
  const t = norm(texto ?? '')
  if (!t) return false
  if (RE_MUEBLE.test(t) && !RE_INMUEBLE.test(t)) return false
  return RE_INMUEBLE.test(t)
}

/**
 * Situación posesoria. Distingue a propósito `desconocida` (el anuncio calla)
 * de `libre` (el anuncio afirma que está libre): callar no es una garantía.
 */
export function situacionPosesoriaDe(texto: string | null | undefined): SituacionPosesoria {
  const t = norm(texto ?? '')
  if (!t) return 'desconocida'
  if (/desconoc\w* (la )?(situacion posesoria|si (esta|se encuentra) ocupad)/.test(t)) return 'ocupada_desconocida'
  if (/sin informacion (sobre|de) (la )?(situacion )?posesion/.test(t)) return 'ocupada_desconocida'
  if (/libre de (ocupantes|arrendatarios)|desocupad[oa]|no consta ocupacion/.test(t)) return 'libre'
  if (/ocupad[oa]|con ocupantes|habitad[oa] por/.test(t)) return 'ocupada'
  return 'desconocida'
}

/**
 * Naturaleza del ejecutado. Decide si la adjudicación tributa por ITP (persona
 * física, la mayoría) o por IVA + AJD (empresa) — cambia mucho el coste real.
 */
export function ejecutadoDe(texto: string | null | undefined): Ejecutado {
  const t = norm(texto ?? '')
  if (!t) return 'desconocido'
  if (/\b(s\.?l\.?u?|s\.?a\.?u?|sociedad (limitada|anonima)|cooperativa|mercantil)\b/.test(t)) return 'juridica'
  if (/persona fisica|don |dona |d\.? |d\.?na\.? /.test(t)) return 'fisica'
  return 'desconocido'
}

/** ¿El anuncio advierte de que no se puede visitar el interior? */
export function sinVisitaDe(texto: string | null | undefined): boolean {
  const t = norm(texto ?? '')
  return /sin (posibilidad de )?(visita|acceso al interior)|no se permite (la )?visita|no consta acceso/.test(t)
}

/**
 * Porcentaje del pleno dominio que se subasta. Un 50% (proindiviso) significa
 * que compras una cuota y quedas de copropietario con un desconocido.
 */
export function porcentajeSubastadoDe(texto: string | null | undefined): number | null {
  const t = norm(texto ?? '')
  if (!t) return null
  const m = t.match(/(\d{1,3})(?:[.,](\d+))?\s*%\s*(?:del?\s+)?(?:pleno dominio|propiedad|inmueble|finca|nuda propiedad)/)
  if (m) {
    const v = parseImporteEs(m[2] ? `${m[1]},${m[2]}` : m[1])
    if (v != null && v > 0 && v <= 100) return v
  }
  if (/pro\s?indiviso|mitad indivisa|una mitad/.test(t) && /mitad/.test(t)) return 50
  return null
}

/** ¿El anuncio dice explícitamente que las cargas son conocidas/publicadas? */
export function cargasConocidasDe(texto: string | null | undefined): boolean {
  const t = norm(texto ?? '')
  if (!t) return false
  if (/sin (informacion (de|sobre) )?cargas|se desconoc\w* (las )?cargas|no consta(n)? cargas conocidas/.test(t)) return false
  return /cargas?\b/.test(t)
}
