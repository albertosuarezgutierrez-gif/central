// La ficha de UNA póliza, leída por el puerto de central-asegura. Misma
// disciplina que `ficha-asegura.ts`: interpretación PURA, cuatro estados, y
// cada bloque con su propio «no se sabe».

import {
  leerEvolucionPrima, leerIntervinientes, leerObjeto, leerPago, leerRecibos, leerRetarificacion,
  type IntervinienteFicha, type ObjetoFicha, type PagoFicha, type RecibosPoliza, type MotivoFicha,
} from './ficha-asegura.ts'
import { leerSiniestros, type SiniestroCartera } from './siniestros-asegura.ts'
import type { DocumentoResumen, EvolucionPrima, Retarificabilidad } from '@central/module-seguros'
import { leerDocumentos } from './documentos-asegura.ts'
import type { CapitalAsegurado, DetalleCobertura } from '@central/module-seguros'

export type CoberturaFicha = {
  orden: number | null
  codigo: string | null
  descripcion: string | null
  capital: string | null
  descripcionCapital: string | null
  franquicia: string | null
  desde: string | null
  hasta: string | null
  /** Solo si el puerto los manda (asegura desplegado con esta versión): la UI los trata como opcionales. */
  modalidad?: string | null
  detalle?: DetalleCobertura | null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Copia defensiva del detalle que manda el puerto: cualquier forma rara degrada a null, nunca a un límite inventado. */
function leerDetalleCobertura(v: unknown): DetalleCobertura | null {
  if (typeof v !== 'object' || v === null) return null
  const d = v as Record<string, unknown>
  const limites = Array.isArray(d.limites)
    ? d.limites.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null).map((l) => ({
        clase: cadena(l.clase), descripcion: cadena(l.descripcion), minimo: num(l.minimo), maximo: num(l.maximo),
      }))
    : []
  const franquicias = Array.isArray(d.franquicias)
    ? d.franquicias.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null).map((f) => ({
        clase: cadena(f.clase), porcentaje: num(f.porcentaje), minimo: num(f.minimo), maximo: num(f.maximo),
      }))
    : []
  const p = typeof d.prima === 'object' && d.prima !== null ? (d.prima as Record<string, unknown>) : null
  const prima = p ? { neta: num(p.neta), total: num(p.total) } : null
  if (limites.length === 0 && franquicias.length === 0 && !prima) return null
  return { limites, franquicias, prima }
}

export type ReciboFicha = {
  id: string
  situacion: string
  importe: number | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  formaPago: string | null
}

export type Poliza = {
  id: string
  cliente: { id: string; nombre: string }
  tipo: string
  aseguradora: string
  codigoEntidadDgs: string | null
  numeroPoliza: string | null
  idPolizaEntidad: string | null
  ramoDgs: string | null
  estado: string
  situacion: string | null
  origen: string
  viva: boolean
  fechaEfectoInicial: string | null
  fechaInicio: string | null
  fechaVencimiento: string | null
  prima: number | null
  primaAnual: number | null
  primaBruta: number | null
  primaMensual: number | null
  objeto: ObjetoFicha | null
  /** `null` = no hay gemela O asegura no manda el campo: la UI no afirma que no exista. */
  gemela: { polizaId: string; clienteId: string; importRef: string; objeto: ObjetoFicha | null; fechaVencimiento: string | null } | null
  gemelaInformada: boolean
  coberturas: CoberturaFicha[]
  recibos: RecibosPoliza | null
  listaRecibos: ReciboFicha[]
  /** `null` = asegura no manda la lista (no es «sin siniestros», que es `[]`). */
  siniestros: SiniestroCartera[] | null
  intervinientes: IntervinienteFicha[] | null
  /** `null` = no se pudo contar. `0` = se contó y no hay. */
  documentos: number | null
  /** La lista con estados. `null` = asegura no la informa o no se pudo. */
  listaDocumentos: DocumentoResumen[] | null
  pago: PagoFicha | null
  retarificable: boolean
  /** Ramo/motivo/fuente del veredicto. `null` = asegura (versión vieja) no lo manda. */
  retarificacion: Retarificabilidad | null
  /**
   * «¿Por qué ha subido la prima?»: anualidades derivadas de los recibos CA/NP
   * y veredicto. `null` = asegura no lo manda o llega ilegible; NO es
   * `sin_datos`, que es «se miró y CIMA no da la anualidad anterior».
   */
  evolucionPrima: EvolucionPrima | null
  /**
   * «¿Merece la pena gastarse los 0,50€ en pedir precio?». `null` = la versión
   * desplegada de asegura todavía no lo manda (o llega ilegible): NO es «no hay
   * horquilla», que se dice con `horquilla: null` + `sinBase`.
   */
  estimacion: EstimacionPrima | null
  /** Continente y contenido derivados de las garantías. `null` = asegura no los manda. */
  capitalesHogar: CapitalesHogarFicha | null
}

