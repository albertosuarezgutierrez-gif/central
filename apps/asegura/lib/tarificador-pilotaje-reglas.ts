// MODO PILOTADO del tarificador RPA (03/11/2026) — reglas PURAS de asegura. La parte con BD/Storage está en
// `tarificador-pilotaje.ts`; las rutas en app/api/tarificador/pilotaje/* (worker) y app/api/operador/tarificador/pilotaje* (operador).
//
// Una sesión = un trabajo `modo = 'pilotaje'` SINTÉTICO (sin cliente, riesgo `{}`): login + entrada cerrada del explorador y luego,
// por pantalla, el worker PUBLICA el estado y ESPERA un comando del operador. asegura solo valida la FORMA del comando (lista
// cerrada de acciones y claves); quien decide si se ejecuta es el worker, contra SU inventario y por la puerta del guard
// (TARIFICAR ≠ EMITIR). Nada aquí abre una vía alrededor del guard: un comando aceptado aquí puede ser rechazado allí.

import { contieneValorSensible, esEntradaExploracion, loginAsistidoDe, pareceDatoPersonalInventario, sanearInventarioDom, type InventarioDom } from '@central/module-tarificacion'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** Topes de la sesión (el worker aplica los mismos, ver services/tarificador-rpa/src/pilotaje-reglas.ts). */
export const TOPES_PILOTAJE = Object.freeze({ maxComandos: 60, maxMs: 30 * 60_000, esperaComandoMs: 10 * 60_000, maxPasos: 200 })
/** Margen sobre el tope de 30 min para que el worker cierre. */
export const MARGEN_LEASE_PILOTAJE_MS = 3 * 60_000
export const BUCKET_PILOTAJE = 'tarificador-pilotaje'
/** La captura es un PNG de la pantalla (≤4 MB, mismo tope que la evidencia de un atasco). */
export const MAX_BYTES_CAPTURA_PILOTAJE = 4 * 1024 * 1024

/** `inspeccionar` (0.3.37): diagnóstico de accionabilidad de un control SIN pulsarlo (caja, visibilidad, estilos, qué lo tapa). */
/** `cerrar_modal` (0.3.38): cierra un modal INFORMATIVO (sin campos ni términos de acción final); sin ref. El worker decide si se puede. */
export const ACCIONES_PILOTAJE = ['pulsar', 'rellenar', 'seleccionar', 'inspeccionar', 'cerrar_modal', 'esperar', 'volver', 'fin'] as const
export type AccionPilotaje = (typeof ACCIONES_PILOTAJE)[number]
export const EFECTOS_PULSAR = ['siguiente_pantalla', 'calcular', 'abrir_seccion', 'ver_resultado'] as const
export type ComandoPilotaje = {
  accion: AccionPilotaje
  ref?: string
  /** rellenar: texto FICTICIO literal; seleccionar: valor (o texto exacto) de la opción. */
  valor?: string
  /** rellenar: clave del catálogo del explorador (el worker pone el valor de prueba). Excluyente con `valor`. */
  dato?: string
  efecto?: (typeof EFECTOS_PULSAR)[number]
  ms?: number
}

const RE_REF = /^m\d{1,2}e\d{1,4}$/
const RE_DATO = /^[a-z][a-zA-Z0-9]{0,30}(\.[a-zA-Z0-9]{1,40}){1,3}$/

