// Mapfre wmediadores · «Patrimoniales → Tarificación y emisión rápida» HOGAR — BORRADOR (15/10/2026). APAGADO y SIN REGISTRAR:
// `MAPFRE_HOGAR_ACTIVO = false` y `adapters/index.ts` NO lo importa. Fila de integración: 2026-10-15b_tarificador_mapfre_hogar.sql
// (activo = false). Ver docs/tarificador/CONOCIMIENTO-PORTALES.md (Mapfre).
//
// Fuente: UNA grabación de Alberto (Chrome Recorder, 79 pasos, saneada) + el PDF del presupuesto que genera. Estructura vista:
//   login → «Nueva producción» → «Patrimoniales» → «Tarificación y emisión rápida» (MISMA pestaña: todos los pasos son del
//   marco principal) → código postal → (clics sin nombre: `#vc` y una opción de radio) → «Ref. catastral» → «BUSCAR REF.
//   CATASTRALES» (diálogo con CP, vía, número, piso, puerta → «Buscar» → fila → «Sumar al Desglose» → «Seleccionar y finalizar»)
//   → panel `#protecciones-panel` (dos clics sobre la primera fila, sin etiqueta) → tomador (`#numDocumento`,
//   `#fechanacimientoTomador`, `#nombre`, `#primerApellido`, `#segundoApellido`) → «SIGUIENTE» → pantalla de precio → «imprimir» →
//   «IMPRIMIR PDF» (el bot NO hace estos dos últimos: decisión de Alberto, precio y garantías desde la pantalla).
//
// DISEÑO (Alberto, 15/10/2026): NO se usa el buscador de Mapfre por dirección. La referencia catastral la resuelve ASEGURA ANTES
// (@central/core-catastro) y viaja en `inmueble.referenciaCatastral` del riesgo; el bot elige «Ref. catastral» y la teclea. Sin
// referencia en el riesgo → `datos` (requiere_humano), sin buscador por dirección en esta versión.
//
// 🚨 SEGURIDAD. Pulsar SOLO con `ctx.pulsar()` / `ctx.pulsarEnlaceEntrada()` (guard de emisión). Este fichero no nombra
// imprimir, emitir, contratar, grabar ni «IMPRIMIR PDF»; tras LEER la prima PARA. DNI, fecha de nacimiento, nombre, apellidos y
// referencia catastral solo se escriben en su campo: nunca en logs, mensajes, atascos ni resultado.
//
// HUECOS (→ `ErrorMapaIncompleto` con `pideInventarioDom`; no se inventa nada):
//   1. el CAMPO donde se teclea la referencia catastral (la grabación solo trae el buscador por dirección) → `SEL_REFERENCIA_CATASTRAL`;
//   2. los dos clics previos sin etiqueta (`#vc`, radio) y qué son las «protecciones» (`#protecciones-panel`, 2 clics) → `PROTECCIONES_MAPEADAS`;
//   3. el selector de la pantalla de PRECIO: se intenta el texto visible con el formato del PDF (`primasDesdeTextoPrecio`); si no casa → atasco;
//   4. las garantías en pantalla (el PDF trae ~14 filas por modalidad; la pantalla no está grabada) → `coberturas: []` + aviso;
//   5. nombre y apellidos del tomador NO están en `FormularioHogar`: solo se escriben si vienen en `datosTomador` y el portal no los autorrellena.

import type { Locator, Page } from 'playwright'
import {
  fechaDdMmAaaaDeIso,
  importeEs,
  redactarDatosPersonales,
  type CandidatoVersion,
  type FormularioHogar,
  type OfertaNormalizada,
  type ResultadoAdaptador,
} from '@central/module-tarificacion'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { campoConRespaldo, claveCampo, registrarAtasco, type ContextoFormador } from '../../formador.ts'
import { comprobarCampo, ErrorEleccionVersion } from '../allianz/auto.ts'
import { compararFechaEs, esperarCampoAsentado, esperarEditable, ErrorMapaIncompleto as ErrorMapaAuto } from './auto.ts'
import { ENLACE_TARIFICACION_RAPIDA, enTodosLosMarcos, localizar, pulsablesExactos } from './entrada.ts'
import { login } from './login.ts'

/** Flag del borrador. APAGADO y el adaptador NO está en `adapters/index.ts` (lo vigila test/mapfre-hogar.test.ts). */
export const MAPFRE_HOGAR_ACTIVO = false

export const ADAPTADOR = 'mapfre/hogar'

