// Mapfre wmediadores · «Patrimoniales → Tarificación y emisión rápida» HOGAR. APAGADO por defecto:
// `MAPFRE_HOGAR_ACTIVO` (env `MAPFRE_HOGAR_ACTIVO=true` la enciende; sin env = false) y `adapters/index.ts` lo registra SOLO bajo ese flag (21/10/2026). Fila de integración:
// 2026-10-15b_tarificador_mapfre_hogar.sql (activo = false). Además asegura solo lo encola con el interruptor
// `TARIFICADOR_HOGAR_COMPANIAS_EXTRA=mapfre` (y entonces inyecta DNI, nacimiento, nombre y apellidos de la ficha).
// Ver docs/tarificador/CONOCIMIENTO-PORTALES.md (Mapfre).
//
// v0.3.0 (01/11/2026) — LISTO PARA LA PRIMERA EJECUCIÓN REAL HASTA LEER EL PRECIO. La exploración IA mapfre:patrimoniales:hogar
// (9a1ced53) mostró la pantalla «Datos de riesgo - Hogar» (AngularJS, controlador `drn`): la vivienda se tarifica POR CÓDIGO POSTAL
// (opcion `#cpOpcion`, ya marcado de serie) + m² (`#vc`), SIN referencia catastral (el opcion «Ref. catastral vivienda» y su buscador
// quedan sin usar). Campos: `fechaEfecto` (el portal propone la de hoy: no se toca), `input[name=cp]`, `#vc`, desplegables-botón
// `#TipoVivienda`/`#Planta`/`#tc`, opcions `usoVivienda` (#habitual/#temporal), `regimen` (#propiedad/#propiedadAlquiler/
// #inquilinoAlquiler), `calidad` (#Media/#Alta), `#anoConstruccion`, `#anoUltimaReforma`, `#NumeroHabitaciones`, `#NumeroBanos`,
// tomador (`#numDocumento`, `#fechanacimientoTomador`, `input[name=cpTomador]`, `#nombre`, `#primerApellido`, `#segundoApellido`) y
// «SIGUIENTE» (`drn.accederModalidades()`), que lleva a la pantalla de MODALIDADES/precio (selector NO grabado: lectura robusta por texto
// y, si no casa, el error del trabajo dice qué vio: títulos y botones, sin datos personales).
//
// SUPUESTOS (el precio sale ESTIMADO; cada uno viaja en `avisos` de la oferta): habitaciones y baños por m² (`habitacionesYBanosPorM2`),
// calidad «Media», tipo de construcción y fecha de efecto = los de serie del portal, planta «Intermedia» salvo planta baja, CP del
// tomador = CP de la vivienda, uso secundaria → «Temporal», sin medidas de protección (el panel no se toca: nunca se marca «No» por
// no saberlo). Valor total/primer riesgo y capitales: los de serie del portal.
// SIN SUPUESTO (→ `datos`): uso alquiler/turístico, construcción con madera (no se sabe mapear «Tipo de construcción»), tipo/planta
// sin opción reconocible en el desplegable (→ hueco con las OPCIONES visibles, que no son datos personales).
//
// MODO GRABACIÓN: con el flag encendido, cada hueco (`hueco()` → atasco + `ErrorMapaIncompleto` con `pideInventarioDom`) PARA y el
// runner adjunta el inventario de estructura de todas las pestañas/marcos: esa es la grabación que cierra cada TODO(grabación).
//
// 🚨 SEGURIDAD. Pulsar SOLO con `ctx.pulsar()` / `ctx.pulsarEnlaceEntrada()` (guard de emisión). Este fichero no nombra
// imprimir, emitir, contratar, grabar ni «IMPRIMIR PDF»; tras LEER la prima PARA. DNI, fecha de nacimiento, nombre, apellidos y
// referencia catastral solo se escriben en su campo: nunca en logs, mensajes, atascos ni resultado.

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
import { compararFechaEs, esperarCampoAsentado, esperarEditable, importeDePrimaTotal, ErrorMapaIncompleto as ErrorMapaAuto } from './auto.ts'
import { cerrarAvisosModales } from './avisos.ts'
import { ENLACE_TARIFICACION_RAPIDA, enTodosLosMarcos, localizar, ocultarSecretos, pulsablesExactos, urlSinQuery } from './entrada.ts'
import { login } from './login.ts'