/** Forma de un comando (operador → BD → worker). Fail-closed: clave desconocida o acción fuera de lista → error. PURA. */
export function leerComandoPilotaje(v: unknown): { ok: true; c: ComandoPilotaje } | { ok: false; errores: string[] } {
  const c = obj(v)
  if (!c) return { ok: false, errores: ['comando no es un objeto'] }
  const errores: string[] = []
  const accion = ACCIONES_PILOTAJE.find((a) => a === c.accion)
  if (!accion) return { ok: false, errores: ['accion fuera de lista (pulsar|rellenar|seleccionar|inspeccionar|cerrar_modal|esperar|volver|fin)'] }
  const permitidas: Record<AccionPilotaje, string[]> = {
    pulsar: ['accion', 'ref', 'efecto'], rellenar: ['accion', 'ref', 'valor', 'dato'], seleccionar: ['accion', 'ref', 'valor'], inspeccionar: ['accion', 'ref'], cerrar_modal: ['accion'],
    esperar: ['accion', 'ms'], volver: ['accion'], fin: ['accion'],
  }
  for (const k of Object.keys(c)) if (!permitidas[accion].includes(k)) errores.push(`clave «${k.slice(0, 30)}» no se admite en ${accion}`)
  const out: ComandoPilotaje = { accion }
  if (accion === 'pulsar' || accion === 'rellenar' || accion === 'seleccionar' || accion === 'inspeccionar') {
    if (typeof c.ref !== 'string' || !RE_REF.test(c.ref)) errores.push('ref tiene que ser un ref del inventario (p. ej. m0e10)')
    else out.ref = c.ref
  }
  if (accion === 'pulsar' && c.efecto !== undefined) {
    const e = EFECTOS_PULSAR.find((x) => x === c.efecto)
    if (!e) errores.push('efecto fuera de lista')
    else out.efecto = e
  }
  if (accion === 'rellenar') {
    const tieneValor = c.valor !== undefined
    const tieneDato = c.dato !== undefined
    if (tieneValor === tieneDato) errores.push('rellenar lleva valor (texto ficticio) o dato (clave del catálogo), uno de los dos')
    if (tieneValor) {
      if (typeof c.valor !== 'string' || c.valor.length === 0 || c.valor.length > 80) errores.push('valor tiene que ser un texto de 1 a 80 caracteres')
      else out.valor = c.valor
    }
    if (tieneDato) {
      if (typeof c.dato !== 'string' || !RE_DATO.test(c.dato) || c.dato.startsWith('credencial.')) errores.push('dato tiene que ser una clave del catálogo')
      else out.dato = c.dato
    }
  }
  if (accion === 'seleccionar') {
    if (typeof c.valor !== 'string' || c.valor.length === 0 || c.valor.length > 80) errores.push('valor tiene que ser un texto de 1 a 80 caracteres')
    else out.valor = c.valor
  }
  if (accion === 'esperar' && c.ms !== undefined) {
    if (typeof c.ms !== 'number' || !Number.isInteger(c.ms) || c.ms < 0 || c.ms > 15_000) errores.push('ms tiene que ser un entero 0-15000')
    else out.ms = c.ms
  }
  return errores.length ? { ok: false, errores } : { ok: true, c: out }
}

/** Resultado de un comando tal como lo informa el worker (sin valores). PURA y TOLERANTE: lo mal formado se descarta. */
export type ResultadoComando = { estado: 'hecho' | 'rechazado'; motivo: string; detalle?: string[] }
export function leerResultadoComando(v: unknown): ResultadoComando | null {
  const r = obj(v)
  if (!r || (r.estado !== 'hecho' && r.estado !== 'rechazado')) return null
  const motivo = typeof r.motivo === 'string' ? r.motivo.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
  const detalle = Array.isArray(r.detalle) ? r.detalle.filter((d): d is string => typeof d === 'string').slice(0, 10).map((d) => d.slice(0, 200)) : []
  return { estado: r.estado, motivo, ...(detalle.length ? { detalle } : {}) }
}

/**
 * Campos de DIAGNÓSTICO nuevos (motivo/detalle del resultado, URL): la misma barrera que `redactarValoresInventario` aplica a cada
 * texto del inventario (`contieneValorSensible` con los valores sensibles de la sesión) más la forma de dato personal
 * (`pareceDatoPersonalInventario`). Un texto que casa se sustituye entero (nunca se recorta a medias). PURA.
 */
