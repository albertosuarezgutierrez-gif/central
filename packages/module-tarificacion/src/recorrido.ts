// RECORRIDO de un trabajo del tarificador RPA (15/10/2026): una captura LIGERA de cada pantalla/paso/diálogo por el que
// pasa el bot, para que cada ejecución (ok o fallo) documente TODO su camino y no solo la pantalla donde falla. Cada
// prueba real descubría UNA pantalla desconocida porque el `inventarioDom` solo se tomaba al fallar (y en Mapfre, con el
// diálogo ya cerrado).
//
// PURO: lo usa el worker (para construir y sanear cada captura) y asegura (para volver a sanearla al recibirla, defensa
// en profundidad). 🔒 NADA de datos personales: no hay clave para un valor de input; todo texto pasa por
// `enmascararTextoRecorrido` (secretos del trabajo, NIF/NIE/CIF, IBAN, correo, teléfono, matrícula, fechas, nombres tras
// «tomador/asegurado/titular/nombre…») y se TAPA para conservar la forma. Pero `sanearCaptura` QUITA entero (no tapa) el texto
// con forma de dato personal (`pareceDatoPersonalInventario`), la cabecera del portal (mediador / «Último acceso») y el que
// contiene un VALOR conocido del riesgo (nombre, documento, dirección…).
//
// Topes: ~4 KB por captura (`MAX_BYTES_CAPTURA_RECORRIDO`) y ~60 KB por trabajo (`MAX_BYTES_RECORRIDO`), con recorte
// explícito (`recortada` / `descartadas`).

import { MARCA_DATO_PERSONAL, redactarDatosPersonales, redactarVehiculos } from './formador.ts'
import { aprenderNombresMediador, contieneValorSensible, esCabeceraPersonal, pareceDatoPersonalInventario, urlSinQuery } from './inventario-dom.ts'

export const MAX_BYTES_CAPTURA_RECORRIDO = 4 * 1024
export const MAX_BYTES_RECORRIDO = 60 * 1024
/** Máximo de capturas que se aceptan del cable (el tope de bytes manda antes en la práctica). */
export const MAX_CAPTURAS_RECORRIDO = 120
const MAX_TEXTO = 60
const MAX_ATRIBUTO = 40

/** Por qué se tomó la captura. Lista cerrada: un motivo libre sería un canal para colar datos. */
export const MOTIVOS_CAPTURA = ['inicio', 'navegacion', 'pantalla', 'paso', 'paso_fin', 'login', 'avance', 'dialogo', 'pantalla_no_reconocida', 'fallo'] as const
export type MotivoCaptura = (typeof MOTIVOS_CAPTURA)[number]

export type DialogoCaptura = { rol: string | null; id: string | null; clase: string | null; titulo: string | null; botones: string[] }

export type CapturaPaso = {
  /** Orden dentro del recorrido (1, 2, 3…). */
  n: number
  /** Milisegundos desde el arranque del trabajo. */
  ms: number
  motivo: MotivoCaptura
  /** Nombre del paso de la traza (`ctx.paso`), si lo hay. */
  paso?: string
  /** URL del marco principal SIN query ni fragmento. */
  url: string
  titulo: string | null
  encabezados: string[]
  /** Etiquetas de los campos del formulario (nunca su valor). */
  etiquetas: string[]
  /** Textos de botones. */
  botones: string[]
  /** Textos de enlaces. */
  enlaces: string[]
  dialogos: DialogoCaptura[]
  /** Nº de filas de cada tabla visible. */
  tablas: number[]
  /** Nº de campos de formulario visibles. */
  campos: number
  /** `true` si se quitaron elementos para caber en el tope de la captura. */
  recortada?: true
}

export type Recorrido = {
  version: 1
  capturas: CapturaPaso[]
  /** Capturas que no cupieron en el tope del trabajo (las repetidas de la pantalla anterior no cuentan). */
  descartadas: number
}

// ─── Máscara de texto ────────────────────────────────────────────────────────

