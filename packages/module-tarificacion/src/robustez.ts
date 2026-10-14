// F2 del plan de robustez de los bots RPA (14/10/2026, docs/TARIFICADOR-RPA.md «Plan de robustez»). PURO: lo comparten el
// worker (services/tarificador-rpa), el orquestador (apps/asegura) y plataforma.
//
//   1. APRENDIDO CON CONFIANZA (`tarificador_conocimiento`): lo aprendido se usa al momento, se CONSOLIDA tras
//      `UMBRAL_CONSOLIDAR_APRENDIDO` éxitos (o al instante si lo eligió Alberto) y se DESCARTA tras `UMBRAL_DESCARTAR_APRENDIDO`
//      fallos SEGUIDOS (un éxito pone el contador de fallos a cero). Descartado = deja de servirse; la fila queda de rastro.
//   2. CORTE POR COMPAÑÍA/RAMO: tras `UMBRAL_CORTE_BOT` trabajos SEGUIDOS en `error_definitivo` por fallo del bot (portal o
//      infraestructura) para la misma pareja, se deja de encolar y de reclamar hasta que Alberto la reanuda.
//   3. ATASCO: ni el selector fijo, ni lo aprendido, ni la IA resolvieron un paso → el trabajo queda `atascado` con su
//      checkpoint (paso, candidatos numerados y redactados, captura) y Alberto elige uno. La elección se APRENDE (origen
//      `humano`) y el MISMO trabajo vuelve a la cola: el worker repite el camino y, en ese paso, lo aprendido lo resuelve
//      pasando por la MISMA validación determinista (tablas cerradas + guard de emisión). Nunca abre una acción nueva.
//
// 🔒 Sin datos personales en lo que se enseña: textos y etiquetas pasan por `redactarDatosPersonales` (otra vez aquí, aunque
//    el worker ya los redactó). El selector viaja al orquestador (como el que ya guarda lo aprendido) pero NUNCA a Telegram ni
//    a la pantalla (`candidatosVisibles`).

import { pareceEmision } from './guard-emision.ts'
import { redactarDatosPersonales } from './formador.ts'

// ─── 1. Aprendido con confianza ──────────────────────────────────────────────

export const UMBRAL_CONSOLIDAR_APRENDIDO = 3
export const UMBRAL_DESCARTAR_APRENDIDO = 2

export type EstadoAprendido = 'provisional' | 'consolidado' | 'descartado'

/** Estado de una fila de lo aprendido. `null`/ausente en las marcas = no ha pasado (nunca «0»). */
export function estadoAprendido(f: { consolidadoAt?: unknown; descartadoAt?: unknown }): EstadoAprendido {
  if (f.descartadoAt !== null && f.descartadoAt !== undefined) return 'descartado'
  if (f.consolidadoAt !== null && f.consolidadoAt !== undefined) return 'consolidado'
  return 'provisional'
}

/**
 * Tras un uso CONFIRMADO (el worker lo validó y tuvo efecto). `origen = 'humano'` (lo eligió Alberto) consolida al momento.
 * Un éxito borra los fallos seguidos y rehabilita una fila descartada (el portal volvió a ser como se aprendió).
 */
export function trasExitoAprendido(prev: { confirmaciones: number; consolidado: boolean }, origen: string): { confirmaciones: number; fallos: 0; consolidar: boolean } {
  const confirmaciones = Math.max(0, Math.trunc(prev.confirmaciones || 0)) + 1
  return { confirmaciones, fallos: 0, consolidar: prev.consolidado || origen === 'humano' || confirmaciones >= UMBRAL_CONSOLIDAR_APRENDIDO }
}

/** Tras un FALLO (no resolvió, no validó o se usó y el trabajo cayó sin confirmarlo). Vale también para lo consolidado. */
export function trasFalloAprendido(prev: { fallos: number }): { fallos: number; descartar: boolean } {
  const fallos = Math.max(0, Math.trunc(prev.fallos || 0)) + 1
  return { fallos, descartar: fallos >= UMBRAL_DESCARTAR_APRENDIDO }
}

// ─── 2. Corte por compañía/ramo ──────────────────────────────────────────────

export const UMBRAL_CORTE_BOT = 3
/** Solo cuentan los fallos DEL BOT: un dato mal puesto, una credencial o un captcha no dicen que el portal haya cambiado. */
export const TIPOS_ERROR_CORTE = ['portal', 'infra'] as const

export type CierreTrabajo = { estado: string; tipoError: string | null }

/**
 * ¿Se corta la pareja (compañía, ramo)? `ultimos` = los trabajos CERRADOS (`ok` / `error_definitivo`) de la pareja, el más
 * reciente primero, solo los posteriores a la última reanudación. Un tipo desconocido o `null` («no se sabe») NO cuenta como
 * fallo del bot: ante la duda no se corta (cortar deja a la correduría sin precios).
 */