export function redactarTextoPilotaje(t: string, valores: readonly string[]): string {
  return contieneValorSensible(t, valores) || pareceDatoPersonalInventario(t) ? '(texto redactado)' : t
}
export function redactarResultadoPilotaje(r: ResultadoComando | null, valores: readonly string[]): ResultadoComando | null {
  if (!r) return null
  const detalle = r.detalle?.map((d) => redactarTextoPilotaje(d, valores))
  return { estado: r.estado, motivo: redactarTextoPilotaje(r.motivo, valores), ...(detalle?.length ? { detalle } : {}) }
}

/** Cuerpo de `POST /api/operador/tarificador/pilotaje`: `{ entrada }` y nada más (sintética siempre). PURA. */
export function leerPeticionEncolarPilotaje(body: unknown): { ok: true; entrada: string } | { ok: false; errores: string[] } {
  const b = obj(body)
  if (!b) return { ok: false, errores: ['cuerpo no es un objeto'] }
  const errores: string[] = []
  for (const k of Object.keys(b)) if (k !== 'entrada') errores.push(`clave «${k.slice(0, 30)}» no se admite (el pilotaje es siempre sintético)`)
  if (!esEntradaExploracion(b.entrada)) errores.push('entrada fuera de la lista cerrada')
  // El login asistido (Occident) usa el puerto de pasos del explorador con IA: no se mezcla con el pilotaje.
  else if (loginAsistidoDe(b.entrada)) errores.push('entrada con login asistido: no se pilota')
  return errores.length ? { ok: false, errores } : { ok: true, entrada: b.entrada as string }
}

export type PeticionEstado = {
  trabajoId: string
  n: number
  inventario: InventarioDom
  /** PNG en base64 (opcional: sin captura el paso se publica igual). */
  capturaBase64: string | null
  url: string | null
  /** Resultado del comando del paso `n - 1`. */
  resultadoAnterior: ResultadoComando | null
  /** `true` = pantalla de cierre (la sesión termina; no admite comando). */
  final: boolean
}

/** Cuerpo de `POST /api/tarificador/pilotaje/estado` (worker). PURA. */
export function leerPeticionEstado(body: unknown): { ok: true; p: PeticionEstado } | { ok: false; errores: string[] } {
  const b = obj(body)
  if (!b) return { ok: false, errores: ['cuerpo no es un objeto'] }
  const errores: string[] = []
  const trabajoId = typeof b.trabajoId === 'string' && RE_UUID.test(b.trabajoId) ? b.trabajoId : null
  if (!trabajoId) errores.push('trabajoId no es un uuid')
  const n = typeof b.n === 'number' && Number.isInteger(b.n) && b.n >= 1 && b.n <= TOPES_PILOTAJE.maxPasos ? b.n : null
  if (n === null) errores.push(`n tiene que ser un entero 1-${TOPES_PILOTAJE.maxPasos}`)
  const inventario = sanearInventarioDom(b.inventario, undefined, { refs: true })
  if (!inventario) errores.push('inventario sin forma de inventario')
  let capturaBase64: string | null = null
  if (b.capturaBase64 !== undefined && b.capturaBase64 !== null) {
    if (typeof b.capturaBase64 !== 'string' || !esPngBase64(b.capturaBase64)) errores.push('capturaBase64 tiene que ser un PNG en base64 (≤4 MB)')
    else capturaBase64 = b.capturaBase64
  }
  if (b.final !== undefined && typeof b.final !== 'boolean') errores.push('final tiene que ser booleano')
  if (errores.length) return { ok: false, errores }
  return {
    ok: true,
    p: {
      trabajoId: trabajoId!, n: n!, inventario: inventario!, capturaBase64,
      url: urlSinQuery(b.url), resultadoAnterior: leerResultadoComando(b.resultadoAnterior), final: b.final === true,
    },
  }
}

