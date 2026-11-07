// «La más barata» POR NIVEL de cobertura (04/11/2026). PURO (sin BD ni red). Test: `tarificacion-niveles.test.ts`.
//
// Problema: comparar el precio de un terceros básico con el de un todo riesgo no dice nada (Reale salía «la más
// barata» porque entraba SIN daños propios). Aquí se agrupan las ofertas de UNA tarificación (bot RPA o Avant2) por
// nivel y se da la más barata de cada nivel, con lo que cada una tiene y otra del mismo nivel no.
//
// 🚨 Nunca se inventa un nivel: sin datos suficientes la oferta va a «sin clasificar» y NO compite.
// 🚨 Solo cuentan los estados AFIRMADOS (`si`/`no`). Un `no_consta` ni suma ni resta diferencias.
// Fuentes, por orden: categoría (taxonomía del vendor) → modalidad → producto → coberturas incluidas.

import { CATALOGO_GARANTIAS, claveCobertura, clasificarCoberturas, type CoberturaParaClasificar, type EstadoGarantia } from '@central/module-seguros'
import { eur } from './dinero.ts'

export const NIVELES_VEHICULO = ['Terceros básico', 'Terceros ampliado', 'Todo riesgo con franquicia', 'Todo riesgo sin franquicia'] as const
export const SIN_CLASIFICAR = 'sin clasificar'

export type OfertaParaNivel = {
  /** Id de la fila (opción/precio) para enlazar el resultado. */
  id?: string | null
  compania: string
  producto: string
  modalidad?: string | null
  categoria?: string | null
  /** Prima ANUAL. `null`/≤0 = no es una oferta comparable (va a sin clasificar). */
  primaEur: number | null
  /** Franquicia general. `null`/ausente = no consta (nunca 0). */
  franquiciaEur?: number | null
  /** Coberturas tal como se leyeron (`{nombre, incluida, texto}`). `null` = no constan. */
  coberturas?: readonly CoberturaParaClasificar[] | null
  /** Garantías ya clasificadas (`porClave` de Avant2). Si viene, manda sobre `coberturas`. */
  garantias?: Record<string, EstadoGarantia> | null
  /** Quién la dio: bot RPA o Avant2. Ausente = no se sabe (no entra en las parejas bot↔Avant2). */
  origen?: 'bot' | 'avant2' | null
}

export type ClasificacionNivel = { nivel: string; fuente: 'categoria' | 'modalidad' | 'producto' | 'coberturas' | null; motivo?: string }

export type OfertaEnNivel = {
  id: string | null
  compania: string
  /** Modalidad si la hay (Avant2: «Reale Terceros (Con Lunas)»); si no, el producto. */
  nombre: string
  primaEur: number
  /** Garantías que esta oferta tiene (`si`) y otra del nivel NO (`no` afirmado). `null` = sus coberturas no constan. */
  extras: string[] | null
  origen: 'bot' | 'avant2' | null
}

export type NivelCobertura = {
  nivel: string
  /** Por prima anual ascendente (empate: compañía, nombre). */
  ofertas: OfertaEnNivel[]
  masBarata: OfertaEnNivel
  /** Otras del nivel con EXACTAMENTE la misma prima que la más barata. */
  empatadas: OfertaEnNivel[]
  /** Garantías que la más barata NO tiene (`no` afirmado) y otra del nivel sí. `null` = sus coberturas no constan. */
  faltanEnLaMasBarata: string[] | null
}

export type ResultadoNiveles = {
  ramo: string | null
  niveles: NivelCobertura[]
  sinClasificar: { id: string | null; compania: string; nombre: string; primaEur: number | null; motivo: string }[]
}

// ─── Clasificación ────────────────────────────────────────────────────────────

const RE_TODO_RIESGO = /\btodo riesgo\b|\bt r\b|\bmoto danos\b|\bdanos propios\b/
const RE_AMPLIADO = /\bampliad[oa]\b|\bcomplet[oa]\b|\blunas\b|\bcristales\b|\brobo\b|\bincendio\b|\bperdida total\b|\bcombinado\b/
const RE_TERCEROS = /\bterceros?\b|\bbasic|\bbasicas?\b/
const RE_SIN_FRANQ = /\bsin franq/
const RE_FRANQ = /\bfranq/
/** Garantías que convierten un terceros en «ampliado» cuando solo hablan las coberturas. */
const CLAVES_AMPLIADO = ['lunas', 'robo', 'incendio', 'perdida_total'] as const

