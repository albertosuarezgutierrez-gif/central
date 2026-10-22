// Escanear una póliza NUNCA duplica (22/10/2026, Alberto, prioridad alta). PURO: sin BD ni red.
//
// Al subir una póliza (corredor en plataforma o cliente en el portal) se leen TODAS las personas con
// DNI/CIF, se casan con las fichas que ya existen por IDENTIDAD (índice ciego del DNI/CIF, nunca por
// nombre) y, si la póliza ya tiene oportunidad, se ACTUALIZA en vez de abrir otra. Aquí vive lo que
// decide; orquestar (buscar, escribir, avisar) es de `apps/asegura/lib/oportunidad-documento.ts`.
//
//  - `modelosLecturaPoliza`: qué modelo de visión lee la póliza (configurable por env) y su suplente.
//  - `normalizarPersonasPoliza`: tomador, asegurados, propietario, conductores y beneficiarios, de
//    CUALQUIER ramo, cada uno `{rol, nombre, identificador}`.
//  - `riesgoLeidoDeDocumento`: capitales y garantías leídos (`null` = no leído, nunca 0 ni []).
//  - `decidirFichaPorIdentidad`: activa antes que descartada; la única descartada se usa y se
//    REACTIVA; dos activas con el mismo DNI/CIF = AMBIGUA (no se elige a ciegas).
//  - `procedenciaCamposOportunidad` + `fusionarLecturaEnOportunidad`: lo leído actualiza la
//    oportunidad sin pisar lo puesto a mano y sin pisar con `null`.

import { MARCADORES_SIN_DATO } from './documento-auto.ts'
import { identificadorFiscal } from './poliza-de-documento.ts'
import { claveNombre } from './figuras-poliza.ts'

// ─── Modelo de visión ───────────────────────────────────────────────────────

/**
 * Modelo por defecto para LEER pólizas (texto y foto). `google/gemini-3.8-flash`: el mismo que ya lee
 * los DNI/carnés de la solicitud de datos (`leer-doc-solicitud.ts`), confirmado vivo y con visión en
 * `docs/BUSCADOR-IA.md` (GA 02/09/2026, $0,75/$3,75 por M) y servido por Google (Vertex), que cumple
 * `data_collection=deny`. Una póliza son ~6k tokens de entrada: ~0,02 € por lectura.
 */
export const MODELO_POLIZA_DEFECTO = 'google/gemini-3.8-flash'
/**
 * Suplente (fallback NATIVO de OpenRouter en la misma petición): `anthropic/claude-sonnet-4.5`, con
 * visión, el que ya usa el lector registral y el formador del tarificador. ~4× más caro: solo entra si
 * el primero falla.
 */
export const MODELO_POLIZA_SUPLENTE = 'anthropic/claude-sonnet-4.5'

const SLUG = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i

/**
 * `[principal, suplente]` para leer pólizas. `OPENROUTER_POLIZA_MODEL` y
 * `OPENROUTER_POLIZA_MODEL_SUPLENTE` los cambian sin desplegar código; un valor que no tiene forma de
 * slug (`proveedor/modelo`) se ignora (un typo no puede dejar la lectura sin modelo).
 */
export function modelosLecturaPoliza(env: Record<string, string | undefined>): string[] {
  const elegido = (v: string | undefined, defecto: string) => {
    const t = (v ?? '').trim()
    return SLUG.test(t) ? t : defecto
  }
  return [...new Set([elegido(env.OPENROUTER_POLIZA_MODEL, MODELO_POLIZA_DEFECTO), elegido(env.OPENROUTER_POLIZA_MODEL_SUPLENTE, MODELO_POLIZA_SUPLENTE)])]
}

// ─── Personas de la póliza ──────────────────────────────────────────────────

export const ROLES_PERSONA_POLIZA = ['tomador', 'asegurado', 'propietario', 'conductor_habitual', 'conductor_ocasional', 'beneficiario'] as const
export type RolPersonaPoliza = (typeof ROLES_PERSONA_POLIZA)[number]

/** Tope de personas por documento: más es casi seguro basura del modelo. */
export const MAX_PERSONAS_POLIZA = 12

export type PersonaPolizaLeida = {
  rol: RolPersonaPoliza
  /** `null` = el documento no da su nombre (solo su DNI/CIF). */
  nombre: string | null
  /** DNI/NIE/CIF con la letra comprobada; `null` = no figura o no cuadra (no se casa con nadie). */
  identificador: string | null
  tipoPersona: 'fisica' | 'juridica' | null
}

