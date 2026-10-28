// «Gabinete de siniestros»: piezas PURAS de la IA del expediente (índice de la póliza, ficha del caso, veredicto).
// Sin red ni BD: lo impuro (llamadas a la IA, lectura del hilo) vive en `apps/asegura/lib/siniestro-ia.ts`.
//  · Huellas (`huellaDocumentos`, `huellaHilo`): deciden si el índice/ficha cacheados en el `meta` de un análisis
//    anterior siguen valiendo. Hash propio (sin `node:crypto`: lo importa también la pantalla).
//  · Validadores (`validarIndicePoliza`, `validarFichaCaso`, `validarVeredicto`): la salida de la IA es DATO no
//    fiable; lo que no cuadra se descarta (índice/ficha) o deja el veredicto en `null` (se guarda el texto tal cual).
//  · Citas: toda `cita` del índice y del veredicto pasa por `verificarCitas` contra SU fuente (póliza, hilo o ley).
//  · `metaGabinete`: anota SIEMPRE la versión de la base de conocimiento. `encajarMeta`: respeta el tope del meta.
import { verificarCitas } from './siniestro-citas.ts'
import { CONOCIMIENTO_SINIESTROS_VERSION } from './conocimiento-siniestros.ts'

export const GABINETE_VERSION = 1
/** Sube si cambia el prompt o la forma del índice: invalida los cacheados. */
export const INDICE_POLIZA_VERSION = 1
/** Sube si cambia el prompt o la forma de la ficha: invalida las cacheadas. */
export const FICHA_CASO_VERSION = 1

// ─── Huellas ────────────────────────────────────────────────────────────────────────────────────────────────

function fnv1a(s: string, semilla: number): number {
  let h = semilla >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Hash no criptográfico de 64 bits (dos FNV-1a de 32 con semillas distintas), en hex. Solo para detectar cambios. */
export function hashTexto(s: string): string {
  return fnv1a(s, 0x811c9dc5).toString(16).padStart(8, '0') + fnv1a(s, 0x9747b28c).toString(16).padStart(8, '0')
}

/** Huella de los documentos de la póliza usados (id + texto extraído). No depende del orden. */
export function huellaDocumentos(docs: ReadonlyArray<{ id: string; texto: string }>): string {
  const partes = docs.map((d) => `${d.id}:${d.texto.length}:${hashTexto(d.texto)}`).sort()
  return `doc:${hashTexto(partes.join('|'))}`
}

/**
 * Huella del hilo VIGENTE (pásale `hiloVigente(...)`): ids + fechas de los mensajes que NO son de la IA (un análisis
 * nuevo no debe invalidar la ficha que él mismo cachea) + `extra` (estado/fechas del siniestro). No depende del orden.
 */
export function huellaHilo(mensajes: ReadonlyArray<{ id: string; creadoAt: string; autor?: string }>, extra = ''): string {
  const partes = mensajes.filter((m) => m.autor !== 'ia').map((m) => `${m.id}@${m.creadoAt}`).sort()
  return `hilo:${hashTexto(partes.join('|') + '#' + extra)}`
}

// ─── Utilidades de validación ───────────────────────────────────────────────────────────────────────────────

const esObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const recorta = (s: string, max: number): string => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s)
/** Cadena no vacía recortada, o `null`. Las comillas «» se quitan (romperían la extracción de citas). */
function cad(x: unknown, max: number): string | null {
  if (typeof x !== 'string') return null
  const t = x.replace(/[«»]/g, '').trim()
  return t === '' ? null : recorta(t, max)
}
/** Una cita no se recorta con «…» (dejaría de verificarse): se corta en seco. */
function cita(x: unknown, max: number): string | null {
  if (typeof x !== 'string') return null
  const t = x.replace(/[«»]/g, '').trim()
  return t === '' ? null : t.slice(0, max).trim()
}