export type RespuestaPoliza =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: MotivoFicha }
  | { estado: 'no_encontrado' }
  | { estado: 'ok'; poliza: Poliza }

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}
function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

/* ─── Estimación de prima («¿merece la pena pedir precio?») ─────────────────
 * La manda el puerto ya masticada: horquilla, veredicto y una `etiqueta` lista
 * para pintar. Aquí NO se calcula nada — y sobre todo NO se rellena nada: una
 * horquilla inventada se lee como el precio de una compañía, y si luego le
 * dicen 260€ donde ponía 180€ el cliente no vuelve.
 */

export type HorquillaEstimacion = { minEur: number; medianaEur: number; maxEur: number }
export type VeredictoEstimacion = 'merece' | 'no-merece' | 'no-se'
export type BaseEstimacion = 'parecidos' | 'toda-la-cartera'
/** `null` = el puerto no manda el bloque de procedencia; NO es «no hay cotizaciones». */
export type FuenteEstimacion = { cartera: number; cotizaciones: number; cotizacionesDisponibles: boolean }

export type EstimacionPrima = {
  /** `null` = no hay horquilla. El PORQUÉ está en `sinBase` (y son cosas distintas: «todavía no hay casos» ≠ «los que hay han caducado»). */
  horquilla: HorquillaEstimacion | null
  sinBase: string | null
  casos: number
  desde: string | null
  hasta: string | null
  antiguedadMedianaMeses: number | null
  base: BaseEstimacion | null
  /** Frase ya redactada por el puerto. Se pinta TAL CUAL: es la que dice que esto no es un precio. */
  etiqueta: string
  orientativa: true
  /** `no-se` NO es un fallo ni un hueco: es una respuesta, y se pinta con su `porque`. */
  veredicto: VeredictoEstimacion
  porque: string
  fuente: FuenteEstimacion | null
}

/* ─── Capitales de hogar ────────────────────────────────────────────────────
 * `CapitalAsegurado` vive en `@central/module-seguros` (`garantias.ts`) y tiene
 * SEIS estados que no se pueden colapsar entre sí: en particular `mayorEur` de
 * `solo_sublimites` NO es el continente, es el mayor sublímite.
 *
 * 🚨 Y `del_volcado` NO es un `consenso`: trae un importe, pero de la copia
 * HISTÓRICA de la póliza (junio de 2026), no de lo que manda hoy la compañía.
 * Su `motivo` es lo único que impide leerlo como el capital actual, así que sin
 * `motivo` no se acepta el estado — igual que sin `eur`.
 */

/** Cada lado por separado: uno ilegible no se lleva por delante al otro. `null` = no se pudo leer. */
export type CapitalesHogarFicha = { continente: CapitalAsegurado | null; contenido: CapitalAsegurado | null }

/** Los tres números o nada: media horquilla es una horquilla inventada. */
function leerHorquilla(v: unknown): HorquillaEstimacion | null {
  if (typeof v !== 'object' || v === null) return null
  const h = v as Record<string, unknown>
  const minEur = numero(h.minEur)
  const medianaEur = numero(h.medianaEur)
  const maxEur = numero(h.maxEur)
  if (minEur === null || medianaEur === null || maxEur === null) return null
  // Fuera de orden = payload roto; pintarla igual daría un rango plausible y falso.
  if (!(minEur <= medianaEur && medianaEur <= maxEur)) return null
  return { minEur, medianaEur, maxEur }
}

function leerFuenteEstimacion(v: unknown): FuenteEstimacion | null {
  if (typeof v !== 'object' || v === null) return null
  const f = v as Record<string, unknown>
  const cartera = entero(f.cartera)
  const cotizaciones = entero(f.cotizaciones)
  if (cartera === null || cotizaciones === null || typeof f.cotizacionesDisponibles !== 'boolean') return null
  return { cartera, cotizaciones, cotizacionesDisponibles: f.cotizacionesDisponibles }
}