const SIN_DATO = new Set(MARCADORES_SIN_DATO)
function texto(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  if (t === '' || SIN_DATO.has(t.toLowerCase())) return null
  return t.slice(0, max)
}

const ALIAS_ROL: Record<string, RolPersonaPoliza> = {
  tomador: 'tomador', titular: 'tomador', contratante: 'tomador', titular_de_la_poliza: 'tomador',
  asegurado: 'asegurado', asegurado_principal: 'asegurado', asegurados: 'asegurado',
  propietario: 'propietario', titular_del_vehiculo: 'propietario',
  conductor_habitual: 'conductor_habitual', conductor_principal: 'conductor_habitual',
  conductor_ocasional: 'conductor_ocasional', conductor_adicional: 'conductor_ocasional',
  beneficiario: 'beneficiario', beneficiarios: 'beneficiario', beneficiario_preferente: 'beneficiario',
}

function rolDe(v: unknown): RolPersonaPoliza | null {
  if (typeof v !== 'string') return null
  const k = v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return ALIAS_ROL[k] ?? null
}

function persona(rol: RolPersonaPoliza | null, nombreRaw: unknown, ...ids: unknown[]): PersonaPolizaLeida | null {
  if (!rol) return null
  const nombre = texto(nombreRaw)
  let id: { valor: string; tipoPersona: 'fisica' | 'juridica' } | null = null
  for (const x of ids) {
    id = identificadorFiscal(x)
    if (id) break
  }
  if (!nombre && !id) return null
  return { rol, nombre, identificador: id?.valor ?? null, tipoPersona: id?.tipoPersona ?? null }
}

/**
 * Todas las personas que nombra la póliza, de cualquier ramo. Lee `personas` (el esquema nuevo), las
 * `figuras` de motor (el de siempre) y el tomador de arriba (`tomador` + `cifTomador`/`dni`). Sin
 * nombre ni DNI/CIF no hay persona. La misma persona en el mismo rol (mismo identificador, o mismo
 * nombre y a uno le falta el identificador) sale una vez; dos identificadores distintos, nunca se
 * funden. Nunca lanza.
 */
export function normalizarPersonasPoliza(raw: unknown): PersonaPolizaLeida[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return []
  const o = raw as Record<string, unknown>
  const leidas: PersonaPolizaLeida[] = []
  const tomador = persona('tomador', o.tomador, o.cifTomador, o.dni)
  if (tomador) leidas.push(tomador)
  for (const lista of [o.personas, o.figuras]) {
    if (!Array.isArray(lista)) continue
    for (const x of lista.slice(0, 30)) {
      if (typeof x !== 'object' || x === null || Array.isArray(x)) continue
      const p = x as Record<string, unknown>
      const r = persona(rolDe(p.rol), p.nombre, p.dni, p.cif, p.nif, p.identificador)
      if (r) leidas.push(r)
    }
  }
  const out: PersonaPolizaLeida[] = []
  for (const p of leidas) {
    const clave = p.nombre ? claveNombre(p.nombre) : ''
    const igual = out.find((q) => q.rol === p.rol && (
      (p.identificador !== null && q.identificador === p.identificador) ||
      // Por nombre SOLO si ninguna trae identificador: un padre con DNI y su hijo homónimo sin DNI son dos personas.
      (clave !== '' && q.nombre !== null && claveNombre(q.nombre) === clave && q.identificador === null && p.identificador === null)
    ))
    if (!igual) { out.push({ ...p }); continue }
    igual.nombre ??= p.nombre
    if (igual.identificador === null && p.identificador !== null) {
      igual.identificador = p.identificador
      igual.tipoPersona = p.tipoPersona
    }
  }
  return out.slice(0, MAX_PERSONAS_POLIZA)
}

// ─── Capitales y garantías ──────────────────────────────────────────────────

export type GarantiaLeida = { nombre: string; capital: number | null; franquicia: number | null }
export type CapitalesLeidos = { continente: number | null; contenido: number | null; asegurado: number | null }
/** `garantias: null` = no se han leído (no es «la póliza no tiene»). */
export type RiesgoLeido = { capitales: CapitalesLeidos; garantias: GarantiaLeida[] | null }
export const CLAVES_CAPITAL = ['continente', 'contenido', 'asegurado'] as const
export const MAX_GARANTIAS = 40

/** Un importe en euros: número, o texto español («61.000,00 €»). `null` = no es un importe. Nunca 0. */
export function importeLeido(v: unknown): number | null {
  let n: number | null = null
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    let t = v.replace(/[€\s]|eur(os)?/gi, '')
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
    n = /^\d+(\.\d+)?$/.test(t) ? Number(t) : null
  }
  return n !== null && Number.isFinite(n) && n > 0 && n < 1e10 ? Math.round(n * 100) / 100 : null
}