export function debeCortarBot(ultimos: readonly CierreTrabajo[], umbral = UMBRAL_CORTE_BOT): boolean {
  if (!Number.isInteger(umbral) || umbral < 1 || ultimos.length < umbral) return false
  return ultimos.slice(0, umbral).every((t) => t.estado === 'error_definitivo' && (TIPOS_ERROR_CORTE as readonly (string | null)[]).includes(t.tipoError))
}

// ─── 3. Atasco ───────────────────────────────────────────────────────────────

export const MAX_CANDIDATOS_ATASCO = 20
/** Rondas de atasco por trabajo: a la cuarta, `error_definitivo` (la elección no está funcionando). */
export const MAX_RONDAS_ATASCO = 3
export const HORAS_ATASCO_POR_DEFECTO = 24

/** Interruptor del orquestador: sin `TARIFICADOR_ATASCO_ACTIVO=1`, un atasco que llega se guarda como `error_definitivo` (como antes). */
export function atascoActivo(env: Record<string, string | undefined>): boolean {
  return (env.TARIFICADOR_ATASCO_ACTIVO ?? '').trim() === '1'
}

/** Horas que espera un atasco la respuesta de Alberto (`TARIFICADOR_ATASCO_HORAS`, 1..72; basura → 24). */
export function horasAtasco(env: Record<string, string | undefined>): number {
  const n = Number((env.TARIFICADOR_ATASCO_HORAS ?? '').trim())
  return Number.isInteger(n) && n >= 1 && n <= 72 ? n : HORAS_ATASCO_POR_DEFECTO
}

export type CandidatoAtasco = {
  /** Número que ve Alberto (1..N, consecutivo). */
  n: number
  tag: string
  id: string | null
  name: string | null
  type: string | null
  role: string | null
  texto: string | null
  etiqueta: string | null
  marco: string | null
  /** Para volver a encontrarlo (y aprenderlo). Nunca sale a Telegram ni a la pantalla. */
  selector: string
}

export type CandidatoAtascoVisible = Omit<CandidatoAtasco, 'selector' | 'name' | 'marco'>

export type TipoAtasco = 'campo' | 'accion'

export type AtascoWorker = {
  /** Clave del paso: un campo (`claveCampo`) o una acción de la tabla cerrada del worker. */
  clave: string
  tipo: TipoAtasco
  /** Qué se buscaba, en palabras (redactado). */
  descripcion: string
  /** Solo campos: la etiqueta real del formulario. */
  etiqueta: string | null
  /** Solo acciones: el texto esperado (de la tabla cerrada). */
  textoEsperado: string | null
  candidatos: CandidatoAtasco[]
}

const CLAVE = /^[a-z0-9_]{1,60}$/
const TAG = /^[a-z][a-z0-9-]{0,29}$/
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

function cad(v: unknown, max: number, pii = false): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  if (!t) return null
  return (pii ? redactarDatosPersonales(t) : t).slice(0, max)
}

/** Palabras que un candidato de atasco no puede llevar nunca (además del patrón de emisión del guard). */
const BLOQUEO_ATASCO = /firmar|pagar|contratar|contratacion|grabar|archivar|suplemento|anular/

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * ¿Un candidato lleva palabras de emisión/pago en su texto, id o name? Defensa en profundidad (el worker vuelve a validar con
 * `validarResolucion`). La etiqueta de la fila no se mira, igual que en `validarCampo` del worker (un campo «Fecha de
 * emisión» se rellena, no se pulsa).
 */
export function candidatoAtascoBloqueado(c: Pick<CandidatoAtasco, 'texto' | 'id' | 'name'>): boolean {
  return [c.texto, c.id, c.name].some((x) => x !== null && (pareceEmision(x) || BLOQUEO_ATASCO.test(sinTildes(x))))
}

/**
 * Lo que manda el worker en `error.atasco`, a LISTA BLANCA: claves conocidas, longitudes acotadas, textos redactados otra
 * vez, sin candidatos bloqueados (se quitan y se renumera). Forma rara o sin candidatos válidos → `null` (y el trabajo
 * falla como antes: `error_definitivo`).
 */
