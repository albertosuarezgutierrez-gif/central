// Lo PURO del resumen de una comparativa (20/10/2026): la etiqueta visible, el cepo de compañías y el aviso de
// «ya hay una cotización de pago». La IA solo REDACTA a partir de `compararOfertas`; la redacción, su cepo de
// cifras y su respaldo determinista viven en apps/asegura (`lib/estudio-ia.ts`), que usa esto.

import { normalizarTexto } from './coberturas-taxonomia.ts'

/** Lo que se pinta encima del resumen, según quién lo redactó. Visible SIEMPRE (PDF y pantalla). */
export const ETIQUETA_RESUMEN_IA = 'Resumen preparado con IA y revisado por tu corredor'
export const ETIQUETA_RESUMEN_PLANTILLA = 'Resumen preparado por tu corredor a partir del cuadro comparativo'

/** IA que el corredor AÚN no ha marcado como revisada (21/10/2026): no se le atribuye una revisión que no ha hecho. */
export const ETIQUETA_RESUMEN_IA_SIN_REVISAR = 'Resumen preparado con IA'

/**
 * `revisada`: `false` = la IA lo redactó y el corredor aún no lo ha marcado como revisado (presupuesto de Avant2, que se
 * prepara solo tras tarificar) → sin «revisado por tu corredor». `true` o ausente (estudios de ofertas, que genera el
 * corredor a mano, y los anteriores al 21/10/2026) → la etiqueta de siempre.
 */
export function etiquetaResumen(fuente: 'ia' | 'determinista' | string | null | undefined, revisada?: boolean | null): string {
  if (fuente !== 'ia') return ETIQUETA_RESUMEN_PLANTILLA
  return revisada === false ? ETIQUETA_RESUMEN_IA_SIN_REVISAR : ETIQUETA_RESUMEN_IA
}

/**
 * Aseguradoras del mercado español que una IA podría nombrar. No es un censo: es el diccionario del CEPO. Si el
 * texto nombra una que NO está entre las comparadas, el texto se descarta (una compañía inventada en una
 * propuesta es tan grave como una cifra inventada). Se añaden, no se quitan. Fuera a propósito las que son una
 * palabra corriente del español («DAS», «Preventiva»): dispararían el cepo con textos legítimos.
 */
export const COMPANIAS_CONOCIDAS: readonly string[] = [
  'Allianz', 'Mapfre', 'AXA', 'Generali', 'Zurich', 'Reale', 'Occident', 'Catalana Occidente', 'Liberty', 'Mutua Madrileña',
  'Línea Directa', 'Pelayo', 'Santalucía', 'Santa Lucía', 'Fiatc', 'Fidelidade', 'Helvetia', 'Caser', 'Plus Ultra', 'Ocaso',
  'Sanitas', 'Adeslas', 'SegurCaixa', 'DKV', 'Asisa', 'Mussap', 'Verti', 'Genesis', 'Qualitas', 'Regal', 'Hiscox', 'Markel',
  'Mutua General', 'Mutua de Propietarios', 'Arag', 'Nationale-Nederlanden', 'Ergo', 'Aegon', 'Asefa', 'Lagun Aro',
  'Divina Pastora', 'MGS', 'Seguros Bilbao', 'Meridiano', 'Surne', 'Mutual Médica', 'Previsora', 'Nectar',
  'Bankinter Seguros', 'Mutua Levante', 'Agropelayo', 'Agroseguro', 'Zurich Klinc', 'Direct Seguros', 'Balumba', 'Hilo Direct',
  'Soliss', 'Patria Hispana', 'Mutua Tinerfeña', 'Cigna', 'Sabadell Seguros', 'BBVA Seguros', 'Santander Seguros',
  'Cardif', 'Admiral', 'Ibercaja Seguros', 'Kutxabank Seguros', 'Unicaja Seguros', 'Mutuacat', 'Atlantis', 'Groupama',
]

/** Palabras que no identifican a una aseguradora («Seguros», «Mutua», «S.A.»…). */
const RELLENO_COMPANIA = new Set(['seguros', 'seguro', 'mutua', 'mutualidad', 'compania', 'de', 'del', 'y', 'reaseguros', 'aseguradora', 'sa', 's', 'a', 'la', 'el', 'los', 'grupo', 'sociedad', 'anonima', 'insurance', 'assurance', 'espana', 'sucursal', 'en'])