/** Capitales y garantías que trae el JSON leído (de cualquier ramo). Nunca lanza. */
export function riesgoLeidoDeDocumento(raw: unknown): RiesgoLeido {
  const o = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const capitales: CapitalesLeidos = {
    continente: importeLeido(o.capitalContinente),
    contenido: importeLeido(o.capitalContenido),
    asegurado: importeLeido(o.capitalAsegurado),
  }
  if (!Array.isArray(o.garantias)) return { capitales, garantias: null }
  const vistas = new Set<string>()
  const garantias: GarantiaLeida[] = []
  for (const g of o.garantias.slice(0, 80)) {
    const r = typeof g === 'string' ? { nombre: g } : typeof g === 'object' && g !== null && !Array.isArray(g) ? (g as Record<string, unknown>) : null
    const nombre = r ? texto(r.nombre, 120) : null
    if (!r || !nombre) continue
    const k = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    if (vistas.has(k)) continue
    vistas.add(k)
    garantias.push({ nombre, capital: importeLeido(r.capital), franquicia: importeLeido(r.franquicia) })
  }
  return { capitales, garantias: garantias.slice(0, MAX_GARANTIAS) }
}

// ─── ¿Qué ficha es? ─────────────────────────────────────────────────────────

/** Una ficha con el DNI/CIF buscado (índice ciego) y si está activa (`clientes.activo`). */
export type CandidataIdentidad = { id: string; activo: boolean }

export type DecisionIdentidad =
  /** No se pudo buscar (`null`): no es «no hay nadie». */
  | { tipo: 'sin_mirar' }
  | { tipo: 'ninguna' }
  | { tipo: 'ficha'; clienteId: string; reactivar: boolean; porque: 'preferida' | 'unica_activa' | 'unica_descartada' }
  /** Varias fichas con la MISMA identidad: no se elige a ciegas (posible duplicado sin fundir). */
  | { tipo: 'ambigua'; candidatas: string[] }

/**
 * La ficha de una identidad (DNI/CIF) en TODA la cartera, descartadas incluidas.
 *  - `preferida` (la ficha donde se sube) con esa identidad → esa (si estaba descartada, se reactiva).
 *  - Una sola ACTIVA → esa, aunque haya descartadas (la descartada suele ser el duplicado ya apartado).
 *  - Ninguna activa y UNA descartada → esa, y se REACTIVA (vuelve a tener una póliza viva).
 *  - Dos o más activas (o ninguna activa y varias descartadas) → `ambigua`.
 */
export function decidirFichaPorIdentidad(candidatas: readonly CandidataIdentidad[] | null, preferida: string | null = null): DecisionIdentidad {
  if (candidatas === null) return { tipo: 'sin_mirar' }
  const porId = new Map<string, boolean>()
  for (const c of candidatas) porId.set(c.id, (porId.get(c.id) ?? false) || c.activo)
  if (porId.size === 0) return { tipo: 'ninguna' }
  if (preferida && porId.has(preferida)) return { tipo: 'ficha', clienteId: preferida, reactivar: porId.get(preferida) !== true, porque: 'preferida' }
  const activas = [...porId].filter(([, a]) => a).map(([id]) => id)
  if (activas.length === 1) return { tipo: 'ficha', clienteId: activas[0], reactivar: false, porque: 'unica_activa' }
  if (activas.length > 1) return { tipo: 'ambigua', candidatas: activas }
  const descartadas = [...porId.keys()]
  if (descartadas.length === 1) return { tipo: 'ficha', clienteId: descartadas[0], reactivar: true, porque: 'unica_descartada' }
  return { tipo: 'ambigua', candidatas: descartadas }
}

// ─── Actualizar la oportunidad con lo leído ─────────────────────────────────

/** Acción del historial de la oportunidad cuando un documento la actualiza (o choca con lo puesto a mano). */
export const ACCION_ACTUALIZADA_DOCUMENTO = 'actualizada_documento'

export const CAMPOS_PROCEDENCIA = ['fechaFinVigencia', 'prima'] as const
export type CampoProcedencia = (typeof CAMPOS_PROCEDENCIA)[number]
/** `manual` = lo puso Alberto; `documento` = leído de una póliza; `otra` = declarado/estimado (portal, web, recaptación). */
export type Procedencia = 'manual' | 'documento' | 'otra'
export type EventoHistorialOportunidad = { accion: string; detalle: unknown }

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/**
 * Quién puso por última vez cada campo, leyendo el historial de la oportunidad EN ORDEN (el más
 * antiguo primero). `null` = no consta (oportunidad sin historial, p. ej. importada): quien llama la
 * trata como manual (estado conservador: no se pisa).
 */
