// Instagram de Grupo ASegura — la parte PURA del agente (04/11/2026).
//
// ─── De dónde viene ────────────────────────────────────────────────────────
// Es el pipeline de `apps/ia-rest/src/app/api/cron/instagram` (plantillas, formato
// del día, anti-repetición, imagen generada + caption, botones en Telegram),
// adaptado a la correduría. Lo que NO se copia, a propósito:
//   · el dato estadístico («stat») y la cita de un cliente: en un sector regulado
//     un número inventado es publicidad engañosa y una cita inventada es un
//     testimonio falso. Las plantillas de aquí no piden cifras ni personas.
//   · los «módulos» de producto y las noticias de hostelería.
//   · los hashtags de alcance: sin hashtags de relleno (como en LinkedIn).
//
// ─── El cepo ───────────────────────────────────────────────────────────────
// Todo texto que sale (lo que se pinta en la imagen + el caption) pasa por
// `revisarCopy` (RDL 3/2020) y por `citasNoRespaldadas`: un post publicado no se
// corrige. Con reparos se regenera UNA vez; si siguen, se descarta y se avisa
// del motivo (`decidirTrasRevision`). Nada se publica sin el botón de Alberto.
//
// ─── Publicar o «a mano» ───────────────────────────────────────────────────
// Hoy Grupo ASegura NO tiene perfil de Instagram. Sin `ASEGURA_INSTAGRAM_ACCESS_TOKEN`
// y `ASEGURA_INSTAGRAM_USER_ID`, «Aprobar» entrega imagen + caption para publicar
// a mano (`aprobado_manual`). Nunca un literal de respaldo (`decidirPublicacion`).

import {
  revisarCopy,
  explicarInfracciones,
  citasNoRespaldadas,
  MEDIADOR,
} from '@central/module-seguros'
import type { Borrador } from './redes-borradores.ts'

// ─── Vocabulario ─────────────────────────────────────────────────────────────

/** Los mismos temas que los borradores de LinkedIn: una sola taxonomía de redes. */
export type TemaIg = Borrador['tema']
export const TEMAS_IG: readonly TemaIg[] = ['comunidades', 'comercio', 'flota', 'hogar', 'renovacion', 'marca']

export type PlantillaIg = 'pregunta' | 'claves' | 'mito'
export const PLANTILLAS_IG: readonly PlantillaIg[] = ['pregunta', 'claves', 'mito']

export const ESTADOS_IG = ['pendiente', 'publicando', 'aprobado_manual', 'publicado', 'descartado', 'rechazado_copy'] as const
export type EstadoIg = (typeof ESTADOS_IG)[number]

/** Lo que el modelo devuelve y lo que se pinta. */
export type PiezaIg = {
  /** Texto grande de la imagen. */
  titulo: string
  /** Etiqueta pequeña de la imagen. */
  sub: string
  /** `claves`: 3 puntos. `mito`: 1 (la realidad). `pregunta`: ninguno. */
  puntos: string[]
  /** Caption SIN el pie del mediador (se añade aquí, no lo escribe el modelo). */
  caption: string
}

// ─── Temas: B2B primero ──────────────────────────────────────────────────────
// Mismo criterio que `redes-borradores.ts`: el hueco creíble de la cartera son
// COMUNIDADES y COMERCIO (y flota), que decide un administrador, un presidente o
// un gerente. Pesan el triple que hogar/renovación/marca.

export type FichaTemaIg = {
  tema: TemaIg
  peso: number
  /** A quién va. Entra en el prompt. */
  publico: string
  /** Hechos ya verificados (salen de los borradores de LinkedIn). El modelo no inventa otros. */
  hechos: string
  /**
   * Ids de `NORMAS_CITABLES` que el post PUEDE citar. Vacío = no cita ninguna norma.
   * 🚨 Acotar aquí, no en el prompt: una cita inventada cuesta más que no citar.
   */
  normas: readonly string[]
}

