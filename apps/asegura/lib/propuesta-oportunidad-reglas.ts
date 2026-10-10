// Propuesta de una OPORTUNIDAD (08/10/2026): de los trabajos del tarificador + las fichas de producto + el formulario
// guardado → comparador → control de calidad por oferta → recomendación → modelo del PDF. PURO: sin BD ni red
// (el cargador con SQL está en `propuesta-oportunidad.ts`). NO envía nada: generar ≠ comunicar.
//
// 🚨 Una oferta con ERRORES de calidad sale en la propuesta CON AVISO y NO se recomienda (ni entra en el ranking).
// 🚨 Del cliente solo nombre y referencia. Dato que no consta ≠ 0 (lo resuelven el comparador y el modelo).
// 🚨 La prima que se compara es la ANUAL del portal (nunca el primer recibo prorrateado).

import {
  compararOfertas,
  controlarCalidad,
  recomendar,
  type ControlOferta,
  type FichaComparable,
  type OfertaComparable,
  type OfertaDescartada,
  type OfertaRecomendada,
  type PerfilCliente,
  type ResultadoCalidad,
  type TablaComparador,
  type ValoresPresupuesto,
} from '@central/module-tarificacion'
import { construirPropuesta, type ModeloPropuesta } from './propuesta-comercial.ts'

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const ISO = /^\d{4}-\d{2}-\d{2}$/

/** «allianz» → «Allianz» (la clave del bot, legible). */
export function nombreCompania(clave: string): string {
  const s = clave.trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Compañía'
}

export type TrabajoParaPropuesta = {
  trabajoId: string
  compania: string
  estado: string
  creadoEn: string
  tarificacionId: string | null
  respuesta: unknown
}

/** Lo extraído del PDF del proyecto de una tarificación (`tarificador_coberturas_presupuesto`). */
export type PresupuestoExtraido = { tarificacionId: string; valores: ValoresPresupuesto }

export type EntradaPropuesta = {
  ramo: string
  /** Solo el nombre (o razón social). `null` = la ficha no tiene nombre legible. */
  cliente: string | null
  referencia: string | null
  /** Formulario guardado en la oportunidad (`info_riesgo.presupuestosCompanias.formulario`). `null` = no hay. */
  formulario: Record<string, unknown> | null
  trabajos: readonly TrabajoParaPropuesta[]
  presupuestos: readonly PresupuestoExtraido[]
  fichas: readonly FichaComparable[]
  /** Fecha de hoy ISO `AAAA-MM-DD` (reloj de fuera: determinista). */
  hoy: string
  fecha: Date
}

type OfertaCruda = {
  id: string
  compania: string
  producto: string
  primaAnualEur: number
  primaNetaEur: number | null
  desglose: ControlOferta['desglose']
  validaHasta: string | null
  /** Esta oferta es la del PDF del proyecto (la que tiene valores extraídos). */
  esProyecto: boolean
  tarificacionId: string
}

const periodo = (v: unknown) => {
  const o = obj(v)
  return o ? { primaNetaEur: num(o.primaNetaEur), impuestosEur: num(o.impuestosEur), primaTotalEur: num(o.primaTotalEur) } : null
}

/** El trabajo `ok` más reciente de cada compañía (los demás estados no aportan ofertas). */
export function trabajosVigentes(trabajos: readonly TrabajoParaPropuesta[]): TrabajoParaPropuesta[] {
  const orden = [...trabajos].filter((t) => t.estado === 'ok' && t.tarificacionId !== null).sort((a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn))
  const vistas = new Set<string>()
  const out: TrabajoParaPropuesta[] = []
  for (const t of orden) {
    const k = t.compania.trim().toLowerCase()
    if (vistas.has(k)) continue
    vistas.add(k)
    out.push(t)
  }
  return out
}