/** Flag: APAGADO salvo env `MAPFRE_HOGAR_ACTIVO=true`; el adaptador solo está en `adapters/index.ts` bajo él (lo vigila test/mapfre-hogar.test.ts). */
export const MAPFRE_HOGAR_ACTIVO = process.env.MAPFRE_HOGAR_ACTIVO === 'true'

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

/** Selectores de «Datos de riesgo - Hogar» (inventario de la exploración 9a1ced53). OJO: `#cp` está DUPLICADO (vivienda y tomador): se usa `name`. */
export const SEL_HOGAR = {
  /** `name="cp"` es el de la VIVIENDA; el del tomador es `name="cpTomador"` (los dos llevan `id="cp"`). */
  codigoPostal: 'input[name="cp"]',
  opcionCodigoPostal: 'cpOpcion',
  superficie: '#vc',
  tipoVivienda: 'TipoVivienda',
  planta: 'Planta',
  tipoConstruccion: 'tc',
  anoConstruccion: '#anoConstruccion',
  anoReforma: '#anoUltimaReforma',
  habitaciones: '#NumeroHabitaciones',
  banos: '#NumeroBanos',
  /** Referencia catastral: ya NO se usa (la vivienda se tarifica por CP). Se conserva `null` por el guardián. */
  referenciaCatastral: null as string | null,
  panelProtecciones: '#protecciones-panel',
  documento: '#numDocumento',
  fechaNacimiento: '#fechanacimientoTomador',
  codigoPostalTomador: 'input[name="cpTomador"]',
  nombre: '#nombre',
  apellido1: '#primerApellido',
  apellido2: '#segundoApellido',
} as const

/** Opcions por `id` (vistos). `uso`: Habitual/Temporal; `regimen`: Propiedad/Propiedad en alquiler/Inquilino en alquiler. */
export const OPCION_USO = { habitual: 'habitual', secundaria: 'temporal' } as const
export const OPCION_REGIMEN = { propietario: 'propiedad', inquilino: 'inquilinoAlquiler' } as const
export const OPCION_CALIDAD_MEDIA = 'Media'

/**
 * Las protecciones (`#protecciones-panel`) NO se marcan: el dato es de tres estados y un `null` jamás se escribe como «No». El panel
 * se deja como lo trae el portal y el precio sale ESTIMADO (aviso). TODO(grabación): etiquetas del panel si se quiere afinar.
 */
export const PROTECCIONES_MAPEADAS = false

/** Modalidades del presupuesto visto en el PDF (nombres de producto; el orden es el de las columnas). */
export const MODALIDADES_HOGAR = ['HOGAR TÚ ELIGES', 'HOGAR FAMILIAR', 'HOGAR PLATINO'] as const

// ───────────────────────── referencia catastral (pura) ─────────────────────────

/** Referencia del riesgo normalizada (mayúsculas, sin espacios/guiones) si es de 20 caracteres (bien); si no, `null`. PURA. */
export function referenciaCatastralDe(f: FormularioHogar): string | null {
  const rc = (f.inmueble.referenciaCatastral ?? '').replace(/[\s-]/g, '').toUpperCase()
  return /^[0-9A-Z]{14}[0-9A-Z]{4}[A-Z]{2}$/.test(rc) ? rc : null
}

const sinTildesPlano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Habitaciones y baños por m² (SUPUESTO: no constan en la ficha). Dormitorios ≈ <45:1 · <65:2 · <90:3 · <130:4 · resto 5; baños <60:1 · <110:2 · resto 3. PURA. */
export function habitacionesYBanosPorM2(m2: number): { habitaciones: number; banos: number } {
  const habitaciones = m2 < 45 ? 1 : m2 < 65 ? 2 : m2 < 90 ? 3 : m2 < 130 ? 4 : 5
  const banos = m2 < 60 ? 1 : m2 < 110 ? 2 : 3
  return { habitaciones, banos }
}

/** Textos con los que Mapfre puede nombrar cada tipo (el primero visto en vivo: «Piso o Apartamento»; el resto, por confirmar). */
export const TEXTOS_TIPO_VIVIENDA: Readonly<Record<string, readonly string[]>> = Object.freeze({
  piso: ['Piso o Apartamento'],
  planta_baja: ['Piso o Apartamento'],
  atico: ['Piso o Apartamento'],
  adosada: ['Casa adosada', 'Adosado', 'Vivienda adosada', 'Chalet adosado', 'Unifamiliar adosada'],
  independiente: ['Casa independiente', 'Vivienda independiente', 'Unifamiliar independiente', 'Chalet independiente'],
})
const TEXTOS_PLANTA = { baja: ['Baja', 'Planta baja'], intermedia: ['Intermedia'], ultima: ['Última', 'Ultima', 'Ático', 'Atico'] } as const