const MESES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre'
const PATRONES_FECHA: readonly RegExp[] = [
  /\b\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*(?:\d{4}|\d{2})\b/g,
  /\b\d{4}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{1,2}\b/g,
  new RegExp(`\\b\\d{1,2}\\s+de\\s+(?:${MESES})(?:\\s+de\\s+\\d{2,4})?`, 'gi'),
  new RegExp(`\\b(?:${MESES})\\s+(?:de\\s+)?\\d{4}\\b`, 'gi'),
]
/** Palabras tras las que el portal pinta un NOMBRE de persona. */
const CLAVE_NOMBRE = /\b(tomador(?:a)?|asegurad[oa]|titular|nombre|apellidos?|conductor(?:a)?|propietari[oa]|contratante|beneficiari[oa])\b(\s*[:=]\s*|\s*-\s+|\s+)([^\n]{1,100})/giu
const PALABRA_NOMBRE = /^[\p{L}][\p{L}'’.-]*$/u
const PALABRA_CAPITAL = /^\p{Lu}[\p{L}'’.-]*$/u
const MINUSCULAS_NOMBRE = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'di', 'van', 'von'])
export const MARCA_PERSONAL = '[PERSONAL]'

/** Tapa los nombres que siguen a «tomador/asegurado/titular/nombre…». Tras «:» o «=» acepta minúsculas; sin signo, solo palabras en Capital/MAYÚSCULAS. */
function taparNombres(texto: string): string {
  return texto.replace(CLAVE_NOMBRE, (_m, clave: string, sep: string, cola: string) => {
    const conSigno = /[:=]/.test(sep)
    const palabras = cola.split(/(\s+)/)
    let tomadas = 0
    let hasta = 0
    for (let i = 0; i < palabras.length; i++) {
      const p = palabras[i]
      if (/^\s+$/.test(p) || p === '') continue
      const ok = PALABRA_NOMBRE.test(p) && (conSigno || PALABRA_CAPITAL.test(p) || (tomadas > 0 && MINUSCULAS_NOMBRE.has(p)))
      if (!ok || tomadas >= 5) break
      tomadas++
      hasta = i + 1
    }
    // Un nombre acabado en partícula suelta («de») no es nombre: se devuelve el sobrante tal cual.
    if (tomadas === 0) return `${clave}${sep}${cola}`
    return `${clave}${sep}${MARCA_PERSONAL}${palabras.slice(hasta).join('')}`
  })
}

/**
 * Texto listo para salir del worker. `redactar` = redactor del trabajo (secretos del entorno + documento/nombre del tomador).
 * `valores` = valores concretos del riesgo (`valoresSensiblesDeRiesgo`): un texto que contiene uno se QUITA (devuelve `null`).
 * Colapsa espacios y trunca a `max`. Idempotente: pasarlo dos veces da lo mismo.
 */
export function enmascararTextoRecorrido(v: unknown, opciones: { redactar?: (t: string) => string; valores?: readonly string[]; max?: number } = {}): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  let t = String(v).replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (opciones.valores && opciones.valores.length > 0 && contieneValorSensible(t, opciones.valores)) return null
  if (opciones.redactar) t = opciones.redactar(t)
  for (const p of PATRONES_FECHA) t = t.replace(p, MARCA_DATO_PERSONAL)
  t = redactarVehiculos(redactarDatosPersonales(t))
  t = taparNombres(t)
  const max = opciones.max ?? MAX_TEXTO
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

// ─── Saneado de una captura ──────────────────────────────────────────────────

type OpcionesCaptura = { redactar?: (t: string) => string; valores?: readonly string[]; maxBytes?: number }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const cod = new TextEncoder()
const bytesDe = (v: unknown) => cod.encode(JSON.stringify(v)).length
const TOKEN = /^[A-Za-z0-9_:.\- ]{1,200}$/

/** Límites por lista (antes del tope de bytes). */
const MAX_LISTA = { encabezados: 12, etiquetas: 40, botones: 30, enlaces: 30, dialogos: 4, tablas: 8, botonesDialogo: 8 } as const

/**
 * Sanea UNA captura cruda (la que devuelve el extractor de la página, o la que llega por el cable). `null` si no tiene forma de
 * captura. Nunca lanza. Solo copia claves de la lista blanca; el tope de bytes recorta listas (`recortada`) hasta caber.
 */
