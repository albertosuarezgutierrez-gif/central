// «Para tarificar faltan» (21/10/2026, Alberto: «aquí solo es necesario saber los datos que faltan para tarificar»). PURO: sin red
// ni envs, importable desde 'use client' y desde tests. UNA lista que une lo que pide cada herramienta de precio:
//
//   · Avant2 (Codeoscopic, 0,50€): la comprobación PREVIA con lo guardado que ya calcula asegura — `datosRiesgo.faltan`
//     (`faltanDatosVivienda`/capital/comercio = obligatorios de `revisarDatos*`), `faltanVehiculo` y `faltan` de cada figura
//     (`faltanDeFigura`). El cotizador vuelve a revisar todo antes de cobrar: aquí no se afirma más que eso.
//   · Bots (gratis): de hogar, `checklistCompania` (= `obligatoriosPara`/`faltanParaTarificar` de module-tarificacion, lo que valida
//     asegura al encolar) sobre la vivienda guardada, más el validador de forma `formularioBotHogar`. De motor, lo que PUBLICA
//     «Bots (gratis)» (`pendientesPorBloque`), sin recalcular.
//
// Se deduplica por CAMPO (clave canónica: `vivienda.<campo>`, `persona.<clienteId>.<clave>`…): un dato que piden Avant2 y el bot
// sale UNA vez. Quién lo pide se dice solo cuando no lo piden todos los que se han comprobado.
//
// 🚨 Tres estados: una comprobación que no se pudo hacer es `sin_comprobar` (nunca «nada pendiente»); `listo` exige que TODAS las
// fuentes se hayan comprobado y no quede nada. 🚨 Sin datos personales en las claves: solo ids, campos y etiquetas.
import { ETIQUETA_CAMPO_CAPITAL, ETIQUETA_CAMPO_VEHICULO, ETIQUETA_CAMPO_VIVIENDA, type CampoCapital, type CampoVehiculo, type CampoVivienda } from '@central/module-seguros'
import type { BloqueObligatorio } from '@central/module-tarificacion'
import { checklistCompania, MOTIVO_SIN_DECLARACION } from '../tarificador-checklist.ts'
import { formularioBotHogar, type DatosViviendaBot } from '../tarificador-hogar-formulario.ts'
import { rotuloFalta } from '../riesgo-asegura.ts'

/** Dónde se completa: la sección de la pantalla a la que lleva el botón del dato. */
export type Destino = 'personas' | 'objeto' | 'historial' | 'precio' | 'bots'

/** `falta` = hay que completarlo · `confirmar` = el bot usa un supuesto: confírmalo · `sin_comprobar` = no se ha podido mirar. */
export type EstadoItem = 'falta' | 'confirmar' | 'sin_comprobar'

export type ItemTarificar = { clave: string; etiqueta: string; estado: EstadoItem; destino: Destino; pide: string[] }
export type Comprobacion = { quien: string; estado: 'comprobado' | 'sin_comprobar'; motivo?: string; nota?: string }
/** Lo que aporta UNA herramienta (Avant2 o la compañía de un bot). */
export type Aportacion = { quien: string; comprobacion: Comprobacion; items: Omit<ItemTarificar, 'pide'>[] }

export type ParaTarificar = {
  items: ItemTarificar[]
  comprobaciones: Comprobacion[]
  /** Quiénes se han comprobado de verdad (para decidir si un dato lo piden «todos»). */
  comprobados: string[]
  /** Nada pendiente Y todo comprobado. Sin ninguna fuente, `false` (no se ha mirado nada). */
  listo: boolean
}

const PESO: Record<EstadoItem, number> = { sin_comprobar: 1, confirmar: 2, falta: 3 }

/** Une las aportaciones: un item por clave; el estado más urgente; el destino y la etiqueta del primero (Avant2 va primero). PURA. */
export function unirParaTarificar(aportaciones: readonly Aportacion[]): ParaTarificar {
  const porClave = new Map<string, ItemTarificar>()
  for (const a of aportaciones) {
    for (const it of a.items) {
      const previo = porClave.get(it.clave)
      if (!previo) { porClave.set(it.clave, { ...it, pide: [a.quien] }); continue }
      if (PESO[it.estado] > PESO[previo.estado]) previo.estado = it.estado
      if (!previo.pide.includes(a.quien)) previo.pide.push(a.quien)
    }
  }
  const comprobaciones = aportaciones.map((a) => a.comprobacion)
  const comprobados = [...new Set(comprobaciones.filter((c) => c.estado === 'comprobado').map((c) => c.quien))]
  const items = [...porClave.values()]
  const listo = aportaciones.length > 0 && items.length === 0 && comprobaciones.every((c) => c.estado === 'comprobado')
  return { items, comprobaciones, comprobados, listo }
}