/** Hueco declarado (mismo contrato que el de auto: el runner adjunta el inventario de estructura con `pideInventarioDom`). */
export class ErrorMapaIncompleto extends ErrorMapaAuto {
  constructor(que: string, pideInventarioDom = true) {
    super(que, pideInventarioDom)
    this.message = `${ADAPTADOR}: mapa incompleto: faltan ${que}`
  }
}

// ───────────────────────── mapa VISTO (grabación 15/10/2026) ─────────────────────────

export const OPCION_PATRIMONIALES = 'Patrimoniales'
export const PESTANA_NUEVA_PRODUCCION = 'Nueva producción'
export const OPCION_REF_CATASTRAL = 'Ref. catastral'
export const BOTON_SIGUIENTE = 'SIGUIENTE'

/** Selectores de la grabación. Los `#id` son estables; el del CP es estructural (frágil) y por eso va con `campoConRespaldo`. */
export const SEL_HOGAR = {
  codigoPostal: 'div.ng-pristine > div:nth-of-type(5) div:nth-of-type(2) > input',
  /** `null` = HUECO: la grabación no muestra el campo donde se teclea la referencia catastral. */
  referenciaCatastral: null as string | null,
  panelProtecciones: '#protecciones-panel',
  documento: '#numDocumento',
  fechaNacimiento: '#fechanacimientoTomador',
  nombre: '#nombre',
  apellido1: '#primerApellido',
  apellido2: '#segundoApellido',
} as const

/** ¿Se sabe qué protecciones hay que marcar (y los dos clics previos `#vc`/radio)? NO: la grabación no tiene etiquetas. */
export const PROTECCIONES_MAPEADAS = false

/** Modalidades del presupuesto visto en el PDF (nombres de producto; el orden es el de las columnas). */
export const MODALIDADES_HOGAR = ['HOGAR TÚ ELIGES', 'HOGAR FAMILIAR', 'HOGAR PLATINO'] as const

// ───────────────────────── referencia catastral (pura) ─────────────────────────

/** Referencia del riesgo normalizada (mayúsculas, sin espacios/guiones) si es de 20 caracteres (bien); si no, `null`. PURA. */
export function referenciaCatastralDe(f: FormularioHogar): string | null {
  const rc = (f.inmueble.referenciaCatastral ?? '').replace(/[\s-]/g, '').toUpperCase()
  return /^[0-9A-Z]{14}[0-9A-Z]{4}[A-Z]{2}$/.test(rc) ? rc : null
}

/** Lo que el riesgo tiene que traer ANTES de abrir el portal. Sin referencia de 20 → `datos`; no hay buscador por dirección. PURA (lanza). */
export function exigirDatosHogar(f: FormularioHogar): string {
  if (f?.ramo !== 'hogar') throw new ErrorTarificador('datos', `${ADAPTADOR}: el formulario no es de hogar`)
  if (!/^\d{5}$/.test(f.inmueble.codigoPostal)) throw new ErrorTarificador('datos', `${ADAPTADOR}: el código postal tiene que tener 5 dígitos`)
  const rc = referenciaCatastralDe(f)
  if (rc === null) {
    throw new ErrorTarificador('datos', `${ADAPTADOR}: el riesgo no trae la referencia catastral de 20 caracteres (Mapfre Hogar se tarifica con ella; esta versión no usa el buscador por dirección): resuélvela con Catastro y vuelve a encolar`)
  }
  return rc
}

// ───────────────────────── elección de fila de catastro (pura; sin buscador, para una versión futura) ─────────────────────────

export type FilaCatastroMapfre = { descripcion: string }
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const normPiso = (t: string | null | undefined) => sinTildes(t ?? '').replace(/^0+(?=\d)/, '')
const normPuerta = (t: string | null | undefined) => {
  const k = sinTildes(t ?? '')
  if (/^(IZ|IZQ|IZDA|IZQDA|IZQUIERDA)\.?$/.test(k)) return 'IZ'
  if (/^(DR|DER|DCHA|DRCHA|DERECHA)\.?$/.test(k)) return 'DR'
  return k.replace(/^0+(?=\d)/, '')
}

/** «ES:1 PL:01 PT:IZ» de la descripción de una fila de resultados → escalera, planta y puerta. PURA. */
export function partesFilaCatastro(descripcion: string): { escalera: string | null; planta: string | null; puerta: string | null } {
  const t = sinTildes(descripcion)
  const g = (c: string) => new RegExp(`\\b${c}:\\s*(\\S+)`).exec(t)?.[1] ?? null
  return { escalera: g('ES'), planta: g('PL'), puerta: g('PT') }
}

