// packages/module-seguros/src/correo-cruce-cima.ts
//
// F1 del agente corredor de correo (21/10/2026, docs/CORREDURIA-AGENTE-CORREO.md §4.1, §4.2 y §4.8). PURO: decide, no
// escribe ni lee la BD. Tres cosas:
//
//   1. Días HÁBILES de espera antes de decir «la compañía la emitió por correo y CIMA no la trae» (por compañía; 5 por
//      defecto, decisión de Alberto 21/10/2026). Antes de ese plazo NO se avisa: CIMA tarda, y un falso «falta en CIMA»
//      es justo la métrica que tiene que quedarse en 0 (§1).
//   2. Los otros cruces con CIMA: una ANULACIÓN de póliza comunicada por correo que CIMA sigue dando en vigor, y una
//      DEVOLUCIÓN de recibo por correo cuyo recibo no consta en la cartera. Mismo patrón: plazo, y «no se sabe» nunca avisa.
//   3. Enlace póliza CIMA NUEVA ↔ oportunidad ABIERTA. Primero por nº de solicitud → nº de póliza (§4.1, determinista);
//      después, CIF/NIF del tomador (misma ficha o mismo índice ciego) + compañía (DGS) + ramo, solo si es UNO a UNO.
//      Varias candidatas → no se enlaza ninguna y se avisa (§4.8). Nunca por el nombre del tomador.
//
// 🚨 NULL = «no se sabe». Si la consulta a la cartera no se pudo hacer (`enCima: null`), la decisión es `no_se_sabe` y
// no se avisa: un `catch` no autoriza a decir que CIMA no la trae.

import { numeroPolizaComparable } from './duplicados.ts'

// ── 1. Días hábiles ──────────────────────────────────────────────────────────

/** Días hábiles que se espera a CIMA tras el correo de emisión, si la compañía no tiene el suyo. */
export const DIAS_HABILES_ESPERA_CIMA_DEFECTO = 5

/**
 * Por compañía (clave de los eventos de correo). En CÓDIGO, no en env: cambiarlo es una decisión que se revisa. Vacío
 * hoy: las cuatro esperan los 5 por defecto. Si Allianz/Reale (EIAC semanal) dan falsos avisos, se sube aquí la suya.
 */
export const DIAS_HABILES_ESPERA_CIMA: Readonly<Record<string, number>> = {}

export function diasEsperaCima(compania: string): number {
  const n = DIAS_HABILES_ESPERA_CIMA[compania]
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : DIAS_HABILES_ESPERA_CIMA_DEFECTO
}

/** Días que se espera a que CIMA refleje una anulación o un recibo devuelto (el siguiente pull, con holgura). */
export const DIAS_HABILES_ESPERA_REFLEJO = 2

/**
 * Festivos NACIONALES de fecha fija (mm-dd). Los autonómicos y los móviles (Viernes Santo) NO están: en esos días se
 * cuenta un día hábil de más y el aviso puede llegar un día antes. Se acepta: el plazo ya lleva holgura.
 */
const FESTIVOS_FIJOS: ReadonlySet<string> = new Set(['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25'])

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/

function diaValido(iso: unknown): iso is string {
  if (typeof iso !== 'string' || !ISO_DIA.test(iso)) return false
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}

export function esDiaHabil(iso: string): boolean {
  if (!diaValido(iso)) return false
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return dow !== 0 && dow !== 6 && !FESTIVOS_FIJOS.has(iso.slice(5))
}

/**
 * Días hábiles transcurridos DESDE `desde` (no cuenta) HASTA `hasta` (cuenta). `null` si alguna fecha no es válida
 * (no se sabe ≠ 0). `hasta` anterior a `desde` → 0.
 */
export function diasHabilesEntre(desde: string, hasta: string): number | null {
  if (!diaValido(desde) || !diaValido(hasta)) return null
  if (hasta <= desde) return 0
  const d = new Date(`${desde}T00:00:00Z`)
  let n = 0
  // Tope de seguridad: más de ~3 años de diferencia no es un caso de este cruce.
  for (let i = 0; i < 1100; i++) {
    d.setUTCDate(d.getUTCDate() + 1)
    const iso = d.toISOString().slice(0, 10)
    if (esDiaHabil(iso)) n++
    if (iso >= hasta) break
  }
  return n
}

// ── 2. Avisos de cruce con CIMA ──────────────────────────────────────────────

export type DecisionCruce = 'avisar' | 'esperar' | 'en_cima' | 'no_se_sabe'

