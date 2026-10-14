/**
 * «Revisar mi póliza» (13/10/2026): hasta 3 puntos que mirar de una póliza APORTADA, con IA.
 *
 * Módulo PURO (sin Prisma, red ni IA): qué se le da al modelo, la huella que decide si hay que volver a
 * llamarle, cómo se limpia lo que contesta y qué hacer en cada caso. La llamada a `aiComplete` y la BD
 * viven en `app/api/polizas/[id]/revision/route.ts`.
 *
 * 🚨 Reglas de contenido (la IA orienta, no dictamina):
 *  · Nunca «tu seguro es malo», ni recomendar o descartar una compañía, ni mandar contratar/cambiar.
 *  · Cada punto es una PREGUNTA para el corredor («conviene mirar…»), con el aviso SIEMPRE visible.
 *  · `null` = no leído ≠ `[]` = leído y vacío: sin coberturas leídas NO se afirma que «falte» una cobertura.
 *  · Se le da al modelo lo que se LEYÓ al subirla (coberturas, datos del ramo, prima…), no el PDF: el
 *    texto del documento no se guarda en la BD.
 */
import { createHash } from 'node:crypto'
import { TEXTO_REVISION } from './revision-poliza-texto.ts'

// Reexport: tests y rutas siguen importando de aquí; el cliente usa `revision-poliza-texto` (sin node:crypto).
export { TEXTO_REVISION }

export const MAX_PUNTOS = 3
export const MAX_REVISIONES_DIA = 6
export const MAX_TITULO = 90
export const MAX_DETALLE = 320


export type Punto = { titulo: string; detalle: string }