/**
 * Qué fila de resultados de catastro elegir. Una sola → 0. Varias → la ÚNICA que casa con escalera/planta/puerta del riesgo
 * (los que consten); si no hay una sola → `ErrorEleccionVersion` con las descripciones (requiere_humano). 0 filas → `datos`. PURA.
 */
export function indiceFilaCatastro(filas: readonly FilaCatastroMapfre[], inmueble: Pick<FormularioHogar['inmueble'], 'escalera' | 'planta' | 'puerta'>): number {
  if (filas.length === 0) throw new ErrorTarificador('datos', `${ADAPTADOR}: el catastro de Mapfre no devuelve ninguna vivienda para esos datos`)
  if (filas.length === 1) return 0
  const quiere = { escalera: normPiso(inmueble.escalera), planta: normPiso(inmueble.planta), puerta: normPuerta(inmueble.puerta) }
  const coincide = (d: string) => {
    const p = partesFilaCatastro(d)
    return (quiere.escalera === '' || normPiso(p.escalera) === quiere.escalera) && (quiere.planta === '' || normPiso(p.planta) === quiere.planta) && (quiere.puerta === '' || normPuerta(p.puerta) === quiere.puerta)
  }
  const ix = filas.flatMap((f, i) => (coincide(f.descripcion) ? [i] : []))
  if (ix.length === 1 && (quiere.escalera !== '' || quiere.planta !== '' || quiere.puerta !== '')) return ix[0]!
  const opciones: CandidatoVersion[] = filas.map((f) => ({ etiqueta: f.descripcion.replace(/\s+/g, ' ').trim(), codigo: null }))
  throw new ErrorEleccionVersion(opciones)
}

// ───────────────────────── lector de primas (puro) ─────────────────────────

/** «275,80 €» / «1.234,56 €» → número. Fail-closed: sin € , 3 decimales o ≤ 0 → `null`. PURA. */
export function importeDePrimaHogar(texto: string | null | undefined): number | null {
  if (typeof texto !== 'string') return null
  const m = /^\s*(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})\s*€\s*$/.exec(texto)
  if (!m) return null
  const n = importeEs(m[1]!)
  return n !== null && n > 0 ? n : null
}

export type PrimaHogarMapfre = { modalidad: string; primaAnualEur: number; primerReciboEur: number | null }

const IMPORTE = '\\d{1,3}(?:\\.\\d{3})*,\\d{2}\\s*€|\\d+,\\d{2}\\s*€'
const aPlano = (t: string) => sinTildes(t)

/**
 * Primas ANUALES del cuadro «PRIMA DEL SEGURO» (formato del PDF: cabecera con las modalidades; bloque «ANUAL» con «Prima total» y
 * «Primer recibo», un importe por modalidad). Solo el bloque anual: semestral/trimestral se ignoran. Fail-closed: si el nº de
 * importes no es el de modalidades de la cabecera, o falta «ANUAL»/«Prima total» → `[]` (el llamante hace atasco). PURA.
 */