const esVehiculo = (ramo: string | null | undefined): ramo is 'auto' | 'moto' => ramo === 'auto' || ramo === 'moto'
const texto = (v: string | null | undefined): string => (typeof v === 'string' ? claveCobertura(v) : '')

function garantiasDe(ramo: 'auto' | 'moto' | 'hogar', o: OfertaParaNivel): Record<string, EstadoGarantia> | null {
  if (o.garantias) return o.garantias
  if (!o.coberturas || !o.coberturas.some((c) => c.incluida !== null)) return null
  return clasificarCoberturas(ramo, o.coberturas, null, { categoria: o.categoria ?? null, modalidad: o.modalidad ?? null }).porClave
}

function primaValida(p: number | null | undefined): p is number {
  return typeof p === 'number' && Number.isFinite(p) && p > 0
}

/** El nivel de UNA oferta de coche o moto. PURO. */
export function nivelVehiculo(ramo: 'auto' | 'moto', o: OfertaParaNivel): ClasificacionNivel {
  const fuentes = [['categoria', texto(o.categoria)], ['modalidad', texto(o.modalidad)], ['producto', texto(o.producto)]] as const
  let familia: 'tr' | 'terceros' | null = null
  let fuente: ClasificacionNivel['fuente'] = null
  let ampliado = false
  let franqTexto: 'con' | 'sin' | null = null
  for (const [nombre, t] of fuentes) {
    if (!t) continue
    if (familia === null) {
      if (RE_TODO_RIESGO.test(t)) familia = 'tr'
      else if (RE_TERCEROS.test(t) || RE_AMPLIADO.test(t)) familia = 'terceros'
      if (familia) fuente = nombre
    }
    if (RE_AMPLIADO.test(t)) ampliado = true
    if (franqTexto === null) franqTexto = RE_SIN_FRANQ.test(t) ? 'sin' : RE_FRANQ.test(t) ? 'con' : null
  }
  const franqImporte = typeof o.franquiciaEur === 'number' && Number.isFinite(o.franquiciaEur) ? o.franquiciaEur : null
  const franquicia = (): 'con' | 'sin' | null => {
    if (franqImporte !== null && franqImporte > 0) return 'con'
    if (franqTexto) return franqTexto
    if (franqImporte === 0) return 'sin'
    return null
  }
  const todoRiesgo = (f: ClasificacionNivel['fuente']): ClasificacionNivel => {
    const fr = franquicia()
    // Taxonomía de Avant2: «Todo Riesgo» a secas es una categoría distinta de «Todo Riesgo con Franquicia …».
    const categoriaPelada = f === 'categoria' && texto(o.categoria) === 'todo riesgo'
    if (fr === 'con') return { nivel: 'Todo riesgo con franquicia', fuente: f }
    if (fr === 'sin' || categoriaPelada) return { nivel: 'Todo riesgo sin franquicia', fuente: f }
    return { nivel: SIN_CLASIFICAR, fuente: f, motivo: 'todo riesgo sin saber si lleva franquicia' }
  }
  if (familia === 'tr') return todoRiesgo(fuente)
  if (familia === 'terceros') return { nivel: ampliado ? 'Terceros ampliado' : 'Terceros básico', fuente }

  // Ni categoría, ni modalidad, ni producto lo dicen: mandan las coberturas AFIRMADAS.
  const g = garantiasDe(ramo, o)
  if (!g) return { nivel: SIN_CLASIFICAR, fuente: null, motivo: 'sin nivel en el nombre ni coberturas legibles' }
  if (g.danos_propios === 'si') return todoRiesgo('coberturas')
  if (g.danos_propios === 'no') {
    return { nivel: CLAVES_AMPLIADO.some((k) => g[k] === 'si') ? 'Terceros ampliado' : 'Terceros básico', fuente: 'coberturas' }
  }
  return { nivel: SIN_CLASIFICAR, fuente: 'coberturas', motivo: 'no consta si lleva daños propios' }
}