export type PlanVivienda = {
  codigoPostal: string
  superficie: number
  anioConstruccion: number
  anioReforma: number | null
  tipoTextos: readonly string[]
  /** `null` = casa (el desplegable de planta puede no existir: si no está, se omite). */
  plantaTextos: readonly string[] | null
  plantaPorDefecto: boolean
  opcionUso: string
  opcionRegimen: string
  habitaciones: number
  banos: number
  /** CLAVES de supuestos (nunca valores personales). */
  supuestos: string[]
}

const esPlantaBaja = (p: string | null) => p !== null && /^(0|bj|b|baja|pb|planta baja)$/i.test(p.trim())

/** El plan de la pantalla «Datos de riesgo - Hogar» a partir del riesgo. Lo que no se puede mapear sin adivinar → `datos`. PURA (lanza). */
export function planVivienda(f: FormularioHogar): PlanVivienda {
  if (f?.ramo !== 'hogar') throw new ErrorTarificador('datos', `${ADAPTADOR}: el formulario no es de hogar`)
  const i = f.inmueble
  if (!/^\d{5}$/.test(i.codigoPostal)) throw new ErrorTarificador('datos', `${ADAPTADOR}: el código postal tiene que tener 5 dígitos`)
  if (!Number.isInteger(i.superficieM2) || i.superficieM2 <= 0) throw new ErrorTarificador('datos', `${ADAPTADOR}: la superficie construida (m²) es obligatoria`)
  if (!Number.isInteger(i.anioConstruccion)) throw new ErrorTarificador('datos', `${ADAPTADOR}: el año de construcción es obligatorio`)
  const h = f.hogar
  if (h.conMadera) throw new ErrorTarificador('datos', `${ADAPTADOR}: construcción con madera sin correspondencia conocida en «Tipo de construcción» de Mapfre (no se adivina)`)
  const opcionUso = (OPCION_USO as Record<string, string>)[h.uso === 'secundaria' ? 'secundaria' : h.uso === 'habitual' ? 'habitual' : '']
  if (!opcionUso) throw new ErrorTarificador('datos', `${ADAPTADOR}: el uso «${h.uso}» no tiene correspondencia segura en Mapfre (solo habitual y secundaria)`)
  const opcionRegimen = (OPCION_REGIMEN as Record<string, string>)[h.regimen]
  if (!opcionRegimen) throw new ErrorTarificador('datos', `${ADAPTADOR}: el régimen «${h.regimen}» no tiene correspondencia en Mapfre`)
  const tipoTextos = TEXTOS_TIPO_VIVIENDA[h.tipoVivienda]
  if (!tipoTextos) throw new ErrorTarificador('datos', `${ADAPTADOR}: el tipo de vivienda «${h.tipoVivienda}» no tiene correspondencia en Mapfre`)
  const supuestos = ['calidad_media', 'tipo_construccion_estandar_del_portal', 'fecha_efecto_del_portal', 'cp_tomador_igual_cp_vivienda', 'sin_medidas_proteccion', 'valor_total_del_portal', 'habitaciones_y_banos_por_m2']
  if (h.uso === 'secundaria') supuestos.push('uso_secundaria_como_temporal')
  const esCasa = h.tipoVivienda === 'adosada' || h.tipoVivienda === 'independiente'
  const baja = h.tipoVivienda === 'planta_baja' || esPlantaBaja(i.planta)
  const plantaTextos = esCasa ? null : baja ? TEXTOS_PLANTA.baja : h.tipoVivienda === 'atico' ? TEXTOS_PLANTA.ultima : TEXTOS_PLANTA.intermedia
  const plantaPorDefecto = !esCasa && !baja && h.tipoVivienda !== 'atico'
  if (plantaPorDefecto) supuestos.push('planta_intermedia')
  const hb = habitacionesYBanosPorM2(i.superficieM2)
  return {
    codigoPostal: i.codigoPostal, superficie: i.superficieM2, anioConstruccion: i.anioConstruccion, anioReforma: i.anioReforma,
    tipoTextos, plantaTextos, plantaPorDefecto, opcionUso, opcionRegimen, habitaciones: hb.habitaciones, banos: hb.banos, supuestos,
  }
}