/**
 * Emisión comunicada por correo (Allianz «Rel. Emisión», Occident «solicitud emitida · póliza N»). `enCima`: `true` = CIMA
 * ya trae esa póliza en vigor; `false` = se miró y no está; `null` = no se pudo mirar. Se avisa solo con `false` y con el
 * plazo de la compañía YA cumplido (con 4 días hábiles no; con el plazo, sí).
 */
export function decidirAvisoEmisionSinCima(p: { compania: string; fechaCorreo: string | null; hoy: string; enCima: boolean | null }): DecisionCruce {
  if (p.enCima === true) return 'en_cima'
  if (p.enCima === null || p.fechaCorreo === null) return 'no_se_sabe'
  const n = diasHabilesEntre(p.fechaCorreo, p.hoy)
  if (n === null) return 'no_se_sabe'
  return n >= diasEsperaCima(p.compania) ? 'avisar' : 'esperar'
}

/**
 * Anulación de PÓLIZA comunicada por correo (no la de un recibo). `sigueEnVigor`: `true` = CIMA aún la da en vigor;
 * `false` = CIMA ya la refleja (o la póliza ya no está viva); `null` = no se pudo mirar.
 */
export function decidirAvisoAnulacionSinCima(p: { fechaCorreo: string | null; hoy: string; sigueEnVigor: boolean | null }): DecisionCruce {
  if (p.sigueEnVigor === false) return 'en_cima'
  if (p.sigueEnVigor === null || p.fechaCorreo === null) return 'no_se_sabe'
  const n = diasHabilesEntre(p.fechaCorreo, p.hoy)
  if (n === null) return 'no_se_sabe'
  return n >= DIAS_HABILES_ESPERA_REFLEJO ? 'avisar' : 'esperar'
}

/** Devolución de recibo por correo. `reciboEnCartera`: `true` = el recibo ya está (CIMA lo trajo); `null` = no se sabe. */
export function decidirAvisoDevolucionSinRecibo(p: { fechaCorreo: string | null; hoy: string; reciboEnCartera: boolean | null }): DecisionCruce {
  if (p.reciboEnCartera === true) return 'en_cima'
  if (p.reciboEnCartera === null || p.fechaCorreo === null) return 'no_se_sabe'
  const n = diasHabilesEntre(p.fechaCorreo, p.hoy)
  if (n === null) return 'no_se_sabe'
  return n >= DIAS_HABILES_ESPERA_REFLEJO ? 'avisar' : 'esperar'
}

/** Tipos de aviso de cruce (son también el prefijo de su clave de idempotencia en `correo_cruce_aviso`). */
export const TIPOS_AVISO_CRUCE = ['emision_sin_cima', 'anulacion_sin_cima', 'devolucion_sin_recibo', 'enlace_ambiguo'] as const
export type TipoAvisoCruce = (typeof TIPOS_AVISO_CRUCE)[number]

// ── 3. Estado normalizado de una solicitud ───────────────────────────────────

/** Estados normalizados de `solicitud_compania.estado` (§4.1). `null` = la plantilla no se reconoció (no «presentada»). */
export const ESTADOS_SOLICITUD_COMPANIA = ['presentada', 'pte_documentacion', 'pte_autorizacion', 'aceptada', 'emitida', 'rechazada', 'cerrada'] as const
export type EstadoSolicitudCompania = (typeof ESTADOS_SOLICITUD_COMPANIA)[number]

const CERRADA_LITERAL = /caducidad\s+de\s+solicitud|finalizaci[oó]n\s+autom[aá]tica/i

/** De la fase leída (`FaseSolicitud`) y el literal de la compañía al estado normalizado. Lo que no se reconoce → `null`. */
export function estadoSolicitudNormalizado(fase: string | null | undefined, literal: string | null | undefined): EstadoSolicitudCompania | null {
  if (fase === 'pte_documentacion' || fase === 'aceptada' || fase === 'emitida' || fase === 'rechazada') return fase
  if (typeof literal === 'string' && CERRADA_LITERAL.test(literal)) return 'cerrada'
  return null
}

/** ¿El estado cierra la solicitud? (rechazada / cerrada). `emitida` no: queda abierta hasta que llega su póliza. */
export function estadoCierraSolicitud(e: EstadoSolicitudCompania | null): boolean {
  return e === 'rechazada' || e === 'cerrada'
}

// ── 4. Enlace póliza CIMA nueva ↔ oportunidad abierta ────────────────────────