function esVeredictoEstimacion(v: unknown): v is VeredictoEstimacion {
  return v === 'merece' || v === 'no-merece' || v === 'no-se'
}

/**
 * Copia defensiva de la estimación. Sin `etiqueta` legible NO se devuelve nada:
 * esa frase es lo único que impide que la horquilla se lea como una oferta, así
 * que sin ella no se pinta el bloque (y nunca se redacta una aquí).
 */
export function leerEstimacion(v: unknown): EstimacionPrima | null {
  if (typeof v !== 'object' || v === null) return null
  const e = v as Record<string, unknown>
  const etiqueta = cadena(e.etiqueta)
  if (etiqueta === null) return null
  return {
    horquilla: leerHorquilla(e.horquilla),
    sinBase: cadena(e.sinBase),
    casos: entero(e.casos) ?? 0,
    desde: cadena(e.desde),
    hasta: cadena(e.hasta),
    antiguedadMedianaMeses: numero(e.antiguedadMedianaMeses),
    base: e.base === 'parecidos' || e.base === 'toda-la-cartera' ? e.base : null,
    etiqueta,
    orientativa: true,
    // Un veredicto que no se reconoce es «no se sabe», nunca «merece»: lo caro
    // es empujar a gastar 0,50€ por un payload que no se ha entendido.
    veredicto: esVeredictoEstimacion(e.veredicto) ? e.veredicto : 'no-se',
    porque: cadena(e.porque) ?? '',
    fuente: leerFuenteEstimacion(e.fuente),
  }
}

/** Un estado de `CapitalAsegurado` solo se acepta con TODOS sus campos; si no, `null` («no se pudo leer»). */
function leerCapitalAsegurado(v: unknown): CapitalAsegurado | null {
  if (typeof v !== 'object' || v === null) return null
  const c = v as Record<string, unknown>
  const motivo = cadena(c.motivo)
  switch (c.estado) {
    case 'consenso': {
      const eur = numero(c.eur)
      const garantias = entero(c.garantias)
      if (eur === null || garantias === null) return null
      return { estado: 'consenso', eur, garantias, ejemplo: cadena(c.ejemplo) }
    }
    case 'del_volcado': {
      const eur = numero(c.eur)
      // Sin `motivo` no se pinta: un capital del volcado sin su rótulo de
      // procedencia es exactamente el fallo que este estado vino a arreglar.
      if (eur === null || motivo === null) return null
      return { estado: 'del_volcado', eur, motivo }
    }
    case 'solo_sublimites': {
      const mayorEur = numero(c.mayorEur)
      if (mayorEur === null || motivo === null) return null
      return { estado: 'solo_sublimites', motivo, mayorEur }
    }
    case 'todo_cero':
      return motivo === null ? null : { estado: 'todo_cero', motivo }
    case 'sin_capital':
      return motivo === null ? null : { estado: 'sin_capital', motivo }
    case 'sin_garantias':
      return motivo === null ? null : { estado: 'sin_garantias', motivo }
    default:
      return null
  }
}

/** `null` = asegura no manda los capitales (versión vieja) o llegan ilegibles los DOS lados. */
export function leerCapitalesHogar(v: unknown): CapitalesHogarFicha | null {
  if (typeof v !== 'object' || v === null) return null
  const c = v as Record<string, unknown>
  const continente = leerCapitalAsegurado(c.continente)
  const contenido = leerCapitalAsegurado(c.contenido)
  if (continente === null && contenido === null) return null
  return { continente, contenido }
}