export function leerAtascoWorker(v: unknown): AtascoWorker | null {
  const o = obj(v)
  if (!o) return null
  const clave = typeof o.clave === 'string' ? o.clave.trim() : ''
  const tipo = o.tipo === 'campo' || o.tipo === 'accion' ? o.tipo : null
  const descripcion = cad(o.descripcion, 300, true)
  if (!CLAVE.test(clave) || !tipo || !descripcion || !Array.isArray(o.candidatos)) return null
  if (o.candidatos.length === 0 || o.candidatos.length > MAX_CANDIDATOS_ATASCO) return null
  const candidatos: CandidatoAtasco[] = []
  for (const x of o.candidatos) {
    const c = obj(x)
    if (!c) return null
    const tag = cad(c.tag, 30)?.toLowerCase() ?? null
    const selector = typeof c.selector === 'string' ? c.selector.trim() : ''
    if (!tag || !TAG.test(tag) || !selector || selector.length > 2000) return null
    const cand: CandidatoAtasco = {
      n: 0,
      tag,
      id: cad(c.id, 80),
      name: cad(c.name, 80),
      type: cad(c.type, 20)?.toLowerCase() ?? null,
      role: cad(c.role, 30),
      texto: cad(c.texto, 80, true),
      etiqueta: cad(c.etiqueta, 120, true),
      marco: cad(c.marco, 300),
      selector,
    }
    if (tag === 'input' && cand.type === 'password') continue
    if (candidatoAtascoBloqueado(cand)) continue
    candidatos.push(cand)
  }
  if (!candidatos.length) return null
  candidatos.forEach((c, i) => { c.n = i + 1 })
  return {
    clave,
    tipo,
    descripcion,
    etiqueta: tipo === 'campo' ? cad(o.etiqueta, 120, true) : null,
    textoEsperado: tipo === 'accion' ? cad(o.textoEsperado, 80) : null,
    candidatos,
  }
}

/** Lo que ven Telegram y la pantalla: sin selector, sin `name` ni marco (técnicos). */
export function candidatosVisibles(a: Pick<AtascoWorker, 'candidatos'>): CandidatoAtascoVisible[] {
  return a.candidatos.map(({ n, tag, id, type, role, texto, etiqueta }) => ({ n, tag, id, type, role, texto, etiqueta }))
}

/** El candidato número `n` de la lista guardada, o el motivo por el que no vale. */
export function elegirCandidatoAtasco(candidatos: readonly CandidatoAtasco[], n: unknown): { ok: true; c: CandidatoAtasco } | { ok: false; motivo: string } {
  if (typeof n !== 'number' || !Number.isInteger(n)) return { ok: false, motivo: 'el número elegido no es un entero' }
  const c = candidatos.find((x) => x.n === n)
  if (!c) return { ok: false, motivo: `no hay un elemento ${n} en la lista` }
  if (candidatoAtascoBloqueado(c)) return { ok: false, motivo: 'ese elemento no se puede usar (palabra de emisión o pago)' }
  return { ok: true, c }
}

/** ¿Llegó el atasco a su fin de espera? Con la hora de la BD. */
export function atascoCaducado(caducaAt: Date | null, ahora: Date): boolean {
  return caducaAt !== null && caducaAt.getTime() <= ahora.getTime()
}

/** Decisión al recibir un atasco: se guarda como `atascado` o cae a `error_definitivo` (con el motivo). */
export function decidirAtasco(f: { activo: boolean; modo: string | null; tipoError: string; rondasPrevias: number; atasco: AtascoWorker | null }): { atascar: true } | { atascar: false; motivo: string } {
  if (!f.atasco) return { atascar: false, motivo: 'sin checkpoint de atasco' }
  if (!f.activo) return { atascar: false, motivo: 'atascos apagados (TARIFICADOR_ATASCO_ACTIVO)' }
  if ((f.modo ?? 'tarificar') !== 'tarificar') return { atascar: false, motivo: `un trabajo de ${f.modo} no se atasca` }
  if (f.tipoError !== 'portal') return { atascar: false, motivo: `un fallo de tipo ${f.tipoError} no es un hueco del portal` }
  if (f.rondasPrevias >= MAX_RONDAS_ATASCO) return { atascar: false, motivo: `ya se atascó ${f.rondasPrevias} veces: la elección no está funcionando` }
  return { atascar: true }
}

/** Tope TOTAL de bytes de capturas (base64) por respuesta del puerto: el cuerpo de Vercel ronda 4,5 MB. */
export const MAX_BYTES_CAPTURAS_RESPUESTA = 3 * 1024 * 1024

/**
 * ¿Cabe una captura de `bytes` en la respuesta si ya van `usado` bytes de capturas? Pura. Lo que no cabe sale SIN captura
 * (`null`): el aviso llega igual, sin foto, en vez de reventar la respuesta y dejar sin avisar a todos.
 */
export function cabeCapturaEnRespuesta(usado: number, bytes: number, tope = MAX_BYTES_CAPTURAS_RESPUESTA): boolean {
  if (!Number.isFinite(usado) || !Number.isFinite(bytes) || bytes < 0 || usado < 0) return false
  return usado + bytes <= tope
}