/** «Lo pide: Allianz Hogar» solo si NO lo piden todos los comprobados (con uno solo no hace falta decirlo). `null` = no se dice. PURA. */
export function etiquetaPide(item: ItemTarificar, p: ParaTarificar): string | null {
  if (p.comprobados.length <= 1 || p.comprobados.every((q) => item.pide.includes(q))) return null
  return `Lo pide: ${item.pide.join(', ')}`
}

const mayus = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)

// ─── Avant2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type FiguraParaTarificar = { rol: string; clienteId: string; nombre: string; faltan: string[] | null; empresa?: boolean }
export type DatosRiesgoParaTarificar = { clave: string; faltan: string[]; tarifica?: boolean; datos?: unknown } | null

export const QUIEN_AVANT2 = 'Avant2'

/** Dónde se completa cada clave de `faltanDeFigura`: el estado civil se elige en el cotizador; lo demás, en «Intervinientes». */
const destinoFalta = (k: string): Destino => (k === 'estadoCivil' ? 'precio' : 'personas')

function itemsFiguras(figuras: readonly FiguraParaTarificar[]): Omit<ItemTarificar, 'pide'>[] {
  const out: Omit<ItemTarificar, 'pide'>[] = []
  const vistas = new Set<string>()
  for (const f of figuras) {
    if (f.faltan === null) {
      const clave = `persona.${f.clienteId}.ficha`
      if (!vistas.has(clave)) { vistas.add(clave); out.push({ clave, etiqueta: `Ficha de ${f.nombre}: no se ha podido leer`, estado: 'sin_comprobar', destino: 'personas' }) }
      continue
    }
    for (const k of f.faltan) {
      const clave = `persona.${f.clienteId}.${k}`
      if (vistas.has(clave)) continue
      vistas.add(clave)
      out.push({ clave, etiqueta: `${mayus(rotuloFalta(k))} · ${f.nombre}`, estado: 'falta', destino: destinoFalta(k) })
    }
  }
  return out
}

/**
 * Lo que Avant2 pide y aún no está, según la comprobación previa de asegura. `null` = el ramo no se cotiza con Avant2 desde aquí.
 * `datosRiesgo: null` (asegura no lo manda) o `faltanVehiculo: null` = SIN COMPROBAR el objeto, nunca «completo». PURA.
 */
export function aportacionAvant2(e: {
  aplica: boolean
  esVehiculo: boolean
  datosRiesgo: DatosRiesgoParaTarificar
  faltanVehiculo: readonly string[] | null
  figuras: readonly FiguraParaTarificar[]
}): Aportacion | null {
  if (!e.aplica) return null
  const items: Omit<ItemTarificar, 'pide'>[] = []
  if (e.esVehiculo) {
    if (e.faltanVehiculo === null) items.push({ clave: 'vehiculo.?', etiqueta: 'Datos del vehículo: no se han podido comprobar', estado: 'sin_comprobar', destino: 'objeto' })
    else for (const k of e.faltanVehiculo) items.push({ clave: `vehiculo.${k}`, etiqueta: ETIQUETA_CAMPO_VEHICULO[k as CampoVehiculo] ?? k, estado: 'falta', destino: 'objeto' })
  } else if (e.datosRiesgo === null) {
    items.push({ clave: 'objeto.?', etiqueta: 'Datos del riesgo: no se han podido comprobar', estado: 'sin_comprobar', destino: 'objeto' })
  } else if (e.datosRiesgo.clave === 'datosVivienda') {
    for (const k of e.datosRiesgo.faltan) {
      // `capitalContinente` en la lista = no hay NI continente NI contenido (un inquilino asegura solo contenido).
      const etiqueta = k === 'capitalContinente' ? 'Capital de continente o de contenido' : ETIQUETA_CAMPO_VIVIENDA[k as CampoVivienda] ?? k
      items.push({ clave: `vivienda.${k}`, etiqueta, estado: 'falta', destino: 'objeto' })
    }
  } else if (e.datosRiesgo.clave === 'datosCapital') {
    for (const k of e.datosRiesgo.faltan) items.push({ clave: `capital.${k}`, etiqueta: ETIQUETA_CAMPO_CAPITAL[k as CampoCapital] ?? k, estado: 'falta', destino: 'objeto' })
  } else if (e.datosRiesgo.clave !== 'datosRiesgoLibre') {
    for (const k of e.datosRiesgo.faltan) items.push({ clave: `${e.datosRiesgo.clave}.${k}`, etiqueta: k, estado: 'falta', destino: 'objeto' })
  }
  items.push(...itemsFiguras(e.figuras))
  return {
    quien: QUIEN_AVANT2,
    comprobacion: { quien: QUIEN_AVANT2, estado: 'comprobado', nota: 'Comprobación previa con lo guardado: el cotizador lo revisa todo antes de cobrar los 0,50€.' },
    items,
  }
}

