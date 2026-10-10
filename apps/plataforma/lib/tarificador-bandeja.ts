// Bandeja «Necesita tu atención» del tarificador RPA (08/10/2026) — lo PURO: lectura defensiva de las respuestas de
// `/api/correduria/tarificador/bandeja` y de la traza, y rótulos. Sin red ni envs: importable desde 'use client'.
//
// 🚨 La regla de qué se puede reintentar/cancelar la decide ASEGURA (`puedeReintentar`/`puedeCancelar` por fila y 409
//    en el POST); aquí solo se pintan. Tres estados: `null` = no consta («—»), nunca 0.

export const BANDEJA_PAGINA = 50

export type ItemBandeja = {
  id: string
  compania: string
  ramo: string
  estado: string
  tipoError: string | null
  motivo: string
  fecha: string
  intentos: number
  botVersion: string | null
  oportunidadId: string | null
  puedeReintentar: boolean
  puedeCancelar: boolean
}

export type Bandeja = { total: number; hayMas: boolean; items: ItemBandeja[] }

export type PasoTrazaVista = { intento: number; paso: string; inicio: string; duracionMs: number; ok: boolean; errorCodigo: string | null; capturaRef: string | null }
export type TrazaVista = { botVersion: string | null; pasos: PasoTrazaVista[] }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** `limite` 1..50 (por defecto 50) y `desde` ≥ 0: lo que el cliente pide al servidor. Basura → por defecto. */
export function paginacionBandeja(limite: string | null, desde: string | null): { limite: number; desde: number } {
  const l = Number(limite ?? '')
  const d = Number(desde ?? '')
  return {
    limite: Number.isInteger(l) && l >= 1 && l <= BANDEJA_PAGINA ? l : BANDEJA_PAGINA,
    desde: Number.isInteger(d) && d >= 0 && d <= 100_000 ? d : 0,
  }
}

function itemValido(v: unknown): ItemBandeja | null {
  const o = obj(v)
  if (!o) return null
  const id = str(o.id), compania = str(o.compania), ramo = str(o.ramo), estado = str(o.estado), fecha = str(o.fecha)
  if (!id || !compania || !ramo || !estado || !fecha) return null
  return {
    id, compania, ramo, estado, fecha,
    tipoError: str(o.tipoError),
    motivo: str(o.motivo) ?? 'El trabajo necesita que lo mire una persona.',
    intentos: typeof o.intentos === 'number' && Number.isFinite(o.intentos) ? o.intentos : 0,
    botVersion: str(o.botVersion),
    oportunidadId: str(o.oportunidadId),
    // Fail-closed: si asegura no lo dice expresamente, no se ofrece el botón.
    puedeReintentar: o.puedeReintentar === true,
    puedeCancelar: o.puedeCancelar === true,
  }
}

export type LecturaBandeja = { ok: true; bandeja: Bandeja } | { ok: false; mensaje: string }

export function leerRespuestaBandeja(status: number, json: unknown): LecturaBandeja {
  const o = obj(json)
  if (status === 503 && o?.estado === 'sin_configurar') return { ok: false, mensaje: 'Falta configurar el puerto de asegura (ASEGURA_OPERADOR_SECRET) en plataforma.' }
  if (status === 502) return { ok: false, mensaje: 'No se ha podido hablar con asegura (red). Prueba en un rato.' }
  if (status === 401 || status === 403) return { ok: false, mensaje: 'Sin permiso para leer la bandeja del tarificador.' }
  if (status !== 200 || !o) return { ok: false, mensaje: 'Asegura no ha podido leer la bandeja del tarificador.' }
  if (!Array.isArray(o.items) || typeof o.total !== 'number') return { ok: false, mensaje: 'La respuesta de asegura no tiene la forma esperada (¿versiones desacompasadas?).' }
  const items = o.items.map(itemValido).filter((x): x is ItemBandeja => x !== null)
  return { ok: true, bandeja: { total: o.total, hayMas: o.hayMas === true, items } }
}

export type LecturaTraza = { ok: true; traza: TrazaVista } | { ok: false; mensaje: string }

export function leerRespuestaTraza(status: number, json: unknown): LecturaTraza {
  const o = obj(json)
  if (status === 404) return { ok: false, mensaje: 'El trabajo ya no existe.' }
  if (status !== 200 || !o || !Array.isArray(o.pasos)) return { ok: false, mensaje: 'No se ha podido leer la traza del trabajo.' }
  const pasos: PasoTrazaVista[] = []
  for (const p of o.pasos) {
    const q = obj(p)
    const paso = str(q?.paso), inicio = str(q?.inicio)
    if (!q || !paso || !inicio || typeof q.ok !== 'boolean') continue
    pasos.push({
      intento: typeof q.intento === 'number' && Number.isInteger(q.intento) && q.intento >= 0 ? q.intento : 1,
      paso, inicio, ok: q.ok,
      duracionMs: typeof q.duracionMs === 'number' && Number.isFinite(q.duracionMs) && q.duracionMs >= 0 ? q.duracionMs : 0,
      errorCodigo: str(q.errorCodigo),
      capturaRef: str(q.capturaRef),
    })
  }
  return { ok: true, traza: { botVersion: str(o.botVersion), pasos } }
}

/** Agrupa los pasos por intento del trabajo (orden de llegada). Un solo intento → un solo grupo. */
export function agruparPorIntento(pasos: PasoTrazaVista[]): { intento: number; pasos: PasoTrazaVista[] }[] {
  const grupos: { intento: number; pasos: PasoTrazaVista[] }[] = []
  for (const p of pasos) {
    const g = grupos.find((x) => x.intento === p.intento)
    if (g) g.pasos.push(p)
    else grupos.push({ intento: p.intento, pasos: [p] })
  }
  return grupos.sort((a, b) => a.intento - b.intento)
}

const ROTULO_PASO: Record<string, string> = {
  login: 'Entrar en el portal',
  navegacion: 'Llegar al formulario',
  formulario: 'Rellenar el formulario',
  tarificar: 'Pedir el precio',
  lectura_primas: 'Leer las primas',
}
export const rotuloPaso = (p: string): string => ROTULO_PASO[p] ?? p

const ROTULO_CODIGO: Record<string, string> = {
  infra: 'fallo técnico',
  portal: 'el portal no respondió como se esperaba',
  credenciales: 'credenciales',
  datos: 'datos del riesgo',
  captcha: 'pide una persona (captcha o código)',
  emision: 'paso de emisión bloqueado',
  tope_tiempo: 'se agotó el tiempo',
  desconocido: 'motivo desconocido',
}
export const rotuloCodigo = (c: string | null): string => (c === null ? '' : (ROTULO_CODIGO[c] ?? c))

/** 850 → «0,9 s» · 75000 → «1 min 15 s». */
export function duracionPaso(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 60_000) return `${(ms / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} s`
  const s = Math.round(ms / 1000)
  const min = Math.floor(s / 60)
  return s % 60 ? `${min} min ${s % 60} s` : `${min} min`
}

export const ROTULO_ESTADO_BANDEJA: Record<string, string> = {
  requiere_humano: 'Necesita a una persona',
  error_definitivo: 'Falló sin reintento posible',
  error_reintentable: 'Fallo reintentable',
}