/** Saca el JSON de una respuesta de IA (tolera ```json … ``` y texto alrededor). `null` si no parsea. */
export function extraerJson(texto: string): unknown {
  const limpio = texto.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  try { return JSON.parse(limpio) } catch { /* sigue */ }
  const i = limpio.indexOf('{')
  const j = limpio.lastIndexOf('}')
  if (i < 0 || j <= i) return null
  try { return JSON.parse(limpio.slice(i, j + 1)) } catch { return null }
}

const comoJson = (x: unknown): unknown => (typeof x === 'string' ? extraerJson(x) : x)

// ─── Índice de la póliza ────────────────────────────────────────────────────────────────────────────────────

export const MAX_GARANTIAS_INDICE = 25
export const MAX_EXCLUSIONES_INDICE = 25

export type GarantiaIndice = { nombre: string; suma: string | null; franquicia: string | null; cita: string | null; citaVerificada?: boolean }
export type ExclusionIndice = { texto: string; cita: string | null; citaVerificada?: boolean }
/** `completo: false` = la IA dijo que no cupo todo o se recortó: NO sustituye al texto entero ni se reutiliza. */
export type IndicePoliza = { garantias: GarantiaIndice[]; exclusiones: ExclusionIndice[]; completo: boolean }
export type IndicePolizaCacheado = IndicePoliza & { version: number; huella: string; modelo: string; creadoAt: string }

export function validarIndicePoliza(json: unknown): IndicePoliza | null {
  const o = comoJson(json)
  if (!esObj(o) || !Array.isArray(o.garantias) || !Array.isArray(o.exclusiones)) return null
  const garantias: GarantiaIndice[] = []
  for (const g of o.garantias) {
    if (!esObj(g)) continue
    const nombre = cad(g.nombre, 120)
    if (!nombre) continue
    garantias.push({ nombre, suma: cad(g.suma, 80), franquicia: cad(g.franquicia, 80), cita: cita(g.cita, 220) })
  }
  const exclusiones: ExclusionIndice[] = []
  for (const x of o.exclusiones) {
    if (!esObj(x)) continue
    const texto = cad(x.texto, 200)
    if (!texto) continue
    exclusiones.push({ texto, cita: cita(x.cita, 220) })
  }
  const sobran = garantias.length > MAX_GARANTIAS_INDICE || exclusiones.length > MAX_EXCLUSIONES_INDICE
  return {
    garantias: garantias.slice(0, MAX_GARANTIAS_INDICE),
    exclusiones: exclusiones.slice(0, MAX_EXCLUSIONES_INDICE),
    completo: o.completo !== false && !sobran,
  }
}

/** Marca cada cita del índice como verificada o no contra el texto de la póliza. */
export function verificarCitasIndice(indice: IndicePoliza, textoPoliza: string): { indice: IndicePoliza; verificadas: string[]; noEncontradas: string[] } {
  const verificadas: string[] = []
  const noEncontradas: string[] = []
  const marca = <T extends { cita: string | null }>(it: T): T & { citaVerificada?: boolean } => {
    if (!it.cita) return { ...it }
    const ok = verificarCitas(`«${it.cita}»`, textoPoliza).verificadas.length === 1
    ;(ok ? verificadas : noEncontradas).push(it.cita)
    return { ...it, citaVerificada: ok }
  }
  return {
    indice: { ...indice, garantias: indice.garantias.map(marca), exclusiones: indice.exclusiones.map(marca) },
    verificadas,
    noEncontradas,
  }
}

// ─── Ficha del caso ─────────────────────────────────────────────────────────────────────────────────────────

export type FichaCaso = {
  cronologia: { fecha: string | null; hecho: string }[]
  /** Por ROL, sin nombres ni DNI (el meta va en claro). */
  partes: { rol: string; descripcion: string | null }[]
  importesPerito: { concepto: string; importe: string }[]
  garantiaEnJuego: string | null
  motivoRehuse: string | null
  documentosFaltan: string[]
}
export type FichaCasoCacheada = FichaCaso & { version: number; huella: string; modelo: string; creadoAt: string }