/** Continente en coberturas que el catálogo no reconoce («DAÑOS VIVIENDA» de Mapfre). */
const RE_CONTINENTE_LOCAL = /^danos (a la |de la )?vivienda\b/

/** El nivel de UNA oferta de hogar: continente/contenido + RC + daños eléctricos. Cualquiera sin afirmar → sin clasificar. PURO. */
export function nivelHogar(o: OfertaParaNivel): ClasificacionNivel {
  const g = garantiasDe('hogar', o)
  if (!g) return { nivel: SIN_CLASIFICAR, fuente: null, motivo: 'coberturas no legibles' }
  const continenteLocal = (o.coberturas ?? []).some((c) => c.incluida === true && RE_CONTINENTE_LOCAL.test(claveCobertura(c.nombre)))
  const continente: EstadoGarantia = continenteLocal ? 'si' : (g.continente ?? 'no_consta')
  const contenido: EstadoGarantia = g.contenido ?? 'no_consta'
  const rc: EstadoGarantia = g.rc_familiar ?? 'no_consta'
  const electricos: EstadoGarantia = g.danos_electricos ?? 'no_consta'
  const faltan = [
    continente === 'no_consta' ? 'continente' : null,
    contenido === 'no_consta' ? 'contenido' : null,
    rc === 'no_consta' ? 'RC' : null,
    electricos === 'no_consta' ? 'daños eléctricos' : null,
  ].filter((x): x is string => x !== null)
  if (faltan.length) return { nivel: SIN_CLASIFICAR, fuente: 'coberturas', motivo: `no consta: ${faltan.join(', ')}` }
  const base = continente === 'si' && contenido === 'si' ? 'Continente y contenido' : continente === 'si' ? 'Solo continente' : contenido === 'si' ? 'Solo contenido' : null
  if (!base) return { nivel: SIN_CLASIFICAR, fuente: 'coberturas', motivo: 'ni continente ni contenido' }
  return { nivel: `${base} · ${rc === 'si' ? 'con' : 'sin'} RC · ${electricos === 'si' ? 'con' : 'sin'} daños eléctricos`, fuente: 'coberturas' }
}

/** El nivel de una oferta en su ramo. Ramo sin reglas (vida, decesos…) → sin clasificar. PURO. */
export function nivelDeOferta(ramo: string | null | undefined, o: OfertaParaNivel): ClasificacionNivel {
  if (esVehiculo(ramo)) return nivelVehiculo(ramo, o)
  if (ramo === 'hogar') return nivelHogar(o)
  return { nivel: SIN_CLASIFICAR, fuente: null, motivo: `ramo sin niveles (${ramo ?? 'desconocido'})` }
}

// ─── Agrupación ───────────────────────────────────────────────────────────────

function etiquetaGarantia(ramo: 'auto' | 'moto' | 'hogar', clave: string): string {
  return CATALOGO_GARANTIAS[ramo].find((g) => g.clave === clave)?.etiqueta ?? clave
}

/**
 * Agrupa las ofertas por nivel y da la más barata de cada uno. PURO.
 * Orden de los niveles: coche/moto de menos a más cobertura; hogar, por la prima de su más barata.
 */