// ─── Bots de HOGAR ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Clave del obligatorio del bot (module-tarificacion) → campo de «Datos de la vivienda». Ojo: en Codeoscopic `ocupacion` es el
 *  USO de la vivienda y `uso` el RÉGIMEN (igual que `eleccionesInicialesHogar`). */
export const BOT_HOGAR_A_VIVIENDA: Readonly<Record<string, CampoVivienda>> = {
  'inmueble.codigoPostal': 'cp',
  'inmueble.nombreVia': 'nombreVia',
  'inmueble.numero': 'numeroVia',
  'inmueble.anioConstruccion': 'anioConstruccion',
  'inmueble.superficieM2': 'metrosCuadrados',
  'inmueble.referenciaCatastral': 'referenciaCatastral',
  'hogar.uso': 'ocupacion',
  'hogar.regimen': 'uso',
  'hogar.tipoVivienda': 'tipoVivienda',
  'hogar.conMadera': 'conMadera',
}
/** Elecciones del bloque de bots: decidirlas con un dato guardado exige casarlo con su catálogo. */
const ELECCION_DE_CLAVE: Readonly<Record<string, 'uso' | 'regimen' | 'tipoVivienda' | 'conMadera'>> = {
  'hogar.uso': 'uso', 'hogar.regimen': 'regimen', 'hogar.tipoVivienda': 'tipoVivienda', 'hogar.conMadera': 'conMadera',
}
/** Obligatorio de origen FICHA del tomador → clave de `faltanDeFigura` que lo dice. */
const FICHA_DE_CLAVE: Readonly<Record<string, readonly string[]>> = {
  'tomador.documentoIdentidad': ['dni'],
  'tomador.fechaNacimiento': ['fechaNacimiento', 'fechaNacimiento_invalida'],
  'datosTomador.nombre': ['nombre'],
  'datosTomador.apellido1': ['apellido1'],
}

export type EntradaBotsHogar = {
  vivienda: DatosViviendaBot
  /** `eleccionesInicialesHogar` (uso/regimen/tipoVivienda/conMadera; '' = sin elegir). */
  elecciones: Record<string, string>
  /** Si los catálogos de Codeoscopic se leyeron: sin ellos, un dato guardado que no casa por id NO se da por ausente. */
  catalogosLeidos: boolean
  /** ¿Hay algo guardado en la vivienda para cada elección? (aunque no case con las opciones del bot). */
  guardado: { uso: boolean; regimen: boolean; tipoVivienda: boolean; conMadera: boolean }
  /** Compañías con bot ACTIVO en hogar. `null` = no se pudo leer (sin comprobar). */
  companias: readonly { compania: string; nombre: string }[] | null
  tomador: FiguraParaTarificar | null
}

/** El `riesgo` de hogar SIN validar, con lo que consta, para mirar presencia con `checklistCompania` (no viaja a ningún sitio). */
function riesgoHogarParaComprobar(v: DatosViviendaBot, el: Record<string, string>): Record<string, unknown> {
  const s = (x: string | undefined) => (x && x.trim() !== '' ? x : null)
  return {
    ramo: 'hogar',
    inmueble: {
      codigoPostal: v.codigoPostal, nombreVia: v.nombreVia, numero: v.numero, anioConstruccion: v.anioConstruccion,
      superficieM2: v.superficieM2, referenciaCatastral: v.referenciaCatastral,
    },
    hogar: { uso: s(el.uso), regimen: s(el.regimen), tipoVivienda: s(el.tipoVivienda), conMadera: el.conMadera === 'si' ? true : el.conMadera === 'no' ? false : null },
  }
}

