// GRABADOR del tarificador RPA — TROCEO de pantallas grandes (07/10/2026). Funciones PURAS (`node --test`).
//
// Causa del corte «la respuesta de la IA se cortó»: una pantalla de ~300 campos (Allianz ePAC) pide a la IA
// listar TODO en una sola salida (>30k caracteres de JSON), más de lo que gemini-2.5-flash genera en los 55 s de
// la pasarela. Subir tokens no vale: hay que REDUCIR LA SALIDA POR LLAMADA. Aquí:
//   1. La entrada se adelgaza: sin inputs hidden y con ≤ MAX_OPCIONES_IA opciones por select.
//   2. Se trocea por controles (nunca a través de un marco ni de un select) con un presupuesto de tokens de SALIDA.
//   3. La IA ya no devuelve `marco`: lo pone el servidor (sabe de qué marco es cada trozo).
//   4. Se fusionan los trozos de forma determinista; en un duplicado manda PROHIBIDO y la regla de bloqueo se
//      re-aplica sobre el conjunto: ningún trozo puede «desprohibir» un botón.

import { clasificarBoton, type BotonMapa, type CampoMapa, type PantallaMapa, type PrimaMapa } from '@central/module-tarificacion'

/** Opciones por select que se mandan a la IA y se le piden (misma cifra que el prompt). */
export const MAX_OPCIONES_TROZO = 25
/** Presupuesto de tokens de SALIDA estimados por llamada (muy por debajo de lo que el flash genera en 55 s). */
export const PRESUPUESTO_SALIDA_TOKENS = 3_500
/** Llamadas simultáneas por pantalla (todas en la misma espera: el tiempo es el del trozo más lento, no la suma). */
export const CONCURRENCIA_TROZOS = 10
/** Milisegundos tras los que un lote deja de EMPEZAR pantallas nuevas (la UI repite con las pendientes; la ruta dura 300 s). */
export const PRESUPUESTO_LOTE_MS = 100_000

/** Tope de caracteres del HTML recortado ANTES de trocear (solo evita absurdos; el límite fino es por trozo). */
export const MAX_CHARS_ENTRADA_TROCEO = 600_000

/** Llamadas que cuesta una pantalla; si supera el TOTAL permitido nunca se podrá analizar: mensaje accionable (si no, null). */
export function errorPantallaExcedeTope(llamadas: number, max: number): string | null {
  return llamadas > max
    ? `pantalla demasiado grande: ${llamadas} trozos > tope de ${max} llamadas; sube TARIFICADOR_GRABADOR_MAX_LLAMADAS (máx. 200) y pulsa «Reintentar»`
    : null
}

/** Como Promise.all, pero un rechazo se convierte en `{ error }` y no aborta a los hermanos ya lanzados. */
export async function esperarOla<T>(ps: Promise<T>[]): Promise<(T | { error: string })[]> {
  const rs = await Promise.allSettled(ps)
  return rs.map((r) => (r.status === 'fulfilled' ? r.value : { error: `error interno al analizar el trozo: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}` }))
}

const TOKENS_CONTROL = 55
const TOKENS_BOTON = 45
const TOKENS_OPCION = 6

export type Trozo = { marco: string | null; html: string; salidaEstimada: number }

