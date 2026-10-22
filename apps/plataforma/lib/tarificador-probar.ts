// «Probar tarificación» de la ficha del cliente (13/10/2026) — lo PURO: lectura defensiva de las respuestas de
// `/api/correduria/tarificador/{integraciones,probar,trabajo/[id]}` y textos de estado/motivo/primas. Sin red ni envs:
// importable desde 'use client'. TARIFICAR ≠ EMITIR: nada de aquí contrata.
//
// Tres estados: cargando · «no se pudo comprobar» (`ok:false` con mensaje) ≠ vacío (lista revisada sin elementos).
// `null` = no consta («—»), nunca 0.
import { MAX_AVISO_SUPUESTOS } from '@central/module-tarificacion'
import { eur } from './dinero.ts'

/** Cada cuánto se sondea un trabajo en curso y cuánto se espera antes de decir «sigue en marcha». */
export const SONDEO_MS = 4_000
export const SONDEO_TOPE_MS = 6 * 60_000

// `atascado` (F2, 14/10/2026) no es terminal para asegura, pero espera a Alberto (horas): aquí se deja de sondear.
const ESTADOS_FINALES = ['ok', 'error_definitivo', 'requiere_humano', 'cancelado', 'emitido', 'atascado'] as const

export type IntegracionVista = { compania: string; ramo: string; clave: string }
/** `codigo` null (15/10/2026): portal sin código de catálogo (Mapfre); se elige por la etiqueta exacta de la opción. */
export type VersionVista = { codigo: string | null; etiqueta: string }
/**
 * `supuestos` (15/10/2026): lo que el bot SUPUSO para dar ese precio («Precio con supuestos: uso diario, garaje colectivo…»), tal
 * como lo deja pasar asegura. `null` = no supuso nada (o una versión de asegura que aún no lo manda).
 */
export type OfertaVista = {
  compania: string; producto: string; primaAnual: number; primaNeta: number | null; impuestos: number | null; primaSucesivos: number | null; pdfIndice: number | null; supuestos: string | null
  /**
   * 22/10/2026 (Alberto): nº con el que el bot dejó el presupuesto/proyecto GUARDADO en el portal (Allianz, Mapfre), para rescatarlo
   * si el cliente acepta. `null`/ausente = no se guardó o no se leyó (≠ «no hay»; lo dice `avisoGuardado`).
   */
  referenciaPortal?: string | null
  /** Aviso fijo del bot sobre ese guardado («Presupuesto NO guardado en Allianz: …»). `null`/ausente = el bot no dijo nada. */
  avisoGuardado?: string | null
}
export type TrabajoVista = {
  estado: string
  error: { tipo: string; mensaje: string } | null
  motivo: string | null
  opcionesVersion: VersionVista[] | null
  ofertas: OfertaVista[]
}

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Mensaje común de un fallo de pasarela (sin datos del cliente). */
export function mensajeDeFallo(status: number, json: unknown): string {
  if (status === 401 || status === 403) return 'No tienes permiso para esto.'
  const o = obj(json)
  if (status === 503 && (o?.estado === 'sin_configurar')) return 'La conexión con asegura no está configurada.'
  if (status === 503 && o?.estado === 'apagado') return 'El tarificador está apagado (TARIFICADOR_RPA_ACTIVO).'
  if (status === 502) return o?.motivo === 'timeout' ? 'No se pudo completar: asegura no respondió a tiempo.' : 'No se pudo completar: no se pudo conectar con asegura.'
  return `No se pudo comprobar (HTTP ${status}).`
}

export type LecturaIntegraciones = { ok: true; integraciones: IntegracionVista[] } | { ok: false; mensaje: string }