/** Compatibilidad: valida lo mínimo antes de abrir el portal (ya NO exige referencia catastral). PURA (lanza). */
export function exigirDatosHogar(f: FormularioHogar): PlanVivienda {
  return planVivienda(f)
}

/** Índice de la ÚNICA opción visible que casa con algún texto candidato (igualdad sin tildes/mayúsculas; si no, "contiene" único). `null` = ninguna o ambigua. PURA. */
export function indiceOpcionDesplegable(opciones: readonly string[], candidatos: readonly string[]): number | null {
  const cand = candidatos.map(sinTildesPlano)
  const norm = opciones.map(sinTildesPlano)
  const exactas = norm.flatMap((o, ix) => (cand.includes(o) ? [ix] : []))
  if (exactas.length === 1) return exactas[0]!
  if (exactas.length > 1) return null
  const parciales = norm.flatMap((o, ix) => (o !== '' && cand.some((c) => o.includes(c)) ? [ix] : []))
  return parciales.length === 1 ? parciales[0]! : null
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
export function ofertasDesdePrimasHogar(primas: readonly PrimaHogarMapfre[], supuestos: readonly string[] = []): OfertaNormalizada[] {
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
    avisos: ['Prima TOTAL anual de la modalidad leída de la pantalla de precio; sin desglose neta/impuestos.', 'Garantías y capitales de la pantalla sin mapear: no se informan (el bot no descarga el PDF del presupuesto).', ...(supuestos.length ? [`Precio ESTIMADO: se tarificó con supuestos (${supuestos.join(', ')}).`] : [])],
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
export async function abrirTarificacionRapidaHogar(page: Page, ctx: Pick<ContextoPortal, 'pulsar' | 'pausa' | 'pulsarEnlaceEntrada' | 'formador'> & { log?: (m: string, d?: Record<string, unknown>) => void }): Promise<void> {
  if (!ctx.pulsarEnlaceEntrada) throw new ErrorMapaIncompleto('la función guardada del enlace de entrada en el contexto del runner')
  await cerrarAvisosModales(page, ctx) // v0.2.1: un modal del portal sobre la home intercepta el clic en «Nueva producción»
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

type CtxPantalla = Pick<ContextoPortal, 'pulsar' | 'pausa' | 'formador'>

/** Texto de opciones SIN datos personales para el error (≤ 12 opciones de ≤ 40 caracteres). */
const listaOpciones = (t: readonly string[]) => t.map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean).slice(0, 12).map((x) => `«${x}»`).join(', ') || '(ninguna visible)'

/** Opcion por `id`: si no está marcado, se pulsa (su etiqueta si el input no se ve) por `ctx.pulsar` y se EXIGE que quede marcado. */
async function marcarOpcion(page: Page, id: string, etiqueta: string, ctx: CtxPantalla): Promise<void> {
  const opcion = page.locator(`input[id="${id}"]`).first()
  if ((await opcion.count()) === 0) await hueco(page, ctx.formador, etiqueta, `el opcion «${etiqueta}» (#${id}) no aparece`)
  if (await opcion.isChecked().catch(() => false)) return
  const visible = await opcion.isVisible().catch(() => false)
  await ctx.pulsar(visible ? opcion : page.locator(`label[for="${id}"]`).first())
  await ctx.pausa()
  if (!(await opcion.isChecked().catch(() => false))) await hueco(page, ctx.formador, etiqueta, `tras pulsar el opcion «${etiqueta}» (#${id}) no quedó marcado`)
}

/** Texto visible de un desplegable-botón (`button#id`). */
const textoBoton = async (b: Locator) => ((await b.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()

/**
 * Desplegable-botón (`button#id`, clase `select`): si el texto actual ya es uno de los candidatos no se toca; si no, se abre por
 * `ctx.pulsar` y se pulsa la ÚNICA opción visible que casa (`indiceOpcionDesplegable`). Sin opción reconocible → hueco con las OPCIONES.
 * Devuelve `false` si el desplegable no existe y `opcional` (p. ej. Planta en una casa).
 */
async function elegirDesplegable(page: Page, id: string, etiqueta: string, candidatos: readonly string[], ctx: CtxPantalla, opcional = false): Promise<boolean> {
  const b = page.locator(`button[id="${id}"]`).first()
  if ((await b.count()) === 0 || !(await b.isVisible().catch(() => false))) {
    if (opcional) return false
    await hueco(page, ctx.formador, etiqueta, `el desplegable «${etiqueta}» (#${id}) no aparece`)
  }
  const actual = await textoBoton(b)
  if (indiceOpcionDesplegable([actual], candidatos) === 0) return true
  await ctx.pulsar(b)
  await ctx.pausa()
  const caja = b.locator('xpath=ancestor::*[self::div or self::td or self::li][1]')
  const opciones = caja.locator('li, [role="option"], a').filter({ visible: true })
  const textos = (await opciones.allInnerTexts().catch(() => [] as string[])).map((t) => t.replace(/\s+/g, ' ').trim())
  const ix = indiceOpcionDesplegable(textos, candidatos)
  if (ix === null) await hueco(page, ctx.formador, etiqueta, `qué opción de «${etiqueta}» elegir (texto actual «${actual.slice(0, 40)}»; buscaba ${listaOpciones(candidatos)}; opciones visibles: ${listaOpciones(textos)})`)
  await ctx.pulsar(opciones.nth(ix!))
  await ctx.pausa()
  const nuevo = await textoBoton(b)
  if (indiceOpcionDesplegable([nuevo], candidatos) !== 0) await hueco(page, ctx.formador, etiqueta, `tras elegir en «${etiqueta}» el desplegable quedó en «${nuevo.slice(0, 40)}»`)
  return true
}

/** Campo de texto numérico/libre de la vivienda: `campoConRespaldo` + `comprobarCampo` + fill + lectura de vuelta. */
async function rellenarCampo(page: Page, sel: string, etiqueta: string, valor: string, ctx: CtxPantalla): Promise<void> {
  const r = await campoConRespaldo(page, sel, { page, formador: ctx.formador, etiqueta, descripcion: `Campo «${etiqueta}» de la vivienda en Mapfre Hogar` })
  if (!r) throw new ErrorMapaIncompleto(`el campo «${etiqueta}» de la vivienda (${sel}; no aparece)`, true)
  await comprobarCampo(r.campo)
  if (!(await esperarEditable(r.campo))) await hueco(page, ctx.formador, etiqueta, `el campo «${etiqueta}» está deshabilitado`)
  await r.campo.fill(valor)
  await r.campo.blur().catch(() => undefined)
  await esperarCampoAsentado(page, r.campo)
  if ((await r.campo.inputValue().catch(() => '')).trim() !== valor) throw new ErrorTarificador('portal', `${ADAPTADOR}: el portal no dejó fijado el campo «${etiqueta}»`)
  await r.confirmar().catch(() => undefined)
}

/**
 * «Datos de riesgo - Hogar» (vivienda): CP (opcion CP de serie) → m² → tipo → planta → uso → régimen → calidad Media → año(s) →
 * habitaciones y baños (supuestos por m²). Tipo de construcción, fecha de efecto, forma de aseguramiento y protecciones: los de serie.
 */
export async function pasoVivienda(page: Page, f: FormularioHogar, ctx: CtxPantalla): Promise<PlanVivienda> {
  const plan = planVivienda(f)
  await marcarOpcion(page, SEL_HOGAR.opcionCodigoPostal, 'CP', ctx)
  await rellenarCampo(page, SEL_HOGAR.codigoPostal, 'Código postal', plan.codigoPostal, ctx)
  await rellenarCampo(page, SEL_HOGAR.superficie, 'Vivienda construida (m2)', String(plan.superficie), ctx)
  await elegirDesplegable(page, SEL_HOGAR.tipoVivienda, 'Tipo de vivienda', plan.tipoTextos, ctx)
  if (plan.plantaTextos) await elegirDesplegable(page, SEL_HOGAR.planta, 'Planta', plan.plantaTextos, ctx, true)
  await marcarOpcion(page, plan.opcionUso, 'Uso', ctx)
  await marcarOpcion(page, plan.opcionRegimen, 'Régimen', ctx)
  await marcarOpcion(page, OPCION_CALIDAD_MEDIA, 'Calidad', ctx)
  await rellenarCampo(page, SEL_HOGAR.anoConstruccion, 'Año de construcción', String(plan.anioConstruccion), ctx)
  if (plan.anioReforma !== null) await rellenarCampo(page, SEL_HOGAR.anoReforma, 'Año de última reforma', String(plan.anioReforma), ctx)
  await rellenarCampo(page, SEL_HOGAR.habitaciones, 'Número de habitaciones', String(plan.habitaciones), ctx)
  await rellenarCampo(page, SEL_HOGAR.banos, 'Número de baños', String(plan.banos), ctx)
  return plan
}

/** Nombre y apellidos del tomador (`FormularioHogar.datosTomador`, lo pone asegura al entregar). Persona jurídica o ausente → vacío. */
type DatosTomadorHogar = { nombre?: string | null; apellido1?: string | null; apellido2?: string | null }
export const datosTomadorDe = (f: FormularioHogar): DatosTomadorHogar => {
  const d = f.datosTomador
  return d && d.tipo === 'fisica' ? { nombre: d.nombre, apellido1: d.apellido1, apellido2: d.apellido2 } : {}
}

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
    { sel: SEL_HOGAR.codigoPostalTomador, etiqueta: 'CP del tomador', valor: /^\d{5}$/.test(f.inmueble.codigoPostal) ? f.inmueble.codigoPostal : null, obligatorio: true },
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

const limpiarTxt = (t: string) => t.replace(/\s+/g, ' ').trim()
const IMPORTE_LIBRE = '\\d{1,3}(?:\\.\\d{3})*,\\d{2}\\s*€|\\d+,\\d{2}\\s*€'

/**
 * Lectura de respaldo cuando la pantalla de modalidades no tiene el formato del PDF (selector no grabado). Por LÍNEAS de texto visible:
 * un encabezado «HOGAR …» (≤ 40 caracteres, sin importe) abre una modalidad, y la prima anual es el importe de una línea «Prima total /
 * Total anual / Prima anual / Precio anual …: 123,45 €» o un importe suelto marcado «/año», «al año» o «anual». Importes distintos para la
 * misma modalidad → se descarta esa modalidad (ambiguo). Fail-closed: nada legible → `[]`. PURA.
 */
export function primasDesdeTextoLibre(texto: string): PrimaHogarMapfre[] {
  const lineas = texto.split(/\n+/).map(limpiarTxt).filter(Boolean)
  const reImporte = new RegExp(`(${IMPORTE_LIBRE})`)
  const reEtiquetada = new RegExp(`(?:prima\\s+total|total\\s+anual|prima\\s+anual|precio\\s+anual|importe\\s+anual)\\s*:?\\s*(${IMPORTE_LIBRE})`, 'i')
  const reSuelto = new RegExp(`^(${IMPORTE_LIBRE})\\s*(?:\\/\\s*a[nñ]o|al\\s+a[nñ]o|anual)`, 'i')
  let actual: string | null = null
  const porModalidad = new Map<string, Set<number>>()
  for (const l of lineas) {
    if (/^HOGAR\b/.test(sinTildes(l)) && l.length <= 40 && !reImporte.test(l)) { actual = sinTildes(l); continue }
    const m = reEtiquetada.exec(l) ?? reSuelto.exec(l)
    const n = m ? importeDePrimaHogar(m[1]!) : importeDePrimaTotal(l)
    if (n === null) continue
    const k = actual ?? 'HOGAR'
    porModalidad.set(k, (porModalidad.get(k) ?? new Set<number>()).add(n))
  }
  return [...porModalidad.entries()].flatMap(([modalidad, v]) => (v.size === 1 ? [{ modalidad, primaAnualEur: [...v][0]!, primerReciboEur: null }] : []))
}

export type DatosPantallaPrecio = { url: string; titulos: string[]; botones: string[]; invalidos: string[]; importes: number }

/**
 * Resumen de UNA línea de lo que se vio al no poder leer el precio (para afinar el selector en la primera ejecución): ruta sin query,
 * títulos y textos de botones (cortos, sin dígitos largos), ids de campos inválidos y nº de importes. Sin DNI/nombres (`secretos`). PURA.
 */
export function resumenPantallaPrecio(d: DatosPantallaPrecio, secretos: Array<string | undefined> = []): string {
  const limpio = (t: string) => redactarDatosPersonales(ocultarSecretos(limpiarTxt(t), secretos)).replace(/\d{6,}/g, '#').slice(0, 60)
  const lista = (xs: readonly string[], max: number) => [...new Set(xs.map(limpio).filter(Boolean))].slice(0, max).map((x) => `«${x}»`).join(', ') || '(ninguno)'
  return `ruta ${urlSinQuery(d.url).slice(0, 120)} · títulos ${lista(d.titulos, 10)} · botones ${lista(d.botones, 20)} · campos inválidos ${lista(d.invalidos, 12)} · importes en € visibles: ${d.importes}`
}

async function datosPantalla(page: Page): Promise<DatosPantallaPrecio> {
  const base: DatosPantallaPrecio = { url: page.url(), titulos: [], botones: [], invalidos: [], importes: 0 }
  try {
    const d = await page.evaluate(() => {
      const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 }
      const tx = (sel: string) => Array.from(document.querySelectorAll(sel)).filter(vis).map((e) => (e.textContent ?? '').trim()).filter(Boolean)
      return {
        titulos: tx('h1, h2, h3, h4, h5, legend, .title, .titulo'),
        botones: tx('button, a.btn, input[type=button], [role=button], [ng-click]'),
        invalidos: Array.from(document.querySelectorAll('.ng-invalid[id], input:invalid')).filter(vis).map((e) => (e as HTMLElement).id || (e as HTMLInputElement).name || '').filter(Boolean),
        importes: ((document.body.innerText ?? '').match(/\d+,\d{2}\s*€/g) ?? []).length,
      }
    })
    return { url: page.url(), ...d }
  } catch { return base }
}

/**
 * Pantalla de MODALIDADES/precio tras «SIGUIENTE»: texto visible con el formato del PDF o, si no, lectura por líneas (`primasDesdeTextoLibre`),
 * estable entre dos lecturas. Sin primas legibles → atasco con lo que se vio (títulos, botones, campos inválidos; sin datos personales). Solo lectura.
 */
export async function leerPrecioHogar(page: Page, ctx: Pick<ContextoPortal, 'formador'>, esperaMs = ESPERA_PRECIO_MS, secretos: Array<string | undefined> = []): Promise<PrimaHogarMapfre[]> {
  const hasta = Date.now() + esperaMs
  let previo: string | null = null
  for (;;) {
    const texto = await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '')
    const delPdf = primasDesdeTextoPrecio(texto)
    const primas = delPdf.length ? delPdf : primasDesdeTextoLibre(texto)
    const firma = primas.length ? JSON.stringify(primas) : null
    if (firma !== null && firma === previo) return primas
    previo = firma
    if (Date.now() >= hasta) {
      const visto = resumenPantallaPrecio(await datosPantalla(page), secretos)
      await hueco(page, ctx.formador, 'Precio', `la prima anual de la pantalla de modalidades (ni el formato del PDF ni la lectura por líneas dieron primas en ${Math.round(esperaMs / 1000)} s; selector no grabado; se vio: ${visto})`)
    }
    await page.waitForTimeout(400)
  }
}

/** Adaptador (APAGADO salvo el flag). Tarifica y PARA al leer el precio: no imprime, no descarga el PDF, no emite. */
export const mapfreHogar = {
  compania: 'mapfre',
  ramo: 'hogar',
  credencial: 'MAPFRE_WMEDIADORES',
  version: '0.3.0',
  async tarificar(page: Page, f: FormularioHogar, ctx: ContextoPortal): Promise<ResultadoAdaptador> {
    if (!MAPFRE_HOGAR_ACTIVO) throw new ErrorTarificador('datos', `${ADAPTADOR}: adaptador apagado (MAPFRE_HOGAR_ACTIVO = false)`)
    planVivienda(f) // valida antes de abrir el portal
    await login(page, ctx)
    await ctx.trasLogin()
    await abrirTarificacionRapidaHogar(page, ctx)
    const plan = await pasoVivienda(page, f, ctx)
    await pasoTomador(page, f, ctx)
    await pulsarSiguiente(page, ctx)
    const d = datosTomadorDe(f)
    const primas = await leerPrecioHogar(page, ctx, ESPERA_PRECIO_MS, [f.tomador.documentoIdentidad, f.tomador.fechaNacimiento, d.nombre ?? undefined, d.apellido1 ?? undefined, d.apellido2 ?? undefined])
    ctx.log(`precio leido (supuestos: ${plan.supuestos.length})`)
    return { ofertas: ofertasDesdePrimasHogar(primas, plan.supuestos) }
  },
} as const