export function sanearCaptura(crudo: unknown, opciones: OpcionesCaptura = {}): CapturaPaso | null {
  const c = obj(crudo)
  if (!c) return null
  const motivo = MOTIVOS_CAPTURA.find((m) => m === c.motivo)
  if (!motivo) return null
  // Cabecera del portal (mediador, «Último acceso»): se aprenden los nombres de TODO el crudo y el texto se QUITA (no se tapa).
  const todos: unknown[] = [c.titulo, ...(Array.isArray(c.encabezados) ? c.encabezados : []), ...(Array.isArray(c.etiquetas) ? c.etiquetas : []),
    ...(Array.isArray(c.botones) ? c.botones : []), ...(Array.isArray(c.enlaces) ? c.enlaces : [])]
  for (const d of Array.isArray(c.dialogos) ? c.dialogos : []) {
    const o = obj(d)
    if (o) todos.push(o.titulo, ...(Array.isArray(o.botones) ? o.botones : []))
  }
  const nombresMediador = aprenderNombresMediador(todos)
  const t = (x: unknown, max = MAX_TEXTO): string | null => {
    if (typeof x === 'string' || typeof x === 'number') {
      const plano = String(x).replace(/\s+/g, ' ').trim()
      if (plano && (pareceDatoPersonalInventario(plano) || esCabeceraPersonal(plano, nombresMediador))) return null
    }
    return enmascararTextoRecorrido(x, { redactar: opciones.redactar, valores: opciones.valores, max })
  }
  const lista = (x: unknown, max: number, len = MAX_TEXTO): string[] => {
    if (!Array.isArray(x)) return []
    const out: string[] = []
    for (const e of x.slice(0, max * 3)) {
      const s = t(e, len)
      if (s !== null && !out.includes(s)) out.push(s)
      if (out.length >= max) break
    }
    return out
  }
  // Atributos de estructura (id, clase, rol): sin espacios raros ni forma de dato personal.
  const attr = (x: unknown): string | null => {
    if (typeof x !== 'string' || !TOKEN.test(x.trim())) return null
    return t(x.trim(), MAX_ATRIBUTO)
  }
  const dialogos: DialogoCaptura[] = []
  for (const d of Array.isArray(c.dialogos) ? c.dialogos.slice(0, MAX_LISTA.dialogos) : []) {
    const o = obj(d)
    if (!o) continue
    dialogos.push({ rol: attr(o.rol), id: attr(o.id), clase: attr(o.clase), titulo: t(o.titulo), botones: lista(o.botones, MAX_LISTA.botonesDialogo) })
  }
  const num = (x: unknown, max: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(0, Math.floor(x))) : 0)
  const cap: CapturaPaso = {
    n: num(c.n, 100_000),
    ms: num(c.ms, 86_400_000),
    motivo,
    ...(typeof c.paso === 'string' && /^[a-z0-9_]{1,40}$/.test(c.paso) ? { paso: c.paso } : {}),
    url: urlSinQuery(c.url),
    titulo: t(c.titulo),
    encabezados: lista(c.encabezados, MAX_LISTA.encabezados),
    etiquetas: lista(c.etiquetas, MAX_LISTA.etiquetas),
    botones: lista(c.botones, MAX_LISTA.botones),
    enlaces: lista(c.enlaces, MAX_LISTA.enlaces),
    dialogos,
    tablas: (Array.isArray(c.tablas) ? c.tablas.slice(0, MAX_LISTA.tablas) : []).map((x) => num(x, 1_000_000)),
    campos: num(c.campos, 100_000),
  }
  // La URL se enmascara también (ruta con ids): `urlSinQuery` ya tapa datos personales; el redactor del trabajo, los secretos.
  if (opciones.redactar) cap.url = opciones.redactar(cap.url)
  if (opciones.valores && opciones.valores.length > 0 && contieneValorSensible(cap.url, opciones.valores)) cap.url = ''
  // Tope de bytes: se recorta de la lista más larga (de atrás adelante) hasta caber.
  const tope = Math.max(512, opciones.maxBytes ?? MAX_BYTES_CAPTURA_RECORRIDO)
  const listas: ('enlaces' | 'etiquetas' | 'botones' | 'encabezados' | 'tablas')[] = ['enlaces', 'etiquetas', 'botones', 'encabezados', 'tablas']
  let recortada = false
  while (bytesDe(cap) > tope) {
    recortada = true
    cap.recortada = true
    const mayor = listas.reduce((a, b) => (cap[b].length > cap[a].length ? b : a), listas[0])
    if (cap[mayor].length > 0) (cap[mayor] as unknown[]).pop()
    else if (cap.dialogos.length > 0) cap.dialogos.pop()
    else if (cap.titulo !== null) cap.titulo = null
    else { cap.url = cap.url.slice(0, 120); break }
  }
  if (recortada) cap.recortada = true
  return cap
}