/** Lista de compañía+ramo activos. `[]` es «revisado y no hay ninguna»; una respuesta rota NO es `[]`. */
export function leerIntegraciones(status: number, json: unknown): LecturaIntegraciones {
  if (status !== 200) return { ok: false, mensaje: mensajeDeFallo(status, json) }
  const lista = obj(json)?.integraciones
  if (!Array.isArray(lista)) return { ok: false, mensaje: 'No se pudo comprobar: respuesta inesperada de asegura.' }
  const vistas = new Set<string>()
  const integraciones: IntegracionVista[] = []
  for (const raw of lista) {
    const o = obj(raw)
    const compania = str(o?.compania), ramo = str(o?.ramo)
    if (!compania || !ramo) continue
    const clave = `${compania}/${ramo}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    integraciones.push({ compania, ramo, clave })
  }
  return { ok: true, integraciones }
}

export function rotuloCompania(c: string): string {
  return c ? c.charAt(0).toUpperCase() + c.slice(1) : c
}

export function rotuloIntegracion(i: { compania: string; ramo: string }): string {
  return `${rotuloCompania(i.compania)} · ${i.ramo}`
}

export type LecturaEncolado = { ok: true; trabajoId: string; duplicado: boolean } | { ok: false; mensaje: string }

const MOTIVOS_RECHAZO: Record<string, string> = {
  sin_riesgo_previo: 'Este cliente no tiene aún un riesgo tarificado en esa compañía y ramo: pide primero el presupuesto desde una oportunidad.',
  riesgo_previo_invalido: 'El último riesgo guardado ya no es válido (p. ej. fechas pasadas): pide el presupuesto de nuevo desde una oportunidad.',
  origen_purgado: 'El último trabajo ya se cerró y se borraron sus datos personales: pide el precio desde el cotizador (Nueva oportunidad → ramo).',
}

/** Respuesta de «probar»: 202 encolado, o `duplicado: true` con el id del trabajo existente (se muestra ese). */
export function leerEncolado(status: number, json: unknown): LecturaEncolado {
  const o = obj(json)
  const id = str(o?.trabajoId) ?? str(o?.id) ?? str(o?.existenteId)
  if ((status === 200 || status === 202 || status === 409) && o?.duplicado === true && id && UUID.test(id)) {
    return { ok: true, trabajoId: id, duplicado: true }
  }
  if (status === 200 || status === 202) {
    if (id && UUID.test(id)) return { ok: true, trabajoId: id, duplicado: false }
    return { ok: false, mensaje: 'No se pudo comprobar: asegura no devolvió el trabajo.' }
  }
  const motivo = str(o?.motivo)
  if (motivo && MOTIVOS_RECHAZO[motivo]) return { ok: false, mensaje: MOTIVOS_RECHAZO[motivo] }
  if (motivo?.startsWith('modo_no_automatizable')) return { ok: false, mensaje: 'Esa compañía y ramo no están habilitados para el bot.' }
  if (typeof o?.mensaje === 'string' && o.mensaje.trim()) return { ok: false, mensaje: o.mensaje }
  return { ok: false, mensaje: mensajeDeFallo(status, json) }
}

export type LecturaTrabajo = { ok: true; trabajo: TrabajoVista } | { ok: false; mensaje: string }

/** Estado y ofertas de UN trabajo. Respuesta rota o sin estado → «no se pudo comprobar», nunca «sin ofertas». */
export function leerTrabajo(status: number, json: unknown): LecturaTrabajo {
  if (status === 404) return { ok: false, mensaje: 'El trabajo ya no existe.' }
  if (status !== 200) return { ok: false, mensaje: mensajeDeFallo(status, json) }
  const o = obj(json)
  const estado = str(o?.estado)
  if (!o || !estado) return { ok: false, mensaje: 'No se pudo comprobar: respuesta inesperada de asegura.' }
  const e = obj(o.error)
  const versiones: VersionVista[] = []
  if (Array.isArray(o.opcionesVersion)) {
    for (const raw of o.opcionesVersion) {
      const v = obj(raw)
      const codigo = str(v?.codigo), etiqueta = str(v?.etiqueta)
      if (etiqueta && (codigo || v?.codigo === null || v?.codigo === undefined)) versiones.push({ codigo: codigo || null, etiqueta })
    }
  }
  const ofertas: OfertaVista[] = []
  if (Array.isArray(o.ofertas)) {
    for (const raw of o.ofertas) {
      const f = obj(raw)
      const prima = num(f?.primaTotalAnual)
      if (!f || prima === null) continue // una oferta sin prima no es una oferta
      ofertas.push({
        compania: str(f.compania) ?? '', producto: str(f.producto) ?? '', primaAnual: prima,
        primaNeta: num(f.primaNeta), impuestos: num(f.impuestos), primaSucesivos: num(f.primaTotalSucesivos),
        pdfIndice: typeof f.pdfIndice === 'number' && Number.isInteger(f.pdfIndice) ? f.pdfIndice : null,
        supuestos: str(f.supuestos)?.slice(0, MAX_AVISO_SUPUESTOS) ?? null,
        referenciaPortal: str(f.referenciaPortal)?.trim().slice(0, 40) || null,
        avisoGuardado: str(f.avisoGuardado)?.slice(0, 300) ?? null,
      })
    }
  }
  return {
    ok: true,
    trabajo: {
      estado,
      error: e && str(e.tipo) ? { tipo: str(e.tipo)!, mensaje: str(e.mensaje) ?? '' } : null,
      motivo: str(o.motivo),
      opcionesVersion: versiones.length ? versiones : null,
      ofertas,
    },
  }
}

export function esEstadoFinal(estado: string): boolean {
  return (ESTADOS_FINALES as readonly string[]).includes(estado)
}

const ROTULO_ESTADO: Record<string, string> = {
  pendiente: 'En cola: esperando al bot…',
  en_curso: 'El bot está tarificando en el portal…',
  error_reintentable: 'Fallo de infraestructura: se reintentará una vez…',
  ok: 'Tarificado',
  error_definitivo: 'El bot no pudo tarificar',
  requiere_humano: 'Parado: necesita que una persona intervenga',
  cancelado: 'Cancelado',
  emitido: 'Emitido',
  pendiente_autorizacion_emision: 'Esperando autorización de emisión',
  autorizado_emision: 'Autorizado: esperando al bot',
  atascado: 'Atascado: elige el elemento (Telegram o Tarificador → Bots atascados)',
}

/** Texto del estado (para personas). Un estado que no conocemos se muestra tal cual, sin inventar. */
export function rotuloEstado(estado: string): string {
  return ROTULO_ESTADO[estado] ?? `Estado: ${estado}`
}

export type TonoEstado = 'curso' | 'ok' | 'aviso' | 'error'

export function tonoEstado(estado: string): TonoEstado {
  if (estado === 'ok' || estado === 'emitido') return 'ok'
  if (estado === 'requiere_humano' || estado === 'cancelado' || estado === 'atascado') return 'aviso'
  if (estado === 'error_definitivo') return 'error'
  return 'curso'
}

/** Prima total anual en formato español; `null` = «—» (no se leyó, nunca 0,00€). */
export function textoPrima(n: number | null): string {
  return n === null ? '—' : eur(n)
}

/** Resumen de una oferta: «Allianz · Moto — 312,45€/año (neta 280,00€ · impuestos 32,45€)». */
export function textoOferta(o: OfertaVista): string {
  const nombre = [o.compania ? rotuloCompania(o.compania) : '', o.producto].filter(Boolean).join(' · ') || 'Oferta'
  const desglose = [o.primaNeta !== null ? `neta ${eur(o.primaNeta)}` : null, o.impuestos !== null ? `impuestos ${eur(o.impuestos)}` : null].filter(Boolean)
  return `${nombre} — ${eur(o.primaAnual)}/año${desglose.length ? ` (${desglose.join(' · ')})` : ''}`
}

/**
 * «Nº proyecto Mapfre: 9876543210» / «Nº presupuesto Allianz: GA-…»: el número con el que el presupuesto quedó guardado en el
 * portal, para rescatarlo si el cliente acepta. Sin número → el aviso del bot (por qué no se guardó), o `null` si no dijo nada. PURA.
 */
export function textoReferenciaPortal(o: Pick<OfertaVista, 'compania' | 'referenciaPortal' | 'avisoGuardado'>): string | null {
  const ref = o.referenciaPortal?.trim()
  if (ref) return `Nº ${o.compania === 'mapfre' ? 'proyecto' : 'presupuesto'}${o.compania ? ` ${rotuloCompania(o.compania)}` : ''}: ${ref}`
  return o.avisoGuardado?.trim() || null
}

/**
 * Qué decir de un trabajo: título, tono, motivo (si lo hay), ofertas y si hay que elegir versión. Un `ok` SIN ofertas no se
 * presenta como éxito vacío: «terminó sin ofertas» (el bot pudo no leer el precio).
 */
export function resumenTrabajo(t: TrabajoVista): {
  titulo: string; tono: TonoEstado; final: boolean; motivo: string | null; ofertas: string[]; pideVersion: boolean
  /** Supuestos con los que se dio el precio (sin repetir: suelen ser los mismos en todas las modalidades). */
  supuestos: string[]
  /** Por oferta (mismo índice que `ofertas`): nº del presupuesto/proyecto guardado en el portal o por qué no; `null` = nada que decir. */
  referencias: ({ texto: string; guardado: boolean } | null)[]
} {
  const final = esEstadoFinal(t.estado)
  const sinOfertas = t.estado === 'ok' && t.ofertas.length === 0
  const motivo = t.motivo ?? (sinOfertas ? 'El trabajo terminó pero el bot no devolvió ninguna oferta con prima.' : (t.error?.mensaje ? t.error.mensaje : null))
  return {
    titulo: sinOfertas ? 'Terminó sin ofertas' : rotuloEstado(t.estado),
    tono: sinOfertas ? 'aviso' : tonoEstado(t.estado),
    final,
    motivo: t.estado === 'ok' && !sinOfertas ? null : motivo,
    ofertas: t.ofertas.map(textoOferta),
    pideVersion: t.estado === 'requiere_humano' && t.opcionesVersion !== null,
    supuestos: [...new Set(t.ofertas.map((o) => o.supuestos).filter((x): x is string => x !== null))],
    referencias: t.ofertas.map((o) => {
      const texto = textoReferenciaPortal(o)
      return texto === null ? null : { texto, guardado: !!o.referenciaPortal?.trim() }
    }),
  }
}