export function procedenciaCamposOportunidad(eventos: readonly EventoHistorialOportunidad[]): Record<CampoProcedencia, Procedencia | null> {
  const r: Record<CampoProcedencia, Procedencia | null> = { fechaFinVigencia: null, prima: null }
  for (const e of eventos) {
    const d = obj(e.detalle)
    for (const campo of CAMPOS_PROCEDENCIA) {
      if (e.accion === 'editada' && campo in d) r[campo] = 'manual'
      else if (e.accion === ACCION_ACTUALIZADA_DOCUMENTO && campo in obj(d.cambios)) r[campo] = 'documento'
      else if (e.accion === 'fecha_desde_recaptacion' && campo === 'fechaFinVigencia') r[campo] = 'otra'
      else if (e.accion.startsWith('creada') && d[campo] !== null && d[campo] !== undefined) {
        const origen = typeof d.origen === 'string' ? d.origen : null
        r[campo] = e.accion !== 'creada_mano' ? 'otra'
          : origen === null || origen === 'ficha:manual' ? 'manual'
          : origen.startsWith('documento:') ? 'documento' : 'otra'
      }
    }
  }
  return r
}

export type ValorLeidoDocumento<T> = { valor: T; fuente: string; leido_en: string }
export type PersonaEnlazada = { rol: RolPersonaPoliza; clienteId: string | null }
/** `info_riesgo.lecturaDocumento`: claves estables, cada valor con su fuente y cuándo se leyó. */
export type LecturaDocumentoOportunidad = {
  /** El vencimiento TAL COMO LO DICE el último documento aplicado: un documento más antiguo no pisa. */
  vencimientoDocumento?: string
  capitales?: Partial<Record<(typeof CLAVES_CAPITAL)[number], ValorLeidoDocumento<number>>>
  garantias?: ValorLeidoDocumento<GarantiaLeida[]>
  /** Personas de la póliza casadas con su ficha (solo ids: sin nombres ni DNI). */
  personas?: ValorLeidoDocumento<PersonaEnlazada[]>
}

export type Discrepancia = { campo: string; actual: unknown; leido: unknown; motivo: 'manual' | 'sin_procedencia' | 'documento_mas_antiguo' }

export type ResultadoFusion = {
  /** Lo que se escribe en las columnas; ausente = no se toca. */
  cambios: { fechaFinVigencia?: string; prima?: number }
  lectura: LecturaDocumentoOportunidad
  lecturaCambiada: boolean
  discrepancias: Discrepancia[]
  /** Lo que había antes (el snapshot que va al historial). */
  antes: { fechaFinVigencia: string | null; prima: number | null; lectura: LecturaDocumentoOportunidad }
}

const fechaIso = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const valorLeido = <T>(v: unknown, es: (x: unknown) => x is T): ValorLeidoDocumento<T> | undefined => {
  const o = obj(v)
  return es(o.valor) && typeof o.fuente === 'string' ? { valor: o.valor, fuente: o.fuente, leido_en: typeof o.leido_en === 'string' ? o.leido_en : '' } : undefined
}
const esNumero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const esLista = (x: unknown): x is never[] => Array.isArray(x)

/** `info_riesgo.lecturaDocumento` tal como esté guardado (lo que no tenga forma se ignora). */
export function leerLecturaDocumento(v: unknown): LecturaDocumentoOportunidad {
  const o = obj(v)
  const out: LecturaDocumentoOportunidad = {}
  const venc = fechaIso(o.vencimientoDocumento)
  if (venc) out.vencimientoDocumento = venc
  const caps: NonNullable<LecturaDocumentoOportunidad['capitales']> = {}
  for (const k of CLAVES_CAPITAL) {
    const x = valorLeido(obj(o.capitales)[k], esNumero)
    if (x) caps[k] = x
  }
  if (Object.keys(caps).length > 0) out.capitales = caps
  const g = valorLeido<GarantiaLeida[]>(o.garantias, esLista)
  if (g) out.garantias = g
  const p = valorLeido<PersonaEnlazada[]>(o.personas, esLista)
  if (p) out.personas = p
  return out
}