/** Solo origen + ruta (la query puede llevar tokens o datos): nunca se guarda entera. PURA. */
export function urlSinQuery(v: unknown): string | null {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return `${u.origin}${u.pathname}`.slice(0, 300)
  } catch {
    return null
  }
}

/** ¿Es un PNG (firma de 8 bytes) en base64 y cabe en el tope? PURA. */
export function esPngBase64(b64: string): boolean {
  if (b64.length === 0 || b64.length > Math.ceil((MAX_BYTES_CAPTURA_PILOTAJE * 4) / 3) + 4) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return false
  return b64.startsWith('iVBORw0KGgo')
}

/** Ruta del objeto en el bucket: `pilotaje/<sesion>/<n>.png` (la misma forma que exige el CHECK de la tabla). PURA. */
export function rutaCapturaPilotaje(sesionId: string, n: number): string {
  if (!RE_UUID.test(sesionId) || !Number.isInteger(n) || n < 1 || n > 999) throw new Error('ruta de captura no válida')
  return `pilotaje/${sesionId.toLowerCase()}/${n}.png`
}

/** Lease renovado de una sesión: `ahora + leaseMs`, nunca más allá de inicio + 30 min + margen. PURA. */
export function leasePilotaje(k: { ahora: Date; inicio: Date | null; leaseMs: number }): Date {
  const deseado = k.ahora.getTime() + k.leaseMs
  const techo = (k.inicio ?? k.ahora).getTime() + TOPES_PILOTAJE.maxMs + MARGEN_LEASE_PILOTAJE_MS
  return new Date(Math.min(deseado, techo))
}

export type PeticionCierre = { trabajoId: string; motivoFin: string; resultadoUltimo: ResultadoComando | null; nUltimo: number | null; error: { tipo: string; mensaje: string } | null }

const MOTIVOS_FIN_PILOTAJE = ['fin', 'tope_comandos', 'tope_tiempo', 'sin_comando', 'parada', 'guard_emision', 'error_portal', 'perdido'] as const
export type MotivoFinPilotaje = (typeof MOTIVOS_FIN_PILOTAJE)[number]
export const MOTIVOS_FIN_PILOTAJE_LISTA: readonly string[] = MOTIVOS_FIN_PILOTAJE

/** Cuerpo de `POST /api/tarificador/pilotaje/cierre` (worker). PURA. */
export function leerPeticionCierre(body: unknown): { ok: true; p: PeticionCierre } | { ok: false; errores: string[] } {
  const b = obj(body)
  if (!b) return { ok: false, errores: ['cuerpo no es un objeto'] }
  const errores: string[] = []
  const trabajoId = typeof b.trabajoId === 'string' && RE_UUID.test(b.trabajoId) ? b.trabajoId : null
  if (!trabajoId) errores.push('trabajoId no es un uuid')
  const motivoFin = MOTIVOS_FIN_PILOTAJE.find((m) => m === b.motivoFin)
  if (!motivoFin) errores.push('motivoFin fuera de lista')
  const nUltimo = typeof b.nUltimo === 'number' && Number.isInteger(b.nUltimo) && b.nUltimo >= 1 && b.nUltimo <= TOPES_PILOTAJE.maxPasos ? b.nUltimo : null
  const e = obj(b.error)
  const error = e && typeof e.tipo === 'string' && typeof e.mensaje === 'string' ? { tipo: e.tipo.slice(0, 30), mensaje: e.mensaje.slice(0, 500) } : null
  if (errores.length) return { ok: false, errores }
  return { ok: true, p: { trabajoId: trabajoId!, motivoFin: motivoFin!, resultadoUltimo: leerResultadoComando(b.resultadoUltimo), nUltimo, error } }
}

/** Estado de una fila tras el resultado de su comando. PURA. */
export function estadoPasoTrasResultado(r: ResultadoComando | null): 'hecho' | 'rechazado' | null {
  return r ? r.estado : null
}