/** Código DGS de las compañías de los eventos de correo (mismo mapa que `apps/asegura/lib/correo-evento.ts`). */
export const CODIGO_DGS_COMPANIA: Readonly<Record<string, string>> = { occident: 'C0468', reale: 'C0613', mapfre: 'C0058', allianz: 'C0109' }


export type OportunidadEnlace = {
  id: string
  clienteId: string
  /** Índice ciego del NIF de SU ficha (`dni_lookup_hash`). `null` = la ficha no lo tiene. */
  dniHash: string | null
  /** Ramo (`tipo_seguro`). `null` = la oportunidad no lo dice: no casa por heurística. */
  ramo: string | null
  /** Compañía de la oportunidad (la de su solicitud, o la ganadora apuntada). `null` = no consta: no casa por heurística. */
  codigoDgs: string | null
  /** ISO con hora. */
  creadaEn: string
}

export type PolizaNuevaEnlace = {
  id: string
  clienteId: string
  dniHash: string | null
  ramo: string | null
  codigoDgs: string | null
  numeroPoliza: string | null
  creadaEn: string
  /**
   * Hay otra póliza del MISMO cliente, compañía y ramo anterior a esta: puede ser su renovación con nº nuevo, no una
   * venta. Entonces la heurística no la enlaza (por nº de solicitud sí: eso es prueba).
   */
  previaMismoRiesgo: boolean
}

export type SolicitudEmitidaEnlace = {
  id: string
  codigoDgs: string
  numeroPoliza: string
  /** La oportunidad que lleva esa solicitud (si se sabe). */
  oportunidadId: string | null
}

export type EnlacePolizaOportunidad = {
  oportunidadId: string
  polizaId: string
  via: 'solicitud' | 'tomador_compania_ramo'
  solicitudId: string | null
}

export type MotivoEnlaceAmbiguo = 'varias_oportunidades' | 'varias_polizas' | 'solicitud_varias_polizas' | 'solicitud_otro_tomador'

export type EnlaceAmbiguo = {
  polizaId: string
  /** Oportunidades candidatas (para el aviso). Vacío con `solicitud_varias_polizas`. */
  oportunidades: string[]
  /** `solicitud_otro_tomador`: el nº de solicitud casa pero la póliza es de OTRO tomador que la oportunidad. */
  motivo: MotivoEnlaceAmbiguo
  solicitudId: string | null
}

export type DecisionEnlaces = {
  enlaces: EnlacePolizaOportunidad[]
  /** Solicitud emitida cuya póliza ya está en CIMA (se apunta `solicitud_compania.poliza_id`, haya o no oportunidad). */
  solicitudesConPoliza: { solicitudId: string; polizaId: string }[]
  ambiguos: EnlaceAmbiguo[]
}

/** Margen: la póliza puede tener `created_at` unos minutos antes que la oportunidad si se abrieron a la vez. */
const MARGEN_MS = 10 * 60_000

/** ¿Es la MISMA persona? Misma ficha, o las dos fichas con el mismo índice ciego del NIF. Dos NIF distintos, jamás. */
export function mismoTomador(a: { clienteId: string; dniHash: string | null }, b: { clienteId: string; dniHash: string | null }): boolean {
  if (a.clienteId === b.clienteId) return true
  return a.dniHash !== null && b.dniHash !== null && a.dniHash === b.dniHash
}

function casaHeuristica(o: OportunidadEnlace, p: PolizaNuevaEnlace): boolean {
  if (p.previaMismoRiesgo) return false
  if (!o.ramo || !p.ramo || o.ramo !== p.ramo) return false
  if (!o.codigoDgs || !p.codigoDgs || o.codigoDgs !== p.codigoDgs) return false
  if (!mismoTomador(o, p)) return false
  const to = Date.parse(o.creadaEn)
  const tp = Date.parse(p.creadaEn)
  if (Number.isNaN(to) || Number.isNaN(tp)) return false
  return tp >= to - MARGEN_MS
}

/**
 * Qué pólizas nuevas se enlazan con qué oportunidades abiertas. Prioridad: nº de solicitud → póliza (determinista) y,
 * con lo que quede, la heurística tomador + compañía + ramo SOLO uno a uno (la póliza casa con UNA oportunidad y esa
 * oportunidad con UNA póliza). Cualquier otra cosa → `ambiguos` (no se enlaza nada y se avisa).
 */