/** Firma de la PANTALLA de una captura (sin n, ms ni motivo): dos capturas seguidas iguales no se repiten. */
export function firmaCaptura(c: CapturaPaso): string {
  return JSON.stringify([c.url, c.titulo, c.encabezados, c.etiquetas, c.botones, c.enlaces, c.dialogos, c.tablas, c.campos])
}

// ─── Colector del trabajo ────────────────────────────────────────────────────

export type ColectorRecorrido = {
  /** Sanea y añade una captura cruda. `true` si quedó en el recorrido. Una pantalla idéntica a la anterior se omite, salvo un diálogo, un fallo o una pantalla no reconocida. */
  anadir: (crudo: unknown) => boolean
  recorrido: () => Recorrido
  bytes: () => number
}

const SIEMPRE: readonly MotivoCaptura[] = ['dialogo', 'pantalla_no_reconocida', 'fallo']

export function crearColectorRecorrido(opciones: OpcionesCaptura & { maxBytesTotal?: number; ahora?: () => number } = {}): ColectorRecorrido {
  const capturas: CapturaPaso[] = []
  let descartadas = 0
  let usados = 0
  let ultima = ''
  let n = 0
  const inicio = (opciones.ahora ?? Date.now)()
  const tope = opciones.maxBytesTotal ?? MAX_BYTES_RECORRIDO
  // Reserva para la cabecera del recorrido.
  const CABECERA = 64
  return {
    anadir(crudo) {
      const o = obj(crudo)
      const ms = (opciones.ahora ?? Date.now)() - inicio
      const cap = sanearCaptura({ ...(o ?? {}), n: n + 1, ms }, opciones)
      if (!cap) return false
      const firma = firmaCaptura(cap)
      if (firma === ultima && !SIEMPRE.includes(cap.motivo)) return false
      const b = bytesDe(cap) + 1
      if (capturas.length >= MAX_CAPTURAS_RECORRIDO || usados + b + CABECERA > tope) {
        descartadas++
        return false
      }
      n++
      ultima = firma
      usados += b
      capturas.push(cap)
      return true
    },
    recorrido: () => ({ version: 1, capturas: capturas.map((c) => ({ ...c })), descartadas }),
    bytes: () => usados + CABECERA,
  }
}

/**
 * Re-sanea un recorrido recibido por el cable (asegura). `null` si no tiene forma de recorrido. Cada captura vuelve a pasar por
 * `sanearCaptura` (sin redactor del trabajo: asegura no tiene los secretos, pero la máscara de datos personales sí es pura; con `valores`
 * = `valoresSensiblesDeRiesgo` del riesgo del trabajo, si quien llama ya lo tiene) y
 * el conjunto se recorta a `maxBytes` quitando capturas del final (`descartadas`).
 */
export function sanearRecorrido(crudo: unknown, maxBytes: number = MAX_BYTES_RECORRIDO, valores?: readonly string[]): Recorrido | null {
  const r = obj(crudo)
  if (!r || !Array.isArray(r.capturas)) return null
  const capturas: CapturaPaso[] = []
  let descartadas = typeof r.descartadas === 'number' && Number.isFinite(r.descartadas) ? Math.min(1_000_000, Math.max(0, Math.floor(r.descartadas))) : 0
  let usados = 64
  for (const c of r.capturas.slice(0, MAX_CAPTURAS_RECORRIDO)) {
    const cap = sanearCaptura(c, valores ? { valores } : {})
    if (!cap) continue
    const b = bytesDe(cap) + 1
    if (usados + b > maxBytes) {
      descartadas++
      continue
    }
    usados += b
    capturas.push(cap)
  }
  return { version: 1, capturas, descartadas }
}