export const FICHAS_TEMA_IG: Record<TemaIg, FichaTemaIg> = {
  comunidades: {
    tema: 'comunidades', peso: 3,
    publico: 'administradores de fincas y presidentes de comunidad',
    hechos: 'Si el edificio está asegurado por menos de su valor de reconstrucción, la compañía indemniza en la misma proporción (regla proporcional, art. 30 de la Ley de Contrato de Seguro). Esa regla se puede excluir por pacto en las condiciones particulares, pero hay que pedirlo. Conviene saber de cuándo es el capital de continente y quién lo calculó.',
    normas: ['lcs-30'],
  },
  comercio: {
    tema: 'comercio', peso: 3,
    publico: 'comerciantes y pymes con local',
    hechos: 'La compañía tarifica según la actividad declarada en la póliza. Si se cambia de actividad, se amplía el local o se mete maquinaria nueva y no se comunica, el riesgo real deja de ser el aceptado y eso se mira cuando hay siniestro. Se arregla comunicándolo.',
    normas: [],
  },
  flota: {
    tema: 'flota', peso: 3,
    publico: 'empresas con furgonetas y transportistas',
    hechos: 'El seguro del vehículo responde de los daños que causa el vehículo, no de la mercancía que lleva: la carga se asegura aparte, y no es igual mercancía propia que ajena. Hay que revisar quién puede conducir, cómo y desde cuándo se dan de alta los vehículos nuevos, y dónde está asegurada la carga. Una flota es una sola póliza con condiciones comunes y siniestralidad conjunta.',
    normas: [],
  },
  hogar: {
    tema: 'hogar', peso: 1,
    publico: 'particulares con vivienda en propiedad o con hipoteca',
    hechos: 'El banco puede exigir que la vivienda esté asegurada mientras dure la hipoteca, pero no que la póliza sea la suya: tiene que aceptar la de otra compañía con garantías equivalentes. Una bonificación en el tipo por contratar con el banco es una oferta combinada legal; no puede ser condición del préstamo.',
    normas: [],
  },
  renovacion: {
    tema: 'renovacion', peso: 1,
    publico: 'cualquier persona o empresa con pólizas',
    hechos: 'Para oponerse a la prórroga hay que notificarlo por escrito con al menos un mes de antelación al vencimiento; la compañía necesita dos meses (art. 22 de la Ley de Contrato de Seguro). La fecha útil no es la del vencimiento, es un mes antes.',
    normas: ['lcs-22'],
  },
  marca: {
    tema: 'marca', peso: 1,
    publico: 'cualquiera que dude entre corredor, agente o comparador',
    hechos: 'El agente representa a una compañía. El comparador ordena resultados. El corredor es un mediador independiente: analiza el riesgo, trabaja con varias compañías y en el siniestro está del lado del cliente. Tiene clave en el registro de la DGSFP, consultable por cualquiera, y seguro de responsabilidad civil obligatorio.',
    normas: [],
  },
}

// ─── Elección (anti-repetición) ─────────────────────────────────────────────

/**
 * Elige el tema: nunca uno de los dos últimos y, entre el resto, al azar con peso
 * (B2B ×3). `recientes` va del más nuevo al más viejo. `azar` ∈ [0,1) inyectable.
 */
export function elegirTema(recientes: readonly string[], azar: number = Math.random()): TemaIg {
  const vetados = new Set(recientes.slice(0, 2))
  const pool = TEMAS_IG.filter((t) => !vetados.has(t))
  const lista = pool.length > 0 ? pool : [...TEMAS_IG]
  const total = lista.reduce((s, t) => s + FICHAS_TEMA_IG[t].peso, 0)
  let x = Math.min(Math.max(azar, 0), 0.999999) * total
  for (const t of lista) {
    x -= FICHAS_TEMA_IG[t].peso
    if (x < 0) return t
  }
  return lista[lista.length - 1]
}