export function decidirEnlacesPolizaOportunidad(
  oportunidades: readonly OportunidadEnlace[], polizas: readonly PolizaNuevaEnlace[], solicitudes: readonly SolicitudEmitidaEnlace[],
): DecisionEnlaces {
  const enlaces: EnlacePolizaOportunidad[] = []
  const solicitudesConPoliza: { solicitudId: string; polizaId: string }[] = []
  const ambiguos: EnlaceAmbiguo[] = []
  const polizaUsada = new Set<string>()
  const oportunidadUsada = new Set<string>()
  const abiertas = new Map(oportunidades.map((o) => [o.id, o]))

  // (1) Por nº de solicitud → nº de póliza emitida, en la MISMA compañía.
  for (const s of solicitudes) {
    const num = numeroPolizaComparable(s.numeroPoliza)
    if (!num) continue
    const casan = polizas.filter((p) => p.codigoDgs === s.codigoDgs && numeroPolizaComparable(p.numeroPoliza) === num)
    if (casan.length > 1) {
      for (const p of casan) ambiguos.push({ polizaId: p.id, oportunidades: [], motivo: 'solicitud_varias_polizas', solicitudId: s.id })
      for (const p of casan) polizaUsada.add(p.id)
      continue
    }
    const p = casan[0]
    if (!p) continue
    solicitudesConPoliza.push({ solicitudId: s.id, polizaId: p.id })
    polizaUsada.add(p.id)
    const o = s.oportunidadId ? abiertas.get(s.oportunidadId) : undefined
    // El nº casa, pero la oportunidad solo se gana si la póliza es del MISMO tomador (ficha o NIF). Si no → ambiguo.
    if (o && !mismoTomador(o, p)) {
      ambiguos.push({ polizaId: p.id, oportunidades: [o.id], motivo: 'solicitud_otro_tomador', solicitudId: s.id })
      oportunidadUsada.add(o.id)
      continue
    }
    if (o && !oportunidadUsada.has(o.id)) {
      enlaces.push({ oportunidadId: o.id, polizaId: p.id, via: 'solicitud', solicitudId: s.id })
      oportunidadUsada.add(o.id)
    }
  }

  // (2) Heurística, uno a uno.
  const restoP = polizas.filter((p) => !polizaUsada.has(p.id))
  const restoO = oportunidades.filter((o) => !oportunidadUsada.has(o.id))
  const porPoliza = new Map<string, string[]>()
  const porOportunidad = new Map<string, string[]>()
  for (const p of restoP) {
    for (const o of restoO) {
      if (!casaHeuristica(o, p)) continue
      porPoliza.set(p.id, [...(porPoliza.get(p.id) ?? []), o.id])
      porOportunidad.set(o.id, [...(porOportunidad.get(o.id) ?? []), p.id])
    }
  }
  for (const p of restoP) {
    const ops = porPoliza.get(p.id) ?? []
    if (ops.length === 0) continue
    if (ops.length > 1) { ambiguos.push({ polizaId: p.id, oportunidades: ops, motivo: 'varias_oportunidades', solicitudId: null }); continue }
    const o = ops[0]
    if ((porOportunidad.get(o) ?? []).length > 1) { ambiguos.push({ polizaId: p.id, oportunidades: [o], motivo: 'varias_polizas', solicitudId: null }); continue }
    enlaces.push({ oportunidadId: o, polizaId: p.id, via: 'tomador_compania_ramo', solicitudId: null })
  }
  return { enlaces, solicitudesConPoliza, ambiguos }
}

/** Compañía de una oportunidad: la de su solicitud (clave) o, si no, la ganadora apuntada por nombre. `null` = no consta. */
export function dgsDeOportunidad(o: { companiaSolicitud: string | null; aseguradoraGanadora: string | null }): string | null {
  if (o.companiaSolicitud && CODIGO_DGS_COMPANIA[o.companiaSolicitud]) return CODIGO_DGS_COMPANIA[o.companiaSolicitud]
  const n = (o.aseguradoraGanadora ?? '').toLowerCase()
  if (n === '') return null
  // Solo el nombre de la compañía. «catalana» NO: Plus Ultra y Seguros Bilbao son del grupo y tienen OTRO código DGS.
  const claves: [string, string[]][] = [['occident', ['occident']], ['reale', ['reale']], ['mapfre', ['mapfre']], ['allianz', ['allianz']]]
  const casan = claves.filter(([, ks]) => ks.some((k) => n.includes(k)))
  return casan.length === 1 ? CODIGO_DGS_COMPANIA[casan[0][0]] : null
}