/** Los tokens que identifican a una compañía: normalizados, palabras COMPLETAS, sin relleno. */
function tokensCompania(nombre: string): string[] {
  return normalizarTexto(nombre).split(' ').filter((w) => w !== '' && !RELLENO_COMPANIA.has(w))
}

/** ¿Nombran la misma compañía? Por tokens completos: los de una contenidos en los de la otra (nunca subcadenas). */
function mismaPorTokens(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  return a.every((t) => b.includes(t)) || b.every((t) => a.includes(t))
}

/** Escapa para RegExp. */
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Nombres propios con FORMA de aseguradora aunque no estén en el diccionario: «Seguros Bilbao», «Mutua Segorbina»,
 * «Ocaso Seguros», «Pepito Insurance». Sin esto, una compañía inventada que no estuviera en la lista pasaría.
 */
const PATRONES_ASEGURADORA: readonly RegExp[] = [
  /\b(?:Seguros|Mutua|Mutualidad|Aseguradora|Compañía de Seguros)\s+((?:[A-ZÁÉÍÓÚÑ][\p{L}]+)(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÑ][\p{L}]+)*)/gu,
  /\b((?:[A-ZÁÉÍÓÚÑ][\p{L}]+)(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}]+)*)\s+(?:Seguros|Insurance|Assurance|Versicherung)\b/gu,
]

/**
 * `null` = el texto solo nombra compañías comparadas (o ninguna); si no, la primera que sobra.
 *   · Diccionario: `COMPANIAS_CONOCIDAS` (no hay en el repo un censo DGSFP completo; LIMITACIÓN: una aseguradora
 *     que no esté en la lista NI tenga forma de aseguradora —«Seguros X», «X Seguros», «Mutua X»— no se detecta).
 *   · Coincidencia por TOKENS completos sin relleno: «Generali» ≠ «Mutua General», «Occident» ≠ «Catalana Occidente».
 *   · Las comparadas vacías o solo relleno no cuentan. «Grupo ASegura» (la correduría) no es una compañía.
 */
export function companiaIntrusa(texto: string, comparadas: readonly string[]): string | null {
  const conTokens = comparadas.map((c) => tokensCompania(c ?? '')).filter((t) => t.length > 0)
  const comparada = (nombre: string) => conTokens.some((t) => mismaPorTokens(tokensCompania(nombre), t))
  const norm = ` ${normalizarTexto(texto)} `
  // Las más largas primero: «Catalana Occidente» no debe disparar también «Occident».
  let resto = norm
  for (const n of [...COMPANIAS_CONOCIDAS].sort((x, y) => y.length - x.length)) {
    const re = new RegExp(`(?<![a-z0-9])${esc(normalizarTexto(n)).replace(/ /g, '\\s+')}(?![a-z0-9])`, 'g')
    if (!re.test(resto)) continue
    if (!comparada(n)) return n
    resto = resto.replace(re, ' ')
  }
  for (const re of PATRONES_ASEGURADORA) {
    for (const m of texto.matchAll(re)) {
      const nombre = m[1]!.trim()
      if (/\basegura\b/i.test(normalizarTexto(nombre))) continue
      if (tokensCompania(nombre).length === 0) continue
      if (!comparada(nombre)) return nombre
    }
  }
  return null
}

/** dd/mm de una fecha ISO, en Madrid. */
function ddmm(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Madrid' })
}

const eurCents = (c: number) => (c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + '€'

/**
 * El aviso ANTES de pagar otra cotización de Avant2 cuando la oportunidad ya tiene una guardada. `costeCents`
 * 0 o no válido = coste sin confirmar (nunca «gratis»). La guardada se abre gratis; si su fecha de efecto ya pasó
 * no sirve para emitir y se dice.
 */
export function avisoCotizacionGuardada(c: { creadaEn: string; caducada: boolean; costeCents: number | null }): string {
  const f = ddmm(c.creadaEn)
  const coste = typeof c.costeCents === 'number' && Number.isFinite(c.costeCents) && c.costeCents > 0 ? eurCents(c.costeCents) : 'con coste sin confirmar'
  const del = f ? ` del ${f}` : ''
  if (c.caducada) return `Ya hay una cotización de Avant2${del}, pero su fecha de efecto ya pasó: para emitir hace falta una consulta nueva (${coste}).`
  return `Ya hay una cotización de Avant2${del}: ábrela gratis. ¿Hacer una consulta nueva (${coste})?`
}