/**
 * Lo leído de una póliza contra la oportunidad que ya existe (o vacía, al crearla). Regla por campo:
 *  - Lo leído `null` (o lista vacía) no toca nada: `null` = no leído, nunca «no hay».
 *  - Hueco → se rellena.
 *  - Igual → nada.
 *  - Puesto a MANO (o sin procedencia conocida) → NO se pisa; se anota la discrepancia.
 *  - Leído de un documento, o declarado/estimado → se actualiza, salvo que el documento nuevo sea
 *    MÁS ANTIGUO que el que lo puso (vence antes): discrepancia.
 */
export function fusionarLecturaEnOportunidad(e: {
  actual: { fechaFinVigencia: string | null; prima: number | null; lectura: unknown }
  procedencia: Record<CampoProcedencia, Procedencia | null>
  leido: { fechaFinVigencia: string | null; prima: number | null; vencimientoDocumento: string | null; riesgo: RiesgoLeido; personas?: PersonaEnlazada[] | null }
  leidoEn: string
}): ResultadoFusion {
  const previa = leerLecturaDocumento(e.actual.lectura)
  const antes = { fechaFinVigencia: e.actual.fechaFinVigencia, prima: e.actual.prima, lectura: previa }
  const vencNuevo = fechaIso(e.leido.vencimientoDocumento)
  const masAntiguo = Boolean(vencNuevo && previa.vencimientoDocumento && vencNuevo < previa.vencimientoDocumento)
  const discrepancias: Discrepancia[] = []
  const cambios: ResultadoFusion['cambios'] = {}
  const igual = (a: unknown, b: unknown) =>
    typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.005 : JSON.stringify(a) === JSON.stringify(b)

  /** ¿Se escribe? `actual` es lo guardado; `prov` quién lo puso. */
  const decidir = (campo: string, actual: unknown, leido: unknown, prov: Procedencia | null): boolean => {
    if (leido === null || leido === undefined) return false
    if (actual === null || actual === undefined) return true
    if (igual(actual, leido)) return false
    if (prov === 'manual' || prov === null) {
      discrepancias.push({ campo, actual, leido, motivo: prov === 'manual' ? 'manual' : 'sin_procedencia' })
      return false
    }
    if (prov === 'documento' && masAntiguo) {
      discrepancias.push({ campo, actual, leido, motivo: 'documento_mas_antiguo' })
      return false
    }
    return true
  }

  if (decidir('fechaFinVigencia', e.actual.fechaFinVigencia, fechaIso(e.leido.fechaFinVigencia), e.procedencia.fechaFinVigencia)) cambios.fechaFinVigencia = fechaIso(e.leido.fechaFinVigencia)!
  const prima = esNumero(e.leido.prima) && e.leido.prima > 0 ? e.leido.prima : null
  if (decidir('prima', e.actual.prima, prima, e.procedencia.prima)) cambios.prima = prima!

  const lectura: LecturaDocumentoOportunidad = JSON.parse(JSON.stringify(previa))
  let lecturaCambiada = false
  const nuevo = <T>(valor: T): ValorLeidoDocumento<T> => ({ valor, fuente: 'documento', leido_en: e.leidoEn })
  const provDe = (v: ValorLeidoDocumento<unknown> | undefined): Procedencia | null => (v ? (v.fuente === 'documento' ? 'documento' : 'manual') : 'documento')

  for (const k of CLAVES_CAPITAL) {
    const leido = e.leido.riesgo.capitales[k]
    const ya = lectura.capitales?.[k]
    if (decidir(`capitales.${k}`, ya?.valor, leido, provDe(ya))) {
      lectura.capitales = { ...(lectura.capitales ?? {}), [k]: nuevo(leido as number) }
      lecturaCambiada = true
    }
  }
  const garantias = e.leido.riesgo.garantias && e.leido.riesgo.garantias.length > 0 ? e.leido.riesgo.garantias : null
  if (decidir('garantias', lectura.garantias?.valor, garantias, provDe(lectura.garantias))) {
    lectura.garantias = nuevo(garantias!)
    lecturaCambiada = true
  }
  const personas = e.leido.personas && e.leido.personas.length > 0 ? e.leido.personas : null
  if (decidir('personas', lectura.personas?.valor, personas, provDe(lectura.personas))) {
    lectura.personas = nuevo(personas!)
    lecturaCambiada = true
  }
  if (vencNuevo && (!lectura.vencimientoDocumento || vencNuevo > lectura.vencimientoDocumento)) {
    lectura.vencimientoDocumento = vencNuevo
    lecturaCambiada = true
  }
  return { cambios, lectura, lecturaCambiada, discrepancias, antes }
}