export function primasDesdeTextoPrecio(texto: string): PrimaHogarMapfre[] {
  const t = aPlano(texto)
  const pos = MODALIDADES_HOGAR.map((m) => ({ m, i: t.indexOf(aPlano(m)) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i)
  if (pos.length === 0) return []
  const desde = t.slice(pos[0]!.i)
  const bloque = /ANUAL\b([\s\S]*?)(?:SEMESTRAL|TRIMESTRAL|MENSUAL|$)/.exec(desde)?.[1]
  if (!bloque) return []
  const n = pos.length
  const fila = (etq: string): number[] | null => {
    const m = new RegExp(`${etq}\\s+((?:(?:${IMPORTE})\\s*){${n}})(?!\\s*(?:${IMPORTE}))`).exec(bloque)
    if (!m) return null
    const xs = (m[1]!.match(new RegExp(IMPORTE, 'g')) ?? []).map((x) => importeDePrimaHogar(x))
    return xs.length === n && xs.every((x): x is number => x !== null) ? xs : null
  }
  const total = fila('PRIMA\\s+TOTAL')
  if (!total) return []
  const recibo = fila('PRIMER\\s+RECIBO')
  return pos.map((p, k) => ({ modalidad: p.m, primaAnualEur: total[k]!, primerReciboEur: recibo ? recibo[k]! : null }))
}

/** Primas → ofertas normalizadas (una por modalidad). Garantías sin leer de la pantalla: `coberturas: []` + aviso. PURA. */
export function ofertasDesdePrimasHogar(primas: readonly PrimaHogarMapfre[]): OfertaNormalizada[] {
  return primas.map((p) => ({
    compania: 'mapfre',
    producto: `Hogar · ${p.modalidad}`,
    primaAnualEur: p.primaAnualEur,
    primaNetaEur: null,
    fraccionamiento: 'anual',
    importeReciboEur: p.primerReciboEur ?? p.primaAnualEur,
    coberturas: [],
    franquicias: [],
    validaHasta: null,
    referenciaPortal: null,
    pdf: null,
    desglose: null,
    avisos: ['Prima TOTAL anual de la modalidad leída de la pantalla de precio; sin desglose neta/impuestos.', 'Garantías y capitales de la pantalla sin mapear: no se informan (el bot no descarga el PDF del presupuesto).'],
  }))
}

// ───────────────────────── flujo ─────────────────────────

const ESPERA_MENU_MS = 15_000
const ESPERA_PRECIO_MS = 45_000

async function hueco(page: Page | null, formador: ContextoFormador | undefined, etiqueta: string, que: string): Promise<never> {
  await registrarAtasco(page, formador, { clave: claveCampo(`mapfre hogar ${etiqueta}`), tipo: 'campo', etiqueta, descripcion: `Mapfre Hogar: ${que}. El robot no pulsa ni supone nada aquí.` }).catch(() => undefined)
  throw new ErrorMapaIncompleto(que, true)
}

/** login hecho → «Nueva producción» → «Patrimoniales» → «Tarificación y emisión rápida» → formulario (CP visible). Misma pestaña. */
export async function abrirTarificacionRapidaHogar(page: Page, ctx: Pick<ContextoPortal, 'pulsar' | 'pausa' | 'pulsarEnlaceEntrada' | 'formador'>): Promise<void> {
  if (!ctx.pulsarEnlaceEntrada) throw new ErrorMapaIncompleto('la función guardada del enlace de entrada en el contexto del runner')
  await ctx.pulsar(await localizar(page, ['tab'], PESTANA_NUEVA_PRODUCCION, 'pestaña', ESPERA_MENU_MS))
  await ctx.pausa()
  await ctx.pulsar(await localizar(page, ['menuitem', 'link', 'button'], OPCION_PATRIMONIALES, 'opción del desplegable', ESPERA_MENU_MS))
  await ctx.pausa()
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
  // El enlace se acepta SOLO con exactamente UNA coincidencia visible (en la grabación el 1.º de la página de Patrimoniales).
  const hits = await enTodosLosMarcos(page, (f) => pulsablesExactos(f, ENLACE_TARIFICACION_RAPIDA), ESPERA_MENU_MS)
  if (hits.length !== 1) throw new ErrorMapaIncompleto(`el enlace «${ENLACE_TARIFICACION_RAPIDA}» de Patrimoniales (${hits.length === 0 ? 'ninguna coincidencia visible' : `${hits.length} coincidencias: hay varias tarjetas y no se elige a ciegas`})`, true)
  await ctx.pulsarEnlaceEntrada(hits[0]!)
  try {
    await page.locator(SEL_HOGAR.codigoPostal).first().waitFor({ state: 'visible', timeout: 30_000 })
  } catch {
    throw new ErrorMapaIncompleto('el formulario de Hogar tras «Tarificación y emisión rápida» (no aparece el campo del código postal; ¿se abrió en pestaña nueva?)', true)
  }
}

/** CP → opción «Ref. catastral» → teclear la referencia. El campo de la referencia es HUECO: se llega hasta la opción y se para con inventario. */
export async function pasoVivienda(page: Page, f: FormularioHogar, rc: string, ctx: Pick<ContextoPortal, 'pulsar' | 'pausa' | 'formador'>): Promise<void> {
  const r = await campoConRespaldo(page, SEL_HOGAR.codigoPostal, { page, formador: ctx.formador, etiqueta: 'Código postal', descripcion: 'Campo «Código postal» de la vivienda en Mapfre Hogar' })
  if (!r) throw new ErrorMapaIncompleto('el campo del código postal de Hogar (no aparece)', true)
  await comprobarCampo(r.campo)
  if (!(await esperarEditable(r.campo))) await hueco(page, ctx.formador, 'Código postal', 'el campo del código postal está deshabilitado')
  await r.campo.fill(f.inmueble.codigoPostal)
  await r.campo.blur().catch(() => undefined)
  await esperarCampoAsentado(page, r.campo)
  await r.confirmar().catch(() => undefined)
  if (!PROTECCIONES_MAPEADAS) {
    await hueco(page, ctx.formador, 'Vivienda', 'los dos clics sin etiqueta tras el CP de la grabación (`#vc` y un selector de opción) y qué son las «protecciones» (`#protecciones-panel`, dos clics sobre su primera fila)')
  }
  const opcion = await localizar(page, [], OPCION_REF_CATASTRAL, 'opción de búsqueda de la vivienda', ESPERA_MENU_MS).catch(() => null)
  if (!opcion) throw new ErrorMapaIncompleto(`la opción «${OPCION_REF_CATASTRAL}» (no aparece tras el CP; puede exigir antes los clics sin etiqueta de la grabación)`, true)
  await ctx.pulsar(opcion)
  await ctx.pausa()
  const sel = SEL_HOGAR.referenciaCatastral
  if (sel === null) await hueco(page, ctx.formador, 'Referencia catastral', 'el campo donde se teclea la referencia catastral (la grabación solo trae el buscador por dirección «BUSCAR REF. CATASTRALES»)')
  const c = page.locator(sel!).first()
  await comprobarCampo(c)
  await c.fill(rc)
  await c.blur().catch(() => undefined)
  await esperarCampoAsentado(page, c)
}

/** Nombre y apellidos del tomador si el riesgo los trae (`datosTomador`, lo pone asegura); no están en `FormularioHogar`. */
type DatosTomadorHogar = { nombre?: string | null; apellido1?: string | null; apellido2?: string | null }
const datosTomadorDe = (f: FormularioHogar): DatosTomadorHogar => (f as FormularioHogar & { datosTomador?: DatosTomadorHogar }).datosTomador ?? {}

/**
 * Tomador: documento → salir del campo (Mapfre puede autorrellenar) → fecha, nombre y apellidos SOLO si el campo sigue vacío.
 * Nombre/apellido1 vacíos y sin dato en el riesgo → `datos`. Nada se pisa; la fecha se verifica (inversión día/mes → hueco).
 */
export async function pasoTomador(page: Page, f: FormularioHogar, ctx: Pick<ContextoPortal, 'formador'>): Promise<void> {
  const doc = await campoConRespaldo(page, SEL_HOGAR.documento, { page, formador: ctx.formador, etiqueta: 'Nº de documento', descripcion: 'Campo «Nº de documento» del TOMADOR en Mapfre Hogar' })
  if (!doc) throw new ErrorMapaIncompleto('el campo «Nº de documento» del tomador (no aparece)', true)
  await comprobarCampo(doc.campo)
  await doc.campo.fill(f.tomador.documentoIdentidad)
  await doc.campo.blur().catch(() => undefined)
  await esperarCampoAsentado(page, doc.campo)
  const d = datosTomadorDe(f)
  const campos: Array<{ sel: string; etiqueta: string; valor: string | null; obligatorio: boolean; fecha?: boolean }> = [
    { sel: SEL_HOGAR.fechaNacimiento, etiqueta: 'Fecha de nacimiento', valor: fechaDdMmAaaaDeIso(f.tomador.fechaNacimiento), obligatorio: true, fecha: true },
    { sel: SEL_HOGAR.nombre, etiqueta: 'Nombre', valor: d.nombre?.trim() || null, obligatorio: true },
    { sel: SEL_HOGAR.apellido1, etiqueta: 'Primer apellido', valor: d.apellido1?.trim() || null, obligatorio: true },
    { sel: SEL_HOGAR.apellido2, etiqueta: 'Segundo apellido', valor: d.apellido2?.trim() || null, obligatorio: false },
  ]
  for (const c of campos) {
    const r = await campoConRespaldo(page, c.sel, { page, formador: ctx.formador, etiqueta: c.etiqueta, descripcion: `Campo «${c.etiqueta}» del TOMADOR en Mapfre Hogar` })
    if (!r) throw new ErrorMapaIncompleto(`el campo «${c.etiqueta}» del tomador (${c.sel}; no aparece)`, true)
    if ((await r.campo.inputValue().catch(() => '')).trim() !== '') continue // autorrellenado por Mapfre: no se pisa
    if (c.valor === null) {
      if (!c.obligatorio) continue
      throw new ErrorTarificador('datos', `${ADAPTADOR}: Mapfre no conoce al tomador y el riesgo no trae «${c.etiqueta}» (no se inventa)`)
    }
    await comprobarCampo(r.campo)
    if (!(await esperarEditable(r.campo))) await hueco(page, ctx.formador, c.etiqueta, `el campo «${c.etiqueta}» del tomador está deshabilitado`)
    await r.campo.fill(c.valor)
    await r.campo.blur().catch(() => undefined)
    const leido = await r.campo.inputValue()
    if (c.fecha) {
      const cmp = compararFechaEs(leido, c.valor)
      if (cmp !== 'ok') await hueco(page, ctx.formador, c.etiqueta, `el portal dejó «${c.etiqueta}» ${cmp === 'invertida' ? 'con día y mes cambiados' : 'distinta de la tecleada'} (dd/mm/aaaa)`)
    } else if (leido.trim().toUpperCase() !== c.valor.trim().toUpperCase()) {
      throw new ErrorTarificador('portal', `${ADAPTADOR}: el portal no dejó fijado el campo «${c.etiqueta}»`)
    }
    await r.confirmar().catch(() => undefined)
  }
}

/** «SIGUIENTE» (uno solo, visible) por el guard. Calcula el precio. Nunca imprimir/emitir. */
export async function pulsarSiguiente(page: Page, ctx: Pick<ContextoPortal, 'pulsar' | 'formador'>): Promise<void> {
  const hits = await enTodosLosMarcos(page, (fr) => pulsablesExactos(fr, BOTON_SIGUIENTE), 5_000)
  if (hits.length !== 1) await hueco(page, ctx.formador, 'Siguiente', `el botón «${BOTON_SIGUIENTE}» (${hits.length} coincidencias visibles; hace falta exactamente una)`)
  const b: Locator = hits[0]!
  if (!(await b.isEnabled().catch(() => false))) await hueco(page, ctx.formador, 'Siguiente', `el botón «${BOTON_SIGUIENTE}» sigue deshabilitado (algún dato obligatorio sin cubrir)`)
  await ctx.pulsar(b)
}

/** Pantalla de precio: texto visible con el formato del PDF, estable entre dos lecturas. Sin primas legibles → atasco con texto REDACTADO. Solo lectura. */
export async function leerPrecioHogar(page: Page, ctx: Pick<ContextoPortal, 'formador'>, esperaMs = ESPERA_PRECIO_MS): Promise<PrimaHogarMapfre[]> {
  const hasta = Date.now() + esperaMs
  let previo: string | null = null
  for (;;) {
    const texto = await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '')
    const primas = primasDesdeTextoPrecio(texto)
    const firma = primas.length ? JSON.stringify(primas) : null
    if (firma !== null && firma === previo) return primas
    previo = firma
    if (Date.now() >= hasta) {
      const visto = redactarDatosPersonales(texto.replace(/\s+/g, ' ').trim()).slice(0, 240)
      await hueco(page, ctx.formador, 'Precio', `la prima anual de la pantalla de precio (ninguna fila «Prima total» con una prima por modalidad legible en ${Math.round(esperaMs / 1000)} s; el selector de esa pantalla no está grabado; texto visible: «${visto || '(vacío)'}»)`)
    }
    await page.waitForTimeout(400)
  }
}

/** Adaptador BORRADOR (no registrado, flag apagado). Tarifica y PARA al leer el precio: no imprime, no descarga el PDF, no emite. */
export const mapfreHogar = {
  compania: 'mapfre',
  ramo: 'hogar',
  credencial: 'MAPFRE_WMEDIADORES',
  version: '0.1.0',
  async tarificar(page: Page, f: FormularioHogar, ctx: ContextoPortal): Promise<ResultadoAdaptador> {
    if (!MAPFRE_HOGAR_ACTIVO) throw new ErrorTarificador('datos', `${ADAPTADOR}: adaptador en borrador y apagado (MAPFRE_HOGAR_ACTIVO = false)`)
    const rc = exigirDatosHogar(f)
    await login(page, ctx)
    await ctx.trasLogin()
    await abrirTarificacionRapidaHogar(page, ctx)
    await pasoVivienda(page, f, rc, ctx)
    await pasoTomador(page, f, ctx)
    await pulsarSiguiente(page, ctx)
    const primas = await leerPrecioHogar(page, ctx)
    ctx.log('precio leido')
    return { ofertas: ofertasDesdePrimasHogar(primas) }
  },
} as const