export function interpretarPoliza(status: number, json: unknown): RespuestaPoliza {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status === 404) return { estado: 'no_encontrado' }
  if (status !== 200 || typeof json !== 'object' || json === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (r.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (r.estado !== 'ok' || typeof r.poliza !== 'object' || r.poliza === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
  const p = r.poliza as Record<string, unknown>
  const c = (typeof p.cliente === 'object' && p.cliente !== null ? p.cliente : {}) as Record<string, unknown>
  if (typeof p.id !== 'string' || typeof p.tipo !== 'string' || typeof p.aseguradora !== 'string' || typeof c.id !== 'string') {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }

  const coberturas: CoberturaFicha[] = []
  if (Array.isArray(p.coberturas)) {
    for (const fila of p.coberturas) {
      if (typeof fila !== 'object' || fila === null) continue
      const o = fila as Record<string, unknown>
      const cob: CoberturaFicha = {
        orden: entero(o.orden), codigo: cadena(o.codigo), descripcion: cadena(o.descripcion),
        capital: cadena(o.capital), descripcionCapital: cadena(o.descripcionCapital), franquicia: cadena(o.franquicia),
        desde: cadena(o.desde), hasta: cadena(o.hasta),
      }
      if ('modalidad' in o) cob.modalidad = cadena(o.modalidad)
      if ('detalle' in o) cob.detalle = leerDetalleCobertura(o.detalle)
      coberturas.push(cob)
    }
  }
  const listaRecibos: ReciboFicha[] = []
  if (Array.isArray(p.listaRecibos)) {
    for (const fila of p.listaRecibos) {
      if (typeof fila !== 'object' || fila === null) continue
      const o = fila as Record<string, unknown>
      if (typeof o.id !== 'string') continue
      listaRecibos.push({
        id: o.id, situacion: cadena(o.situacion) ?? 'sin_informar', importe: numero(o.importe),
        fechaEmision: cadena(o.fechaEmision), fechaVencimiento: cadena(o.fechaVencimiento), formaPago: cadena(o.formaPago),
      })
    }
  }
  const siniestros = leerSiniestros(p.siniestros)
  const g = p.gemela
  const gemela =
    typeof g === 'object' && g !== null && typeof (g as Record<string, unknown>).polizaId === 'string'
      ? {
          polizaId: (g as Record<string, unknown>).polizaId as string,
          clienteId: cadena((g as Record<string, unknown>).clienteId) ?? '',
          importRef: cadena((g as Record<string, unknown>).importRef) ?? '',
          objeto: leerObjeto((g as Record<string, unknown>).objeto),
          fechaVencimiento: cadena((g as Record<string, unknown>).fechaVencimiento),
        }
      : null

  return {
    estado: 'ok',
    poliza: {
      id: p.id,
      cliente: { id: c.id, nombre: cadena(c.nombre) ?? 'sin nombre' },
      tipo: p.tipo,
      aseguradora: p.aseguradora,
      codigoEntidadDgs: cadena(p.codigoEntidadDgs),
      numeroPoliza: cadena(p.numeroPoliza),
      idPolizaEntidad: cadena(p.idPolizaEntidad),
      ramoDgs: cadena(p.ramoDgs),
      estado: cadena(p.estado) ?? 'sin_informar',
      situacion: cadena(p.situacion),
      origen: cadena(p.origen) ?? 'sin_informar',
      viva: p.viva === true,
      fechaEfectoInicial: cadena(p.fechaEfectoInicial),
      fechaInicio: cadena(p.fechaInicio),
      fechaVencimiento: cadena(p.fechaVencimiento),
      prima: numero(p.prima),
      primaAnual: numero(p.primaAnual),
      primaBruta: numero(p.primaBruta),
      primaMensual: numero(p.primaMensual),
      objeto: leerObjeto(p.objeto),
      gemela,
      // La clave puede faltar (versión vieja de asegura): entonces «no hay
      // gemela» no se puede afirmar.
      gemelaInformada: 'gemela' in p,
      coberturas,
      recibos: leerRecibos(p.recibos),
      listaRecibos,
      siniestros,
      intervinientes: leerIntervinientes(p.intervinientes),
      documentos: 'documentos' in p ? entero(p.documentos) : null,
      listaDocumentos: leerDocumentos(p.listaDocumentos),
      pago: leerPago(p.pago),
      retarificable: p.retarificable === true,
      retarificacion: leerRetarificacion(p.retarificacion),
      evolucionPrima: leerEvolucionPrima(p.evolucionPrima),
      estimacion: leerEstimacion(p.estimacion),
      capitalesHogar: leerCapitalesHogar(p.capitalesHogar),
    },
  }
}

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export async function polizaAsegura(id: string): Promise<RespuestaPoliza> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/poliza?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store', signal: AbortSignal.timeout(8000),
    })
    return interpretarPoliza(res.status, await res.json().catch(() => null))
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}