export function masBarataPorNivel(ramo: string | null | undefined, ofertas: readonly OfertaParaNivel[]): ResultadoNiveles {
  const ramoCat = esVehiculo(ramo) || ramo === 'hogar' ? ramo : null
  const sinClasificar: ResultadoNiveles['sinClasificar'] = []
  const grupos = new Map<string, { o: OfertaParaNivel; g: Record<string, EstadoGarantia> | null; prima: number }[]>()
  for (const o of ofertas) {
    const nombre = (o.modalidad?.trim() || o.producto).trim()
    if (!primaValida(o.primaEur)) {
      sinClasificar.push({ id: o.id ?? null, compania: o.compania, nombre, primaEur: o.primaEur ?? null, motivo: 'sin prima válida' })
      continue
    }
    const c = nivelDeOferta(ramo, o)
    if (c.nivel === SIN_CLASIFICAR || !ramoCat) {
      sinClasificar.push({ id: o.id ?? null, compania: o.compania, nombre, primaEur: o.primaEur, motivo: c.motivo ?? 'sin datos' })
      continue
    }
    const lista = grupos.get(c.nivel) ?? []
    lista.push({ o, g: garantiasDe(ramoCat, o), prima: o.primaEur })
    grupos.set(c.nivel, lista)
  }

  const niveles: NivelCobertura[] = []
  for (const [nivel, miembros] of grupos) {
    miembros.sort((a, b) => a.prima - b.prima || a.o.compania.localeCompare(b.o.compania, 'es') || a.o.producto.localeCompare(b.o.producto, 'es'))
    const extrasDe = (i: number): string[] | null => {
      const g = miembros[i]!.g
      if (!g) return null
      return Object.keys(g)
        .filter((k) => g[k] === 'si' && miembros.some((m, j) => j !== i && m.g?.[k] === 'no'))
        .map((k) => etiquetaGarantia(ramoCat!, k))
    }
    const ofertasNivel: OfertaEnNivel[] = miembros.map((m, i) => ({
      id: m.o.id ?? null, compania: m.o.compania, nombre: (m.o.modalidad?.trim() || m.o.producto).trim(), primaEur: m.prima, extras: extrasDe(i), origen: m.o.origen ?? null,
    }))
    const gBarata = miembros[0]!.g
    const faltan = gBarata
      ? Object.keys(gBarata).filter((k) => gBarata[k] === 'no' && miembros.some((m, j) => j !== 0 && m.g?.[k] === 'si')).map((k) => etiquetaGarantia(ramoCat!, k))
      : null
    niveles.push({
      nivel,
      ofertas: ofertasNivel,
      masBarata: ofertasNivel[0]!,
      empatadas: ofertasNivel.slice(1).filter((x) => x.primaEur === ofertasNivel[0]!.primaEur),
      faltanEnLaMasBarata: faltan,
    })
  }
  const orden = (n: string) => {
    const i = (NIVELES_VEHICULO as readonly string[]).indexOf(n)
    return i === -1 ? NIVELES_VEHICULO.length : i
  }
  niveles.sort((a, b) => orden(a.nivel) - orden(b.nivel) || a.masBarata.primaEur - b.masBarata.primaEur || a.nivel.localeCompare(b.nivel, 'es'))
  return { ramo: ramo ?? null, niveles, sinClasificar }
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

export const MAX_LINEAS_NIVELES = 4

/**
 * Las líneas «💶 Más barata por nivel …» del Telegram (texto PLANO: el que las pinta en HTML las escapa). Como mucho
 * `MAX_LINEAS_NIVELES`. Sin ninguna oferta → `[]` (no se dice nada). Sin ningún nivel → una línea que lo explica.
 */
export function lineasMasBarataPorNivel(r: ResultadoNiveles | null | undefined, max = MAX_LINEAS_NIVELES): string[] {
  if (!r) return []
  const total = r.niveles.reduce((s, n) => s + n.ofertas.length, 0) + r.sinClasificar.length
  if (total === 0) return []
  if (r.niveles.length === 0) return [`💶 Más barata por nivel: no se puede comparar (${r.sinClasificar.length} oferta${r.sinClasificar.length === 1 ? '' : 's'} sin datos de cobertura suficientes).`]
  const linea = (n: NivelCobertura) => {
    const b = n.masBarata
    const notas = [
      n.ofertas.length > 1 ? `de ${n.ofertas.length}` : 'única',
      n.empatadas.length ? `empate con ${[...new Set(n.empatadas.map((e) => e.compania))].join(', ')}` : null,
      n.faltanEnLaMasBarata?.length ? `le falta ${n.faltanEnLaMasBarata.slice(0, 3).join(', ')}${n.faltanEnLaMasBarata.length > 3 ? '…' : ''}` : null,
    ].filter(Boolean).join('; ')
    return `💶 Más barata · ${n.nivel}: ${b.compania} (${b.nombre})${b.origen === 'avant2' ? ' [Avant2]' : ''} ${eur(b.primaEur)} — ${notas}`
  }
  const cola = r.sinClasificar.length ? `💶 Sin clasificar: ${r.sinClasificar.length} oferta${r.sinClasificar.length === 1 ? '' : 's'} (no compiten por nivel).` : null
  const todas = [...r.niveles.map(linea), ...(cola ? [cola] : [])]
  if (todas.length <= max) return todas
  // Los niveles caben pero la línea de «sin clasificar» no: va al final de la última.
  if (r.niveles.length <= max) return r.niveles.map((n, i) => (i === r.niveles.length - 1 ? `${linea(n)} (+${r.sinClasificar.length} sin clasificar)` : linea(n)))
  const caben = max - 1
  const resto = r.niveles.length - caben
  return [...r.niveles.slice(0, caben).map(linea), `💶 … y ${resto} nivel${resto === 1 ? '' : 'es'} más${cola ? ` (+${r.sinClasificar.length} sin clasificar)` : ''}: míralos en la oportunidad.`]
}

// ─── Bot ↔ Avant2 de la misma compañía y nivel ────────────────────────────────

export type ParejaBotAvant2 = {
  nivel: string
  compania: string
  botEur: number
  avant2Eur: number
  /** Avant2 − bot, en €. Positivo = Avant2 más cara. */
  diferenciaEur: number
  /** Diferencia sobre el precio del bot, en % (1 decimal). */
  diferenciaPct: number
}

const claveCompania = (c: string): string => claveCobertura(c)
const redondea = (n: number, d: number): number => Math.round(n * 10 ** d) / 10 ** d

/**
 * Por nivel y compañía con precio de AMBOS orígenes: la más barata del bot frente a la más barata de Avant2. PURO.
 * Sin origen declarado, o con un solo origen, no hay pareja (nunca se inventa la otra mitad).
 */
export function parejasBotAvant2(r: ResultadoNiveles | null | undefined): ParejaBotAvant2[] {
  if (!r) return []
  const salida: ParejaBotAvant2[] = []
  for (const n of r.niveles) {
    const porCompania = new Map<string, { nombre: string; bot: number | null; avant2: number | null }>()
    for (const o of n.ofertas) {
      if (o.origen !== 'bot' && o.origen !== 'avant2') continue
      const k = claveCompania(o.compania)
      if (!k) continue
      const f = porCompania.get(k) ?? { nombre: o.compania, bot: null, avant2: null }
      f[o.origen] = f[o.origen] === null ? o.primaEur : Math.min(f[o.origen]!, o.primaEur)
      porCompania.set(k, f)
    }
    for (const f of porCompania.values()) {
      if (f.bot === null || f.avant2 === null) continue
      salida.push({
        nivel: n.nivel, compania: f.nombre, botEur: f.bot, avant2Eur: f.avant2,
        diferenciaEur: redondea(f.avant2 - f.bot, 2), diferenciaPct: redondea(((f.avant2 - f.bot) / f.bot) * 100, 1),
      })
    }
  }
  return salida
}

export const MAX_LINEAS_BOT_AVANT2 = 3

/** Líneas «🔁 Bot vs Avant2 …» del Telegram (texto plano), como mucho `max`. Sin parejas → `[]`. */
export function lineasBotVsAvant2(r: ResultadoNiveles | null | undefined, max = MAX_LINEAS_BOT_AVANT2): string[] {
  const p = parejasBotAvant2(r)
  const linea = (x: ParejaBotAvant2) => {
    const signo = x.diferenciaEur > 0 ? '+' : x.diferenciaEur < 0 ? '-' : ''
    const dif = x.diferenciaEur === 0 ? 'igual' : `Avant2 ${signo}${eur(Math.abs(x.diferenciaEur))} (${signo}${String(Math.abs(x.diferenciaPct)).replace('.', ',')}%)`
    return `🔁 ${x.nivel} · ${x.compania}: bot ${eur(x.botEur)} vs Avant2 ${eur(x.avant2Eur)} — ${dif}`
  }
  if (p.length <= max) return p.map(linea)
  return [...p.slice(0, max - 1).map(linea), `🔁 … y ${p.length - (max - 1)} pareja${p.length - (max - 1) === 1 ? '' : 's'} más bot↔Avant2: míralas en la oportunidad.`]
}