/** `respuesta.ofertas[]` (canal rpa) de los trabajos vigentes → ofertas con precio anual válido. Sin precio no es oferta. */
export function ofertasDeTrabajos(trabajos: readonly TrabajoParaPropuesta[]): OfertaCruda[] {
  const out: OfertaCruda[] = []
  for (const t of trabajosVigentes(trabajos)) {
    const r = obj(t.respuesta)
    const crudas = Array.isArray(r?.ofertas) ? (r?.ofertas as unknown[]) : []
    const proyectoDoc = txt(r?.proyectoDocumentoId)
    const validas = crudas.map((c, i) => ({ o: obj(c), i })).filter((x): x is { o: Record<string, unknown>; i: number } => x.o !== null)
    validas.forEach(({ o, i }) => {
      const prima = num(o.primaAnualEur)
      if (prima === null || prima <= 0) return
      const dg = obj(o.desglose)
      const anual = periodo(dg?.anual)
      const sucesivos = periodo(dg?.sucesivos)
      const esProyecto = proyectoDoc !== null ? o.documentoId === proyectoDoc : validas.length === 1
      out.push({
        id: `${t.tarificacionId}:${i}`,
        compania: txt(o.compania) ?? t.compania,
        producto: txt(o.producto) ?? 'Producto',
        primaAnualEur: prima,
        primaNetaEur: num(o.primaNetaEur),
        desglose: anual && sucesivos ? { anual, sucesivos } : null,
        validaHasta: typeof o.validaHasta === 'string' && ISO.test(o.validaHasta) ? o.validaHasta : null,
        esProyecto,
        tarificacionId: t.tarificacionId as string,
      })
    })
  }
  return out
}

const VACIO: ValoresPresupuesto = { primaTotalEur: null, primaNetaEur: null, capitales: {}, franquiciaGeneral: null }

/** La oferta como la compara `compararOfertas`: precio SIEMPRE el anual del portal; capitales solo si salieron del PDF de ESA oferta. */
export function ofertaComparable(o: OfertaCruda, ramo: string, presupuestos: readonly PresupuestoExtraido[]): OfertaComparable {
  const extra = o.esProyecto ? presupuestos.find((p) => p.tarificacionId === o.tarificacionId)?.valores ?? VACIO : VACIO
  return {
    id: o.id,
    compania: nombreCompania(o.compania),
    ramo,
    producto: o.producto,
    version: null,
    presupuesto: {
      ...extra,
      primaTotalEur: { valor: o.primaAnualEur, cita: 'Portal de la compañía (prima anual)', pagina: null },
      primaNetaEur: o.primaNetaEur !== null ? { valor: o.primaNetaEur, cita: 'Portal de la compañía', pagina: null } : extra.primaNetaEur,
    },
  }
}

const afirma = (v: unknown): boolean | null => {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase()
    if (['si', 'sí', 'true', '1'].includes(t)) return true
    if (['no', 'false', '0'].includes(t)) return false
  }
  return null
}
const numero = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Perfil del recomendador y capitales pedidos, desde el formulario guardado. Lo que no consta no suma nada. */
export function perfilDeFormulario(ramo: string, f: Record<string, unknown> | null, hoy: string): { perfil: PerfilCliente; capitalesPedidos: Record<string, number>; fechaEfecto: string | null } {
  const perfil: PerfilCliente = {}
  const capitalesPedidos: Record<string, number> = {}
  const form = f ?? {}
  const fecha = txt(form.fechaEfecto)
  const fechaEfecto = fecha && ISO.test(fecha) ? fecha : null
  if (ramo === 'comunidades') {
    const asc = afirma(form.ascensor)
    const pis = afirma(form.piscina)
    if (asc) perfil.ascensor = true
    if (pis) perfil.piscina = true
    const anio = numero(form.anioConstruccion)
    const anioHoy = Number(hoy.slice(0, 4))
    if (anio !== null && anio > 1500 && Number.isFinite(anioHoy) && anio <= anioHoy) perfil.antiguedadAnios = anioHoy - anio
    const cont = numero(form.capitalContinente)
    const cnt = numero(form.capitalContenido)
    if (cont !== null && cont > 0) capitalesPedidos.continente = cont
    if (cnt !== null && cnt > 0) capitalesPedidos.contenido = cnt
  }
  if (Object.keys(capitalesPedidos).length) perfil.capitalesPedidos = { ...capitalesPedidos }
  return { perfil, capitalesPedidos, fechaEfecto }
}

export type OfertaEvaluada = {
  ofertaId: string
  compania: string
  producto: string
  primaAnualEur: number
  /** `false` = tiene errores de calidad: sale con aviso y NO se recomienda. */
  recomendable: boolean
  calidad: ResultadoCalidad
}

export type ResultadoPropuesta =
  | { estado: 'sin_ofertas'; avisos: string[] }
  | {
      estado: 'ok'
      ramo: string
      cliente: string
      referencia: string | null
      fecha: string
      ofertas: OfertaEvaluada[]
      ranking: OfertaRecomendada[]
      descartadas: OfertaDescartada[]
      recomendada: { ofertaId: string; compania: string; producto: string; puntos: number; motivos: string[]; reservas: string[]; empate: boolean } | null
      avisos: string[]
      /** Para el PDF; no sale en el JSON. */
      modelo: ModeloPropuesta
    }