/** Rota la plantilla: la siguiente a la última usada (nunca la misma dos veces seguidas). */
export function elegirPlantilla(ultima: string | null | undefined): PlantillaIg {
  const i = PLANTILLAS_IG.indexOf(ultima as PlantillaIg)
  return PLANTILLAS_IG[(i + 1) % PLANTILLAS_IG.length]
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

const INSTRUCCION_PLANTILLA: Record<PlantillaIg, string> = {
  pregunta: 'titulo: una pregunta que el lector no sabe contestar sobre su propia póliza (máx 90 caracteres). sub: etiqueta corta del público (máx 40). puntos: [] (vacío).',
  claves: 'titulo: «3 cosas que…» o similar, concreto (máx 90). sub: etiqueta corta del público (máx 40). puntos: EXACTAMENTE 3 frases accionables (máx 110 cada una).',
  mito: 'titulo: la creencia equivocada tal como la diría alguien, entre comillas latinas «» (máx 90). sub: etiqueta corta del público (máx 40). puntos: EXACTAMENTE 1 frase con lo que pasa de verdad (máx 110).',
}

export function construirPrompt(tema: TemaIg, plantilla: PlantillaIg, reparos: readonly Reparo[] = []): string {
  const f = FICHAS_TEMA_IG[tema]
  const citas = f.normas.length
    ? `Puedes citar SOLO la norma que aparece en los HECHOS, tal como aparece. Ninguna otra ley, artículo, real decreto ni orden.`
    : `NO cites ninguna ley, artículo, real decreto ni orden.`
  const extra = reparos.length
    ? `\n\nTu respuesta anterior tenía estos problemas y hay que corregirlos TODOS:\n${reparos.map((r) => `- ${r.campo}: ${r.motivo}`).join('\n')}`
    : ''
  return `Escribes un post de Instagram para ${MEDIADOR.marca} (se escribe exactamente así: «${MEDIADOR.marca}», con A y S mayúsculas), la correduría de seguros de Alberto, corredor de seguros independiente. Vende en toda España.
TONO: corredor cercano que habla claro, de tú, sin tecnicismos ni palabrería. Frases cortas. En español de España.
PÚBLICO: ${f.publico}.
HECHOS que puedes usar (no añadas otros datos, cifras ni porcentajes): ${f.hechos}
PROHIBIDO: prometer precios, ahorros, porcentajes o «el mejor»; decir «garantizamos»; inventar cifras, estadísticas, casos o clientes; limitar el servicio a una ciudad o región (nada de «en Sevilla» ni «en Andalucía»); hablar de «módulos»; nombrar compañías o competidores. ${citas}
PLANTILLA «${plantilla}»: ${INSTRUCCION_PLANTILLA[plantilla]}
CAPTION: 400-1.200 caracteres. Primera línea = gancho sin emoji. Una idea útil que el lector pueda comprobar hoy en su póliza. Termina invitando a escribir o a guardar el post. Como mucho 3 hashtags y solo si son específicos del tema (nada de #seguros genéricos ni de alcance). NO pongas firma, clave ni datos del mediador: se añaden después.
Responde SOLO con JSON: {"titulo":"","sub":"","puntos":[],"caption":""}${extra}`
}

/** Parseo tolerante (```json …```, texto alrededor). `null` si no hay JSON legible. */
export function parsearPieza(raw: string): PiezaIg | null {
  const limpio = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const i = limpio.indexOf('{')
  const j = limpio.lastIndexOf('}')
  if (i < 0 || j <= i) return null
  try {
    const o = JSON.parse(limpio.slice(i, j + 1)) as Partial<PiezaIg>
    if (!o || typeof o !== 'object') return null
    return {
      titulo: typeof o.titulo === 'string' ? o.titulo.trim() : '',
      sub: typeof o.sub === 'string' ? o.sub.trim() : '',
      puntos: Array.isArray(o.puntos) ? o.puntos.filter((p): p is string => typeof p === 'string').map((p) => p.trim()) : [],
      caption: typeof o.caption === 'string' ? o.caption.trim() : '',
    }
  } catch {
    return null
  }
}

// ─── Pie del mediador y caption final ───────────────────────────────────────

/** Pie fijo del caption: quién publica y su clave DGSFP. Sale de `MEDIADOR`, nunca a mano. */
export function pieMediador(): string {
  return `${MEDIADOR.marca} · ${MEDIADOR.identidad.nombre}, ${MEDIADOR.identidad.figura.toLowerCase()}. Inscrito en la DGSFP con clave ${MEDIADOR.identidad.claveDgsfp}.`
}

/** Tope de Instagram para el caption. */
export const MAX_CAPTION_IG = 2200

export function captionFinal(p: PiezaIg): string {
  return `${p.caption.trim()}\n\n${pieMediador()}`
}

/** Todo lo que se publica: lo que se pinta en la imagen + el caption final. Es lo que se revisa. */
export function textoPublicado(p: PiezaIg): string {
  return [p.titulo, p.sub, ...p.puntos, captionFinal(p)].join('\n')
}

// ─── El cepo ─────────────────────────────────────────────────────────────────

export type Reparo = { campo: string; motivo: string }

const HASHTAGS_RELLENO = /^#(seguros?|instagood|love|like|follow|followme|photooftheday|viral|fyp|parati|explore|explorepage|reels|insta)$/i
const LIMITES = { titulo: 90, sub: 40, punto: 110 }
const PUNTOS_POR_PLANTILLA: Record<PlantillaIg, number> = { pregunta: 0, claves: 3, mito: 1 }

/**
 * Revisa una pieza y devuelve TODOS los reparos (si hay que regenerar, el segundo
 * intento debe corregirlo todo de una vez). Vacío = publicable.
 */
export function revisarPieza(p: PiezaIg, tema: TemaIg, plantilla: PlantillaIg): Reparo[] {
  const reparos: Reparo[] = []
  if (!p.titulo) reparos.push({ campo: 'titulo', motivo: 'vacío' })
  if (!p.caption) reparos.push({ campo: 'caption', motivo: 'vacío' })
  if (p.titulo.length > LIMITES.titulo) reparos.push({ campo: 'titulo', motivo: `${p.titulo.length} caracteres (máx ${LIMITES.titulo}): no cabe en la imagen` })
  if (p.sub.length > LIMITES.sub) reparos.push({ campo: 'sub', motivo: `${p.sub.length} caracteres (máx ${LIMITES.sub})` })
  const esperados = PUNTOS_POR_PLANTILLA[plantilla]
  if (p.puntos.length !== esperados || p.puntos.some((x) => !x)) {
    reparos.push({ campo: 'puntos', motivo: `la plantilla «${plantilla}» lleva ${esperados} punto(s) con texto (llegan ${p.puntos.length})` })
  }
  for (const x of p.puntos) {
    if (x.length > LIMITES.punto) reparos.push({ campo: 'puntos', motivo: `un punto de ${x.length} caracteres (máx ${LIMITES.punto})` })
  }
  const final = captionFinal(p)
  if (final.length > MAX_CAPTION_IG) reparos.push({ campo: 'caption', motivo: `${final.length} caracteres (Instagram corta en ${MAX_CAPTION_IG})` })

  const texto = textoPublicado(p)

  // 1) El mismo cepo regulatorio que la web, el blog y LinkedIn (RDL 3/2020). Una sola fuente.
  const infracciones = revisarCopy(texto)
  if (infracciones.length) reparos.push({ campo: 'copy', motivo: explicarInfracciones(infracciones) })

  // 2) Normas: solo las que la ficha del tema permite (verificadas contra el BOE).
  const sinRespaldo = citasNoRespaldadas(texto, FICHAS_TEMA_IG[tema].normas)
  if (sinRespaldo.length) reparos.push({ campo: 'citas', motivo: `cita normas no verificadas: ${sinRespaldo.join(', ')}` })

  // 3) Marca: «Grupo ASegura», con A y S mayúsculas (es el monograma).
  for (const m of texto.matchAll(/grupo\s+asegura/gi)) {
    if (m[0] !== MEDIADOR.marca) { reparos.push({ campo: 'marca', motivo: `«${m[0]}»: se escribe «${MEDIADOR.marca}»` }); break }
  }

  // 4) Sin «módulos» de producto (vocabulario de ia.rest, no de una correduría).
  if (/\bm[óo]dulos?\b/i.test(texto)) reparos.push({ campo: 'copy', motivo: 'habla de «módulos»: es vocabulario de software, no de seguros' })

  // 5) Sin hashtags de relleno.
  const tags = p.caption.match(/#[\p{L}\p{N}_]+/gu) ?? []
  if (tags.length > 3) reparos.push({ campo: 'hashtags', motivo: `${tags.length} hashtags (máx 3, y solo específicos)` })
  const relleno = tags.filter((t) => HASHTAGS_RELLENO.test(t))
  if (relleno.length) reparos.push({ campo: 'hashtags', motivo: `hashtags de relleno: ${relleno.join(' ')}` })

  return reparos
}

export type DecisionRevision = 'aceptar' | 'regenerar' | 'descartar'

/**
 * Qué hacer tras revisar el intento `intento` (1, 2…): limpio → aceptar; con reparos
 * en el 1.º → regenerar UNA vez; con reparos en el 2.º o posterior → descartar.
 */
export function decidirTrasRevision(intento: number, reparos: readonly Reparo[]): DecisionRevision {
  if (reparos.length === 0) return 'aceptar'
  return intento < 2 ? 'regenerar' : 'descartar'
}

export function explicarReparos(reparos: readonly Reparo[]): string {
  return reparos.map((r) => `· ${r.campo}: ${r.motivo}`).join('\n')
}

// ─── Telegram: prefijo `asig_` ───────────────────────────────────────────────

export const PREFIJO_ASIG = 'asig'
export const ACCIONES_ASIG = ['aprobar', 'descartar', 'regenerar'] as const
export type AccionAsig = (typeof ACCIONES_ASIG)[number]

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function callbackAsig(accion: AccionAsig, id: string): string {
  return `${PREFIJO_ASIG}_${accion}:${id}`
}

export type CallbackAsig =
  | { ok: true; accion: AccionAsig; id: string }
  | { ok: false; motivo: string }

/**
 * Interpreta `callback_data`. 🚨 Validación EXPLÍCITA de las tres acciones: un botón
 * desconocido (entrega duplicada, dato corrupto, un cuarto botón futuro) NUNCA cae en
 * «aprobar» por defecto.
 */
export function interpretarCallbackAsig(data: string | null | undefined): CallbackAsig {
  const d = String(data ?? '')
  const m = /^asig_([a-z]+):(.+)$/.exec(d)
  if (!m) return { ok: false, motivo: 'no es un botón de Instagram de la correduría' }
  const accion = m[1] as AccionAsig
  if (!ACCIONES_ASIG.includes(accion)) return { ok: false, motivo: 'botón no reconocido' }
  if (!RE_UUID.test(m[2])) return { ok: false, motivo: 'borrador no reconocido' }
  return { ok: true, accion, id: m[2].toLowerCase() }
}

// ─── Publicar por Graph API o «a mano» ──────────────────────────────────────

export const ENV_IG_TOKEN = 'ASEGURA_INSTAGRAM_ACCESS_TOKEN'
export const ENV_IG_USER = 'ASEGURA_INSTAGRAM_USER_ID'

export type DecisionPublicacion =
  | { modo: 'graph'; credenciales: { token: string; userId: string } }
  | { modo: 'manual'; faltan: string[] }

/**
 * Publicación real SOLO si existen las DOS envs con contenido. Si falta cualquiera
 * (hoy no hay perfil de Instagram de Grupo ASegura), modo manual. Sin literales de respaldo.
 */
export function decidirPublicacion(env: Record<string, string | undefined>): DecisionPublicacion {
  const token = (env[ENV_IG_TOKEN] ?? '').trim()
  const userId = (env[ENV_IG_USER] ?? '').trim()
  const faltan = [!token && ENV_IG_TOKEN, !userId && ENV_IG_USER].filter((x): x is string => !!x)
  if (faltan.length) return { modo: 'manual', faltan }
  return { modo: 'graph', credenciales: { token, userId } }
}

/** URL pública de la imagen del borrador (la lee Instagram y la abre Alberto). */
export function urlImagenIg(base: string, id: string): string {
  return `${base.replace(/\/$/, '')}/api/publico/asegura-ig/${id}`
}

// ─── Colores de marca en sRGB ───────────────────────────────────────────────
// `@central/brand` guarda varios tonos en oklch y el renderizador de imágenes
// (satori, `next/og`) no entiende oklch. Se convierten aquí, de la paleta, en vez
// de copiar hex a mano: el día que cambie la marca, cambia la imagen.

function canal(x: number): string {
  const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
}

/** `#rrggbb` → igual (minúsculas); `oklch(L C H [/ a])` → `#rrggbb`. Lanza con cualquier otra cosa. */
export function aHexSrgb(color: string): string {
  const c = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase()
  const m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.%]+)?\s*\)$/i.exec(c)
  if (!m) throw new Error(`color no convertible: ${color}`)
  const L = Number(m[1]) / (m[2] ? 100 : 1)
  const C = Number(m[3])
  const h = (Number(m[4]) * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const r = 4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s
  const bl = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s
  return `#${canal(r)}${canal(g)}${canal(bl)}`
}