/** Lo que se leyó de la póliza y puede mirar la IA. Sin identificadores personales (nº de póliza, matrícula, dirección). */
export type EntradaRevision = {
  ramo: string | null
  compania: string | null
  primaAnual: number | null
  periodicidadPago: string | null
  /** `YYYY-MM-DD` o `null` (= no consta). */
  fechaVencimiento: string | null
  /** `null` = coberturas no leídas; `[]` = leídas y ninguna. */
  coberturas: readonly string[] | null
  /** Datos propios del ramo (metros, año, capital…). `null` = ninguno declarado. */
  datosRamo: Readonly<Record<string, unknown>> | null
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/**
 * 🔒 LISTA BLANCA de claves de `datosRamo` que pueden ir a la IA (ids de `campos-ramo.ts`). Solo
 * características del riesgo (capitales, metros, año, uso, modalidad…), nunca algo que identifique a una
 * persona o un bien: fuera dirección, código postal, fecha de nacimiento, profesión, beneficiarios, marca y
 * modelo, actividad, descripción u objeto (texto libre) y cualquier clave que no esté aquí (DNI, matrícula,
 * nº de póliza, nombres, piso, puerta…). Una clave nueva del catálogo NO entra sola: hay que añadirla a mano.
 */
export const CLAVES_RAMO_PARA_IA: ReadonlySet<string> = new Set([
  'uso', 'kilometrosAnuales', 'garaje', 'valorVehiculo', 'cilindrada',
  'metrosCuadrados', 'anioConstruccion', 'tipoVivienda', 'regimen', 'usoVivienda',
  'capitalContinente', 'capitalContenido', 'capitalExistencias', 'alarmaConectada',
  'numeroViviendas', 'tieneAscensor', 'tienePiscina', 'tieneGarajeComunitario',
  'modalidad', 'capitalAsegurado', 'vinculadaHipoteca', 'numeroAsegurados',
  'copago', 'incluyeHospitalizacion', 'incluyeDental',
  'numeroEmpleados', 'facturacionAnual', 'ambitoTerritorial',
])

/** Solo claves de la lista blanca, con valor simple y no vacío, ordenadas (la huella no puede depender del orden). */
function datosSimples(d: EntradaRevision['datosRamo']): Array<[string, string | number | boolean]> {
  if (!d) return []
  return Object.entries(d)
    .filter((e): e is [string, string | number | boolean] => {
      if (!CLAVES_RAMO_PARA_IA.has(e[0])) return false
      const v = e[1]
      return (typeof v === 'string' && v.trim() !== '') || typeof v === 'number' || typeof v === 'boolean'
    })
    .sort(([a], [b]) => a.localeCompare(b))
}

/** ¿Hay algo con lo que revisar? Sin coberturas ni datos del ramo, la IA solo inventaría. */
export function tieneMaterial(e: EntradaRevision): boolean {
  return (e.coberturas?.length ?? 0) > 0 || datosSimples(e.datosRamo).length > 0
}

/** SHA-256 estable de lo que se le da al modelo: si no cambia, no se vuelve a llamar. */
export function huellaRevision(e: EntradaRevision): string {
  const canon = JSON.stringify({
    ramo: texto(e.ramo),
    compania: texto(e.compania),
    prima: e.primaAnual == null ? null : Number(e.primaAnual),
    periodicidad: texto(e.periodicidadPago),
    vence: texto(e.fechaVencimiento),
    coberturas: e.coberturas === null ? null : [...e.coberturas].map((c) => c.trim()).sort(),
    datos: datosSimples(e.datosRamo),
  })
  return createHash('sha256').update(canon).digest('hex')
}

export const SISTEMA_REVISION = [
  'Eres un asistente de una correduría de seguros española. Lees los datos de UNA póliza que ha aportado un cliente y',
  `señalas como máximo ${MAX_PUNTOS} puntos concretos que convendría comentar con su corredor.`,
  'Ejemplos de puntos válidos: una franquicia que parece alta, una garantía habitual del ramo que no consta entre las',
  'leídas (solo si hay coberturas leídas), un capital que merece contrastarse.',
  'REGLAS: usa solo los datos dados; si algo no consta, di que no consta, no lo supongas. No digas que el seguro es',
  'malo, caro o insuficiente. No recomiendes ni critiques ninguna compañía, ni mandes contratar o cambiar de póliza.',
  'Redacta cada punto como algo que mirar o preguntar («conviene revisar…»), en español, tono sereno, sin cifras que',
  'no estén en los datos.',
  `Responde SOLO con JSON: {"puntos":[{"titulo":"≤${MAX_TITULO} caracteres","detalle":"≤${MAX_DETALLE} caracteres"}]}.`,
  'Si no hay nada que destacar, {"puntos":[]}.',
].join(' ')

/** El mensaje de usuario para el modelo: datos legibles, sin identificadores personales. */
export function promptRevision(e: EntradaRevision): string {
  const l: string[] = []
  l.push(`Ramo: ${texto(e.ramo) ?? 'no consta'}`)
  l.push(`Compañía: ${texto(e.compania) ?? 'no consta'}`)
  l.push(`Prima anual: ${e.primaAnual == null ? 'no consta' : `${Number(e.primaAnual)} euros`}`)
  l.push(`Vencimiento: ${texto(e.fechaVencimiento) ?? 'no consta'}`)
  l.push(
    e.coberturas === null
      ? 'Coberturas: NO LEÍDAS (no afirmes que falte ninguna)'
      : e.coberturas.length === 0
        ? 'Coberturas: se leyó el documento y no aparece ninguna'
        : `Coberturas leídas:\n${e.coberturas.map((c) => `- ${c}`).join('\n')}`,
  )
  const datos = datosSimples(e.datosRamo)
  if (datos.length > 0) l.push(`Datos del seguro:\n${datos.map(([k, v]) => `- ${k}: ${v}`).join('\n')}`)
  return l.join('\n')
}

/** Frases que una revisión orientativa no puede decir jamás. */
const PROHIBIDO =
  /(tu|su|el) (seguro|p[oó]liza) (es|est[aá]) (malo|mala|p[eé]simo|p[eé]sima|insuficiente|in[uú]til|una estafa|caro|cara|abusiv[oa])|\b(cont[aá]ctate|contrata|c[aá]mbiate|c[aá]mbiala|cancela(la)?)\b|\bte recomendamos (cambiar|contratar|la compa)|mejor compa[ñn][ií]a|compa[ñn][ií]a (peor|mejor)|\bestafa|\bnunca (te|le) (cubrir)/i

function recorta(t: string, max: number): string {
  const s = t.replace(/\s+/g, ' ').trim()
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`
}

/**
 * Lo que contestó el modelo → puntos limpios. `null` = ilegible (error, NO «sin puntos»); `[]` = el modelo
 * dijo que no hay nada. Se descarta cualquier punto con frases prohibidas (se prefiere callar a afirmar).
 */
export function normalizarPuntos(salida: string): Punto[] | null {
  const ini = salida.indexOf('{')
  const fin = salida.lastIndexOf('}')
  if (ini < 0 || fin <= ini) return null
  let bruto: unknown
  try {
    bruto = JSON.parse(salida.slice(ini, fin + 1))
  } catch {
    return null
  }
  const lista = (bruto as { puntos?: unknown } | null)?.puntos
  if (!Array.isArray(lista)) return null
  const puntos: Punto[] = []
  for (const x of lista) {
    if (!x || typeof x !== 'object') continue
    const titulo = texto((x as { titulo?: unknown }).titulo)
    const detalle = texto((x as { detalle?: unknown }).detalle)
    if (!titulo || !detalle) continue
    if (PROHIBIDO.test(titulo) || PROHIBIDO.test(detalle)) continue
    puntos.push({ titulo: recorta(titulo, MAX_TITULO), detalle: recorta(detalle, MAX_DETALLE) })
    if (puntos.length >= MAX_PUNTOS) break
  }
  return puntos
}

/**
 * 🔒 Proveedores a los que puede ir la revisión: SOLO los que declara la política de privacidad
 * (`app/legal/privacidad`): OpenRouter. Por eso la ruta llama a `openrouterChat` y no a `aiComplete`
 * (cuya cadena de suplentes saltaría a Groq, Cerebras o Kimi, no declarados). Sin su clave → `sin_ia`.
 */
export const CLAVES_IA_REVISION = ['OPENROUTER_API_KEY'] as const

export function hayClaveIA(env: Record<string, string | undefined>): boolean {
  return CLAVES_IA_REVISION.some((k) => (env[k] ?? '').trim() !== '')
}

export type DecisionRevision =
  | { accion: 'sin_ia' }
  | { accion: 'sin_datos' }
  | { accion: 'cacheada' }
  | { accion: 'tope' }
  | { accion: 'generar' }

/**
 * El orden importa: lo cacheado se enseña SIEMPRE (no cuesta nada, ni con el tope agotado ni sin clave);
 * luego sin clave, sin material, tope diario y, solo entonces, se llama a la IA.
 */
export function decidirRevision(d: {
  hayIa: boolean
  tieneMaterial: boolean
  hayCache: boolean
  usadasHoy: number
}): DecisionRevision {
  if (d.hayCache) return { accion: 'cacheada' }
  if (!d.hayIa) return { accion: 'sin_ia' }
  if (!d.tieneMaterial) return { accion: 'sin_datos' }
  if (d.usadasHoy >= MAX_REVISIONES_DIA) return { accion: 'tope' }
  return { accion: 'generar' }
}

/** Lo guardado (jsonb) → puntos, o `null` si no tiene la forma. Defensivo: viene de la BD. */
export function puntosGuardados(v: unknown): Punto[] | null {
  if (!Array.isArray(v)) return null
  const salida: Punto[] = []
  for (const x of v) {
    const t = texto((x as { titulo?: unknown } | null)?.titulo)
    const d = texto((x as { detalle?: unknown } | null)?.detalle)
    if (t && d) salida.push({ titulo: t, detalle: d })
  }
  return salida.slice(0, MAX_PUNTOS)
}

/** La fila de `portal_poliza_declarada` (solo lo que la revisión lee) → la entrada. Número ya convertido (Decimal → number). */
export function entradaDesdeFila(p: {
  ramo: string | null
  compania: string | null
  primaAnual: unknown
  periodicidadPago: string | null
  fechaVencimiento: Date | null
  coberturas: unknown
  datosRamo: unknown
}): EntradaRevision {
  const coberturas = Array.isArray(p.coberturas)
    ? p.coberturas.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    : null
  const datos =
    p.datosRamo && typeof p.datosRamo === 'object' && !Array.isArray(p.datosRamo)
      ? (p.datosRamo as Record<string, unknown>)
      : null
  const prima = p.primaAnual == null ? null : Number(p.primaAnual)
  return {
    ramo: p.ramo,
    compania: p.compania,
    primaAnual: prima !== null && Number.isFinite(prima) ? prima : null,
    periodicidadPago: p.periodicidadPago,
    fechaVencimiento: p.fechaVencimiento ? p.fechaVencimiento.toISOString().slice(0, 10) : null,
    coberturas,
    datosRamo: datos,
  }
}