/** Texto en una línea de las incidencias de una oferta. */
const lineaIncidencias = (c: ResultadoCalidad): string => c.errores.map((e) => e.mensaje).join(' ')

export function ensamblarPropuesta(e: EntradaPropuesta): ResultadoPropuesta {
  const crudas = ofertasDeTrabajos(e.trabajos)
  if (crudas.length === 0) {
    return { estado: 'sin_ofertas', avisos: ['No hay ninguna oferta con precio anual: pide presupuestos a las compañías desde la oportunidad.'] }
  }
  const comparables = crudas.map((o) => ofertaComparable(o, e.ramo, e.presupuestos))
  const tabla: TablaComparador = compararOfertas(e.fichas, comparables)
  const { perfil, capitalesPedidos, fechaEfecto } = perfilDeFormulario(e.ramo, e.formulario, e.hoy)

  const evaluadas: OfertaEvaluada[] = crudas.map((o, i) => {
    const col = tabla.columnas.find((c) => c.ofertaId === o.id)
    const capitales: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(comparables[i].presupuesto.capitales)) capitales[k] = v.valor
    const control: ControlOferta = {
      primaAnualEur: o.primaAnualEur,
      primaNetaEur: o.primaNetaEur,
      desglose: o.desglose,
      validaHasta: o.validaHasta,
      capitales,
      fichaEstado: col?.fichaEstado ?? null,
      datosUsados: {},
    }
    // `datos: {}`: el worker no devuelve qué datos usó (no consta) → no se afirma ni se compara.
    const calidad = controlarCalidad(control, { fechaEfecto, capitalesPedidos, datos: {} }, e.hoy)
    return { ofertaId: o.id, compania: nombreCompania(o.compania), producto: o.producto, primaAnualEur: o.primaAnualEur, recomendable: calidad.ok, calidad }
  })

  const avisos: string[] = []
  for (const ev of evaluadas.filter((x) => !x.recomendable)) {
    avisos.push(`La oferta de ${ev.compania} (${ev.producto}) no supera el control de calidad y no se recomienda: ${lineaIncidencias(ev.calidad)}`)
  }

  const recomendables = comparables.filter((c) => evaluadas.find((x) => x.ofertaId === c.id)?.recomendable)
  let ranking: OfertaRecomendada[] = []
  let descartadas: OfertaDescartada[] = []
  if (recomendables.length > 0) {
    const tablaRec = compararOfertas(e.fichas, recomendables)
    const r = recomendar(tablaRec, perfil, { preciosAnualesEur: Object.fromEntries(crudas.map((o) => [o.id, o.primaAnualEur])) })
    ranking = r.ranking
    descartadas = r.descartadas
    avisos.push(...r.avisos)
  } else {
    avisos.push('Ninguna oferta supera el control de calidad: no hay recomendación.')
  }
  const top = ranking[0] ?? null

  const modelo = construirPropuesta({
    referencia: e.referencia,
    cliente: e.cliente ?? '',
    ramo: e.ramo,
    fecha: e.fecha,
    tabla,
    recomendacion: top ? { compania: top.compania, motivos: top.motivos } : null,
  })
  // Lo que se avisa en el JSON se avisa también en el documento (el cliente ve la oferta con su advertencia).
  for (const ev of evaluadas.filter((x) => !x.recomendable)) {
    modelo.avisos.push(`La oferta de ${ev.compania} no ha superado nuestra revisión y no la recomendamos: ${lineaIncidencias(ev.calidad)}`)
  }
  if (top && top.reservas.length) modelo.avisos.push(...top.reservas.map((r) => `${top.compania}: ${r}`))

  return {
    estado: 'ok',
    ramo: e.ramo,
    cliente: modelo.cliente,
    referencia: e.referencia,
    fecha: e.hoy,
    ofertas: evaluadas,
    ranking,
    descartadas,
    recomendada: top ? { ofertaId: top.ofertaId, compania: top.compania, producto: top.producto, puntos: top.puntos, motivos: top.motivos, reservas: top.reservas, empate: top.empate } : null,
    avisos: [...avisos, ...tabla.avisos],
    modelo,
  }
}

/** El JSON de la ruta: sin el modelo del PDF. Cliente: solo nombre y referencia. */
export function jsonPropuesta(r: Extract<ResultadoPropuesta, { estado: 'ok' }>): Omit<typeof r, 'modelo'> {
  const { modelo: _modelo, ...resto } = r
  return resto
}