/** Una aportación por compañía con bot de hogar activo. Lista vacía = ninguna activa (no hay nada que comprobar). PURA. */
export function aportacionesBotsHogar(e: EntradaBotsHogar): Aportacion[] {
  if (e.companias === null) {
    return [{ quien: 'Bots', comprobacion: { quien: 'Bots', estado: 'sin_comprobar', motivo: 'no se ha podido leer qué compañías tienen el bot activo' }, items: [] }]
  }
  const riesgo = riesgoHogarParaComprobar(e.vivienda, e.elecciones)
  const out: Aportacion[] = []
  for (const { compania, nombre } of e.companias) {
    const c = checklistCompania(compania, 'hogar', riesgo)
    if (c.estado !== 'evaluado') {
      out.push({ quien: nombre, comprobacion: { quien: nombre, estado: 'sin_comprobar', motivo: c.estado === 'no_disponible' ? c.motivo : MOTIVO_SIN_DECLARACION }, items: [] })
      continue
    }
    const items: Omit<ItemTarificar, 'pide'>[] = []
    for (const fila of c.filas) {
      if (fila.estado === 'falta') {
        const campo = BOT_HOGAR_A_VIVIENDA[fila.clave]
        const eleccion = ELECCION_DE_CLAVE[fila.clave]
        if (eleccion && e.guardado[eleccion]) {
          // Hay un dato guardado que no casa EXACTAMENTE con una opción del bot: se elige en su bloque. Sin catálogos, no se sabe.
          items.push(e.catalogosLeidos
            ? { clave: campo ? `vivienda.${campo}` : `bot.${fila.clave}`, etiqueta: `${mayus(fila.etiqueta)} (elígelo en «Bots»: lo guardado no casa con sus opciones)`, estado: 'falta', destino: 'bots' }
            : { clave: campo ? `vivienda.${campo}` : `bot.${fila.clave}`, etiqueta: `${mayus(fila.etiqueta)} (no se han podido leer los catálogos)`, estado: 'sin_comprobar', destino: 'bots' })
          continue
        }
        items.push({ clave: campo ? `vivienda.${campo}` : `bot.${fila.clave}`, etiqueta: mayus(fila.etiqueta), estado: 'falta', destino: 'objeto' })
      } else if (fila.estado === 'ficha') {
        // Origen FICHA: asegura lo pone desde la ficha del tomador al encolar. Aquí se mira si la ficha lo TIENE.
        const t = e.tomador
        const claves = FICHA_DE_CLAVE[fila.clave]
        if (!t || !claves) continue
        if (t.faltan === null) { items.push({ clave: `persona.${t.clienteId}.ficha`, etiqueta: `Ficha de ${t.nombre}: no se ha podido leer`, estado: 'sin_comprobar', destino: 'personas' }); continue }
        for (const k of claves) if (t.faltan.includes(k)) items.push({ clave: `persona.${t.clienteId}.${k}`, etiqueta: `${mayus(rotuloFalta(k))} · ${t.nombre}`, estado: 'falta', destino: 'personas' })
      }
    }
    if (e.tomador?.empresa) {
      items.push({ clave: `persona.${e.tomador.clienteId}.empresa_hogar`, etiqueta: `${e.tomador.nombre} es una empresa: el bot de hogar solo tarifica a una persona con DNI/NIE`, estado: 'falta', destino: 'personas' })
    }
    // Con todo presente, el validador de FORMA del bot (CP de 5 cifras, m² enteros, años coherentes…): sus avisos van tal cual.
    if (items.length === 0) {
      const f = formularioBotHogar({ ...e.vivienda, tomadorEmpresa: false, uso: e.elecciones.uso, regimen: e.elecciones.regimen, tipoVivienda: e.elecciones.tipoVivienda, conMadera: e.elecciones.conMadera })
      if (!f.ok) for (const t of f.faltan) items.push({ clave: `bot.forma.${t}`, etiqueta: t, estado: 'falta', destino: 'objeto' })
    }
    out.push({ quien: nombre, comprobacion: { quien: nombre, estado: 'comprobado' }, items })
  }
  return out
}

// ─── Bots de MOTOR (lo publica «Bots (gratis)») ──────────────────────────────────────────────────────────────────────────────

const DESTINO_BLOQUE: Record<BloqueObligatorio, Destino> = { personas: 'personas', riesgo: 'objeto', poliza: 'historial' }