const RE_SECCION = /(?:^|\n)(?=### (?:marco «|página principal))/
const RE_CABECERA = /^### (?:marco «([^»]*)»|página principal)\n?/
const RE_HIDDEN = /<input\b[^>]*\btype=["']?hidden["']?[^>]*>/gi
const RE_SELECT = /<select\b[\s\S]*?<\/select>/gi
const RE_CONTROL = /<select\b[\s\S]*?<\/select>|<(?:input|textarea|button)\b[^>]*>|<a\b[^>]*>/gi

/** Quita los inputs hidden (irrelevantes para el mapa) y recorta las opciones de cada select. */
export function adelgazarHtml(html: string, maxOpciones = MAX_OPCIONES_TROZO): string {
  return html.replace(RE_HIDDEN, '').replace(RE_SELECT, (sel) => {
    const partes = sel.split(/(?=<option\b)/i)
    if (partes.length - 1 <= maxOpciones) return sel
    const cierre = /<\/select>\s*$/i.test(partes[partes.length - 1]) ? '</select>' : ''
    const kept = partes.slice(0, maxOpciones + 1).join('')
    return kept.replace(/<\/select>\s*$/i, '') + cierre
  })
}

function pesoControl(c: string): number {
  if (/^<select/i.test(c)) return TOKENS_CONTROL + TOKENS_OPCION * Math.min((c.match(/<option\b/gi) ?? []).length, MAX_OPCIONES_TROZO)
  if (/^<(?:button|a)\b/i.test(c)) return TOKENS_BOTON
  return TOKENS_CONTROL
}

/** Estimación de los tokens de salida que pide un HTML (controles + opciones acotadas). */
export function estimarSalidaTokens(html: string): number {
  let n = 0
  for (const m of html.matchAll(RE_CONTROL)) n += pesoControl(m[0])
  return n
}

/**
 * Trocea el HTML recortado (`recortarHtmlParaIA`: secciones `### marco «ruta»` / `### página principal`).
 * Cada trozo es de UN solo marco, no parte ningún select y no pasa del presupuesto de salida (salvo un control suelto).
 * Una pantalla pequeña devuelve UN trozo (una sola llamada, como antes).
 */
export function trocearHtmlIA(htmlRecortado: string, presupuesto = PRESUPUESTO_SALIDA_TOKENS): Trozo[] {
  const trozos: Trozo[] = []
  for (const seccion of htmlRecortado.split(RE_SECCION)) {
    if (!seccion.trim()) continue
    const cab = RE_CABECERA.exec(seccion)
    const ruta = cab ? (cab[1] ?? null) : null
    const marco = ruta && ruta !== '?' ? ruta : null
    const cuerpo = adelgazarHtml(cab ? seccion.slice(cab[0].length) : seccion)
    if (!cuerpo.trim()) continue
    const etiqueta = (cuerpo2: string) => `${cab ? cab[0].trimEnd() : '### página principal'}\n${cuerpo2}`
    let inicio = 0, acumulado = 0
    const cerrar = (fin: number) => {
      const parte = cuerpo.slice(inicio, fin)
      if (parte.trim()) trozos.push({ marco, html: etiqueta(parte), salidaEstimada: estimarSalidaTokens(parte) })
      inicio = fin
      acumulado = 0
    }
    for (const m of cuerpo.matchAll(RE_CONTROL)) {
      const w = pesoControl(m[0])
      if (acumulado > 0 && acumulado + w > presupuesto) cerrar(m.index!)
      acumulado += w
    }
    cerrar(cuerpo.length)
  }
  return trozos
}

// ─── Fusión ──────────────────────────────────────────────────────────────────

/** Pone el marco que conoce el servidor en todo lo que devolvió la IA para un trozo (la IA ya no lo repite). */
export function inyectarMarco(json: unknown, marco: string | null): unknown {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return json
  const o = { ...(json as Record<string, unknown>) }
  for (const k of ['campos', 'botones', 'primas']) {
    const v = o[k]
    if (Array.isArray(v)) o[k] = v.map((x) => (typeof x === 'object' && x !== null && !Array.isArray(x) ? { ...(x as object), marco } : x))
  }
  return o
}

const clave = (marco: string | null, selector: string | null, extra = '') => `${marco ?? ''}\u0000${selector ?? ''}\u0000${extra}`

/**
 * Fusiona las pantallas ya validadas de los trozos (en orden) en UNA. Determinista: título del primer trozo,
 * notas unidas (≤1000), duplicados por marco+selector fuera. 🚨 En un botón duplicado manda PROHIBIDO, y la
 * regla de bloqueo se vuelve a aplicar sobre el resultado: ningún trozo puede desprohibir un botón.
 */
export function fusionarTrozos(pantalla: number, partes: PantallaMapa[]): { pantalla: PantallaMapa; forzados: number } {
  const campos = new Map<string, CampoMapa>()
  const botones = new Map<string, BotonMapa>()
  const primas = new Map<string, PrimaMapa>()
  for (const p of partes) {
    for (const c of p.campos) if (!campos.has(clave(c.marco, c.selector))) campos.set(clave(c.marco, c.selector), c)
    for (const b of p.botones) {
      const k = clave(b.marco, b.selector, b.texto)
      const previo = botones.get(k)
      if (!previo) botones.set(k, b)
      else botones.set(k, { ...previo, clase: previo.clase === 'prohibido' || b.clase === 'prohibido' ? 'prohibido' : 'seguro', forzado: previo.forzado || b.forzado })
    }
    for (const r of p.primas) if (!primas.has(clave(r.marco, r.selector, r.etiqueta))) primas.set(clave(r.marco, r.selector, r.etiqueta), r)
  }
  let forzados = 0
  const botonesFinal = [...botones.values()].map((b) => {
    const regla = clasificarBoton([b.texto, b.selector, b.funcion])
    if (regla.clase === 'prohibido' && b.clase !== 'prohibido') { forzados++; return { ...b, clase: 'prohibido' as const, forzado: true } }
    return b
  })
  const notas = partes.map((p) => p.notas).filter((n): n is string => !!n).join(' · ').slice(0, 1000) || null
  return {
    pantalla: { pantalla, titulo: partes[0]?.titulo ?? '', campos: [...campos.values()], botones: botonesFinal, primas: [...primas.values()], notas },
    forzados,
  }
}