const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/
function fecha(x: unknown): string | null {
  if (typeof x !== 'string' || !RE_DIA.test(x.trim())) return null
  const d = new Date(`${x.trim()}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== x.trim() ? null : x.trim()
}

export function validarFichaCaso(json: unknown): FichaCaso | null {
  const o = comoJson(json)
  if (!esObj(o)) return null
  const cronologia = lista(o.cronologia).flatMap((c) => {
    if (!esObj(c)) return []
    const hecho = cad(c.hecho, 240)
    return hecho ? [{ fecha: fecha(c.fecha), hecho }] : []
  }).slice(0, 15)
  const partes = lista(o.partes).flatMap((p) => {
    if (!esObj(p)) return []
    const rol = cad(p.rol, 60)
    return rol ? [{ rol, descripcion: cad(p.descripcion, 120) }] : []
  }).slice(0, 8)
  const importesPerito = lista(o.importesPerito).flatMap((i) => {
    if (!esObj(i)) return []
    const concepto = cad(i.concepto, 120)
    const importe = cad(i.importe, 60)
    return concepto && importe ? [{ concepto, importe }] : []
  }).slice(0, 10)
  const documentosFaltan = lista(o.documentosFaltan).flatMap((d) => {
    const t = cad(d, 160)
    return t ? [t] : []
  }).slice(0, 10)
  return {
    cronologia, partes, importesPerito, documentosFaltan,
    garantiaEnJuego: cad(o.garantiaEnJuego, 240),
    motivoRehuse: cad(o.motivoRehuse, 400),
  }
}

// ─── Caché en el meta de los análisis anteriores ────────────────────────────────────────────────────────────

type MensajeConMeta = { autor: string; tipo: string; meta?: Record<string, unknown> | null }

/** Índice cacheado del análisis MÁS RECIENTE con la misma huella y versión, completo. Revalida la forma. */
export function indiceCacheado(mensajes: readonly MensajeConMeta[], huella: string): IndicePolizaCacheado | null {
  for (let i = mensajes.length - 1; i >= 0; i--) {
    const m = mensajes[i]
    if (m.autor !== 'ia' || m.tipo !== 'analisis' || !esObj(m.meta)) continue
    const c = m.meta.indicePoliza
    if (!esObj(c) || c.huella !== huella || c.version !== INDICE_POLIZA_VERSION || c.completo !== true) continue
    const v = validarIndicePoliza(c)
    if (!v || !v.completo) continue
    // Conserva las marcas de verificación que ya traía.
    return { ...(c as unknown as IndicePolizaCacheado) }
  }
  return null
}

export function fichaCacheada(mensajes: readonly MensajeConMeta[], huella: string): FichaCasoCacheada | null {
  for (let i = mensajes.length - 1; i >= 0; i--) {
    const m = mensajes[i]
    if (m.autor !== 'ia' || m.tipo !== 'analisis' || !esObj(m.meta)) continue
    const c = m.meta.fichaCaso
    if (!esObj(c) || c.huella !== huella || c.version !== FICHA_CASO_VERSION) continue
    const v = validarFichaCaso(c)
    if (!v) continue
    return { ...v, version: FICHA_CASO_VERSION, huella, modelo: typeof c.modelo === 'string' ? c.modelo : '', creadoAt: typeof c.creadoAt === 'string' ? c.creadoAt : '' }
  }
  return null
}

/** Veredicto del último análisis vigente (para que el siguiente «analizar» sepa qué preguntas hizo). */
export function ultimoVeredicto(mensajes: readonly MensajeConMeta[]): Veredicto | null {
  for (let i = mensajes.length - 1; i >= 0; i--) {
    const m = mensajes[i]
    if (m.autor !== 'ia' || m.tipo !== 'analisis' || !esObj(m.meta)) continue
    const r = validarVeredicto(m.meta.veredicto)
    return r.ok ? r.veredicto : null
  }
  return null
}

// ─── Veredicto ──────────────────────────────────────────────────────────────────────────────────────────────

export type SemaforoVeredicto = 'defendible' | 'no_defendible' | 'faltan_datos'
export type ApoyoArgumento = 'poliza' | 'ley' | 'hechos'
export type ArgumentoVeredicto = {
  texto: string
  apoyo: ApoyoArgumento
  cita: string | null
  /** `true`/`false` tras `verificarCitasVeredicto` (contra la fuente de su `apoyo`); ausente si no hay cita. */
  citaVerificada?: boolean
}
export type Veredicto = {
  semaforo: SemaforoVeredicto
  confianza: 'alta' | 'media' | 'baja'
  resumen: string | null
  /** Lo que la IA necesita saber de Alberto antes de opinar. Con `faltan_datos`, al menos una. */
  preguntas: string[]
  argumentos: ArgumentoVeredicto[]
  derivar: null | 'abogado' | 'perito_externo'
  plazosAccion: { que: string; fecha: string | null; base: string }[]
  /** SOLO aviso: otras pólizas EN VIGOR del mismo cliente que podrían cubrir. Ids filtrados a la lista dada. */
  otrasPolizas: { polizaId: string; ramo: string; compania: string; motivo: string }[]
  /** Obligatoria con `no_defendible`: explicación en lenguaje llano para el cliente. */
  explicacionCliente: string | null
}

const SEMAFOROS: readonly SemaforoVeredicto[] = ['defendible', 'no_defendible', 'faltan_datos']
const CONFIANZAS = ['alta', 'media', 'baja'] as const
const APOYOS: readonly ApoyoArgumento[] = ['poliza', 'ley', 'hechos']

export type ResultadoVeredicto = { ok: true; veredicto: Veredicto } | { ok: false; motivo: string }

/**
 * Valida el JSON del veredicto (objeto o texto con JSON). Estricto en lo que la UI pinta: semáforo, confianza,
 * preguntas, argumentos. `polizasPermitidas`: ids de las pólizas en vigor que se pasaron al modelo; otro id se descarta.
 */
export function validarVeredicto(json: unknown, opts: { polizasPermitidas?: readonly string[] } = {}): ResultadoVeredicto {
  const o = comoJson(json)
  if (!esObj(o)) return { ok: false, motivo: 'no es un objeto JSON' }
  if (!SEMAFOROS.includes(o.semaforo as SemaforoVeredicto)) return { ok: false, motivo: 'semaforo no válido' }
  if (!CONFIANZAS.includes(o.confianza as (typeof CONFIANZAS)[number])) return { ok: false, motivo: 'confianza no válida' }
  if (!Array.isArray(o.preguntas)) return { ok: false, motivo: 'faltan preguntas (lista)' }
  if (!Array.isArray(o.argumentos)) return { ok: false, motivo: 'faltan argumentos (lista)' }

  const preguntas: string[] = []
  for (const p of o.preguntas) {
    const t = cad(p, 300)
    if (!t) return { ok: false, motivo: 'pregunta vacía o no es texto' }
    preguntas.push(t)
  }
  const argumentos: ArgumentoVeredicto[] = []
  for (const a of o.argumentos) {
    if (!esObj(a)) return { ok: false, motivo: 'argumento no es un objeto' }
    const texto = cad(a.texto, 600)
    if (!texto) return { ok: false, motivo: 'argumento sin texto' }
    if (!APOYOS.includes(a.apoyo as ApoyoArgumento)) return { ok: false, motivo: 'apoyo no válido' }
    if (a.cita !== undefined && a.cita !== null && typeof a.cita !== 'string') return { ok: false, motivo: 'cita no es texto' }
    argumentos.push({ texto, apoyo: a.apoyo as ApoyoArgumento, cita: cita(a.cita, 300) })
  }
  const derivar = o.derivar ?? null
  if (derivar !== null && derivar !== 'abogado' && derivar !== 'perito_externo') return { ok: false, motivo: 'derivar no válido' }
  if (o.plazosAccion !== undefined && !Array.isArray(o.plazosAccion)) return { ok: false, motivo: 'plazosAccion no es una lista' }
  const plazosAccion: Veredicto['plazosAccion'] = []
  for (const z of lista(o.plazosAccion)) {
    if (!esObj(z)) return { ok: false, motivo: 'plazo no es un objeto' }
    const que = cad(z.que, 240)
    if (!que) return { ok: false, motivo: 'plazo sin «que»' }
    if (z.fecha !== null && z.fecha !== undefined && fecha(z.fecha) === null) return { ok: false, motivo: 'fecha de plazo no es AAAA-MM-DD' }
    plazosAccion.push({ que, fecha: fecha(z.fecha), base: cad(z.base, 240) ?? 'falta' })
  }
  if (o.otrasPolizas !== undefined && !Array.isArray(o.otrasPolizas)) return { ok: false, motivo: 'otrasPolizas no es una lista' }
  const permitidas = opts.polizasPermitidas ? new Set(opts.polizasPermitidas) : null
  const otrasPolizas: Veredicto['otrasPolizas'] = []
  for (const p of lista(o.otrasPolizas)) {
    if (!esObj(p)) continue
    const polizaId = cad(p.polizaId, 80)
    const motivo = cad(p.motivo, 300)
    if (!polizaId || !motivo) continue
    if (permitidas && !permitidas.has(polizaId)) continue
    otrasPolizas.push({ polizaId, ramo: cad(p.ramo, 60) ?? 'falta', compania: cad(p.compania, 120) ?? 'falta', motivo })
  }
  const semaforo = o.semaforo as SemaforoVeredicto
  const explicacionCliente = cad(o.explicacionCliente, 1200)
  if (semaforo === 'faltan_datos' && preguntas.length === 0) return { ok: false, motivo: 'faltan_datos sin preguntas' }
  if (semaforo === 'no_defendible' && !explicacionCliente) return { ok: false, motivo: 'no_defendible sin explicación para el cliente' }
  if (semaforo === 'defendible' && argumentos.length === 0) return { ok: false, motivo: 'defendible sin argumentos' }
  return {
    ok: true,
    veredicto: {
      semaforo,
      confianza: o.confianza as Veredicto['confianza'],
      resumen: cad(o.resumen, 800),
      preguntas: preguntas.slice(0, 8),
      argumentos: argumentos.slice(0, 10),
      derivar: derivar as Veredicto['derivar'],
      plazosAccion: plazosAccion.slice(0, 8),
      otrasPolizas: otrasPolizas.slice(0, 8),
      explicacionCliente,
    },
  }
}

/** Verifica cada `cita` del veredicto contra la fuente de su apoyo (póliza, hilo o base de conocimiento). */
export function verificarCitasVeredicto(
  v: Veredicto,
  fuentes: { poliza: string; hechos: string; ley: string },
): { veredicto: Veredicto; verificadas: string[]; noEncontradas: string[] } {
  const verificadas: string[] = []
  const noEncontradas: string[] = []
  const argumentos = v.argumentos.map((a) => {
    if (!a.cita) return { ...a }
    const ok = verificarCitas(`«${a.cita}»`, fuentes[a.apoyo]).verificadas.length === 1
    ;(ok ? verificadas : noEncontradas).push(a.cita)
    return { ...a, citaVerificada: ok }
  })
  return { veredicto: { ...v, argumentos }, verificadas, noEncontradas }
}

const ETIQUETA_SEMAFORO: Record<SemaforoVeredicto, string> = {
  defendible: 'DEFENDIBLE', no_defendible: 'NO DEFENDIBLE', faltan_datos: 'FALTAN DATOS',
}
const ETIQUETA_APOYO: Record<ApoyoArgumento, string> = { poliza: 'póliza', ley: 'ley', hechos: 'hechos' }

/** Texto legible del veredicto (es lo que se guarda, cifrado, como mensaje 'analisis'). */
export function textoVeredicto(v: Veredicto): string {
  const l: string[] = [`Semáforo: ${ETIQUETA_SEMAFORO[v.semaforo]} · confianza ${v.confianza}`]
  if (v.resumen) l.push('', v.resumen)
  if (v.preguntas.length) l.push('', 'Preguntas para Alberto (antes de opinar):', ...v.preguntas.map((p, i) => `${i + 1}. ${p}`))
  if (v.argumentos.length) {
    l.push('', 'Argumentos:')
    for (const a of v.argumentos) {
      const marca = a.cita ? (a.citaVerificada === false ? ' (cita NO verificada)' : '') : ''
      l.push(`- [${ETIQUETA_APOYO[a.apoyo]}] ${a.texto}${a.cita ? ` «${a.cita}»${marca}` : ''}`)
    }
  }
  if (v.plazosAccion.length) l.push('', 'Plazos y acciones:', ...v.plazosAccion.map((z) => `- ${z.que} · ${z.fecha ?? 'sin fecha'} · ${z.base}`))
  if (v.derivar) l.push('', `Derivar: ${v.derivar === 'abogado' ? 'a abogado' : 'a perito externo (contraperitaje)'}`)
  if (v.otrasPolizas.length) {
    l.push('', 'Aviso: otras pólizas en vigor del cliente que podrían entrar (solo aviso, comprobar):')
    for (const p of v.otrasPolizas) l.push(`- ${p.ramo} · ${p.compania}: ${p.motivo}`)
  }
  if (v.explicacionCliente) l.push('', 'Explicación para el cliente:', v.explicacionCliente)
  return l.join('\n')
}

// ─── Meta ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Meta de todo mensaje de la IA del siniestro: siempre con la versión del gabinete y de la base de conocimiento. */
export function metaGabinete<T extends Record<string, unknown>>(base: T): T & { gabinete: number; conocimientoVersion: string } {
  return { ...base, gabinete: GABINETE_VERSION, conocimientoVersion: CONOCIMIENTO_SINIESTROS_VERSION }
}

const bytes = (x: unknown): number => new TextEncoder().encode(JSON.stringify(x)).length

/**
 * Encaja el meta en `maxBytes` (el hilo rechaza metas grandes). Orden: recorta el índice (queda `completo:false`,
 * no se reutilizará), quita la ficha, quita el índice, recorta el veredicto y, como último recurso, lo quita.
 */
export function encajarMeta(meta: Record<string, unknown>, maxBytes: number): { meta: Record<string, unknown>; recortes: string[] } {
  const m: Record<string, unknown> = JSON.parse(JSON.stringify(meta))
  const recortes: string[] = []
  const cabe = () => bytes({ ...m, recortesMeta: recortes }) <= maxBytes
  const fin = () => ({ meta: recortes.length ? { ...m, recortesMeta: recortes } : m, recortes })
  if (cabe()) return fin()

  const ind = m.indicePoliza
  if (esObj(ind) && Array.isArray(ind.garantias) && Array.isArray(ind.exclusiones)) {
    recortes.push('indice_recortado')
    ind.completo = false
    while (!cabe() && (ind.garantias.length || ind.exclusiones.length)) {
      if (ind.exclusiones.length >= ind.garantias.length) ind.exclusiones.pop()
      else ind.garantias.pop()
    }
    if (cabe()) return fin()
  }
  if ('fichaCaso' in m && m.fichaCaso != null) { m.fichaCaso = null; recortes.push('ficha_fuera'); if (cabe()) return fin() }
  if ('indicePoliza' in m && m.indicePoliza != null) { m.indicePoliza = null; recortes.push('indice_fuera'); if (cabe()) return fin() }
  if (esObj(m.citas)) {
    for (const k of ['verificadas', 'noEncontradas']) {
      const a = m.citas[k]
      if (Array.isArray(a)) m.citas[k] = a.slice(0, 10).map((c) => (typeof c === 'string' ? c.slice(0, 150) : c))
    }
    if (cabe()) return fin()
  }
  const v = m.veredicto
  if (esObj(v) && Array.isArray(v.argumentos)) {
    recortes.push('veredicto_recortado')
    v.argumentos = v.argumentos.map((a) => (esObj(a) ? { ...a, texto: typeof a.texto === 'string' ? recorta(a.texto, 200) : a.texto } : a))
    while (!cabe() && (v.argumentos as unknown[]).length > 1) (v.argumentos as unknown[]).pop()
    if (cabe()) return fin()
  }
  if (m.veredicto != null) { m.veredicto = null; recortes.push('veredicto_fuera') }
  return fin()
}