export type PublicadoMotor = {
  pendientes: {
    bloques: Record<BloqueObligatorio, readonly { clave: string; etiqueta: string; estado: 'falta' | 'supuesto' | 'ficha'; companias: readonly string[] }[]>
    companias: readonly { compania: string; estado: 'listo' | 'faltan' | 'no_disponible' }[]
  }
  sueltos: readonly string[]
  nombres: Readonly<Record<string, string>>
}

/** De lo publicado por «Bots (gratis)» de coche/moto. `null` = aún no lo ha publicado: SIN COMPROBAR (`motivo` dice dónde). PURA. */
export function aportacionesBotsMotor(pub: PublicadoMotor | null, motivoSinPublicar: string): Aportacion[] {
  if (pub === null) return [{ quien: 'Bots', comprobacion: { quien: 'Bots', estado: 'sin_comprobar', motivo: motivoSinPublicar }, items: [] }]
  const out: Aportacion[] = []
  for (const r of pub.pendientes.companias) {
    const nombre = pub.nombres[r.compania] ?? r.compania
    if (r.estado === 'no_disponible') { out.push({ quien: nombre, comprobacion: { quien: nombre, estado: 'sin_comprobar', motivo: MOTIVO_SIN_DECLARACION }, items: [] }); continue }
    const items: Omit<ItemTarificar, 'pide'>[] = pub.sueltos.map((t) => ({ clave: `bot.general.${t}`, etiqueta: t, estado: 'falta' as const, destino: 'bots' as const }))
    for (const bloque of Object.keys(pub.pendientes.bloques) as BloqueObligatorio[]) {
      for (const p of pub.pendientes.bloques[bloque]) {
        if (p.estado === 'ficha' || !p.companias.includes(r.compania)) continue
        items.push({ clave: `bot.${p.clave}`, etiqueta: p.estado === 'supuesto' ? `Confirmar: ${p.etiqueta}` : mayus(p.etiqueta), estado: p.estado === 'supuesto' ? 'confirmar' : 'falta', destino: DESTINO_BLOQUE[bloque] })
      }
    }
    out.push({ quien: nombre, comprobacion: { quien: nombre, estado: 'comprobado' }, items })
  }
  return out
}

// ─── Resúmenes de una línea para las cabeceras plegadas ──────────────────────────────────────────────────────────────────────

const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`

/** «3 personas · 2 datos pendientes» / «… · ficha sin leer». PURA. */
export function resumenIntervinientes(figuras: readonly FiguraParaTarificar[]): string {
  const personas = new Set(figuras.map((f) => f.clienteId)).size
  const sinLeer = figuras.some((f) => f.faltan === null)
  const pendientes = new Set(figuras.flatMap((f) => (f.faltan ?? []).map((k) => `${f.clienteId}.${k}`))).size
  const partes = [personas === 0 ? 'Sin intervinientes' : n(personas, 'persona', 'personas')]
  if (pendientes > 0) partes.push(n(pendientes, 'dato pendiente', 'datos pendientes'))
  if (sinLeer) partes.push('alguna ficha sin leer')
  if (pendientes === 0 && !sinLeer && personas > 0) partes.push('completo')
  return partes.join(' · ')
}

/** «228.000€ continente · 3 datos pendientes». `eur` se inyecta (formato de la app). PURA. */
export function resumenObjeto(d: DatosRiesgoParaTarificar, eur: (x: number) => string, faltanVehiculo?: readonly string[] | null, esVehiculo = false): string {
  if (esVehiculo) {
    if (faltanVehiculo === null || faltanVehiculo === undefined) return 'Sin comprobar'
    return faltanVehiculo.length ? n(faltanVehiculo.length, 'dato pendiente', 'datos pendientes') : 'Completo'
  }
  if (d === null) return 'Sin leer'
  const datos = (typeof d.datos === 'object' && d.datos !== null ? d.datos : {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  const partes: string[] = []
  if (d.clave === 'datosVivienda') {
    const cont = num(datos.capitalContinente)
    const cnt = num(datos.capitalContenido)
    if (cont !== null) partes.push(`${eur(cont)} continente`)
    if (cnt !== null) partes.push(`${eur(cnt)} contenido`)
  } else if (d.clave === 'datosCapital') {
    const cap = num(datos.capital)
    if (cap !== null) partes.push(`${eur(cap)} capital`)
  }
  partes.push(d.faltan.length ? n(d.faltan.length, 'dato pendiente', 'datos pendientes') : 'completo')
  return mayus(partes.join(' · '))
}
