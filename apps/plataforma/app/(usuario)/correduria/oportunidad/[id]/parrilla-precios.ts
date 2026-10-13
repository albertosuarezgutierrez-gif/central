// «Parrilla de precios» del riesgo (13/10/2026). Decisión de Alberto: Avant2 (Codeoscopic, 0,50€ por tarificación) y los
// bots gratuitos de las compañías CONVIVEN; se comparan POR COMPAÑÍA hasta que el bot cuadre, y entonces se retira Avant2
// para esa compañía. Esta pieza pura cruza los dos lados y dice, por compañía: prima de Avant2, prima del bot, diferencia
// en € y %, y si «cuadra» (|dif| ≤ UMBRAL_CUADRA_PCT).
//
// 🔑 IDENTIDAD: se cruza por CÓDIGO DGS, nunca por nombre aproximado.
//   · Avant2 solo manda la marca del vendor (`product.vendor.name`, guardada en `seguros.tarificacion_precios.compania`):
//     sin código. Se traduce con `DGS_POR_VENDOR_AVANT2` (tabla EXPLÍCITA; solo se normalizan mayúsculas, acentos y espacios).
//   · Los bots usan la clave canónica del registro de capacidades (`allianz`): `DGS_POR_BOT`, también explícita.
//   · Un nombre que no está en su tabla sale en su PROPIA fila «sin identificar» y no se funde con nada (ni con otra sin
//     identificar del otro lado aunque se llame igual): falta añadirla a la tabla, con su test.
//
// 🚨 TRES ESTADOS: «no se ha podido leer» ≠ «no se ha pedido» ≠ un precio. Un lado sin leer nunca convierte la fila en
// «solo bot»/«solo Avant2», y ninguna prima ausente se pinta como 0.
// 🚨 PERIODO: el bot da prima ANUAL (la de renovación si el portal la separa: `vistaPrecio`). Una prima de Avant2 de otro
// periodo (`meses` ≠ 12) no se compara; si Avant2 no declara el periodo, se enseña la diferencia pero NO se afirma «cuadra».

/** Por debajo de este % (en valor absoluto, sobre la prima de Avant2) el bot «cuadra» con Avant2. */
export const UMBRAL_CUADRA_PCT = 2

/** Ramos que Avant2 tarifica desde una oportunidad (`tarificacionNuevaGuardadaAsegura`). Los demás: «Avant2 no aplica». */
export const RAMOS_AVANT2 = ['auto', 'moto', 'hogar', 'decesos', 'salud', 'vida'] as const
export type RamoAvant2 = (typeof RAMOS_AVANT2)[number]
export function esRamoAvant2(ramo: string): ramo is RamoAvant2 {
  return (RAMOS_AVANT2 as readonly string[]).includes(ramo)
}

/**
 * Marca del vendor de Avant2 (normalizada) → código DGS. Medido el 21/09/2026 sobre `tarificacion_precios` contra
 * `seguros.companias_dgs` (ver `packages/module-seguros/src/defensa-cartera.ts`). «Fiatc» NO está a propósito: no consta
 * su código en el catálogo; sale «sin identificar» hasta que alguien lo confirme y lo añada aquí.
 */
export const DGS_POR_VENDOR_AVANT2: Readonly<Record<string, string>> = {
  allianz: 'C0109',
  fidelidade: 'E0118',
  generali: 'C0072',
  mapfre: 'C0058',
  'mutua madrilena': 'M0083',
  occident: 'C0468',
  reale: 'C0613',
}

/** Clave canónica del bot (`CapacidadCotizacion.compania`) → código DGS. Un bot nuevo se añade aquí con su test. */
export const DGS_POR_BOT: Readonly<Record<string, string>> = {
  allianz: 'C0109',
  generali: 'C0072',
  mapfre: 'C0058',
  occident: 'C0468',
}

/** Nombre de pantalla por código DGS (el de `nombre_comun`). */
export const NOMBRE_POR_DGS: Readonly<Record<string, string>> = {
  C0058: 'Mapfre',
  C0072: 'Generali',
  C0109: 'Allianz',
  C0468: 'Occident',
  C0613: 'Reale',
  E0118: 'Fidelidade',
  M0083: 'Mutua Madrileña',
}

/** Solo mayúsculas, acentos y espacios: nada de quitar «seguros» ni de buscar subcadenas. */
export function normalizarClave(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function dgsDeVendorAvant2(nombre: string | null | undefined): string | null {
  const k = normalizarClave(nombre)
  return k && Object.hasOwn(DGS_POR_VENDOR_AVANT2, k) ? DGS_POR_VENDOR_AVANT2[k] : null
}

export function dgsDeBot(clave: string | null | undefined): string | null {
  const k = normalizarClave(clave)
  return k && Object.hasOwn(DGS_POR_BOT, k) ? DGS_POR_BOT[k] : null
}

// ─── Entradas ───────────────────────────────────────────────────────────────

/** Un precio de Avant2 tal como lo da la tarificación guardada (`Precio` de `lib/retarificar-asegura.ts`). */
export type PrecioAvant2 = {
  compania?: string | null
  producto?: string | null
  modalidad?: string | null
  /** `null`/ausente = la compañía no dio importe (NO es 0). */
  primaEur?: number | null
  /** Meses del periodo de la prima. `null`/ausente = no lo declara. */
  meses?: number | null
  franquiciaEur?: number | null
}

export type LadoAvant2 =
  /** Ramo que Avant2 no tarifica desde aquí (comunidades, comercio, RC…). */
  | { estado: 'no_aplica' }
  | { estado: 'sin_leer'; motivo: string }
  /** No hay ninguna tarificación de Avant2 para esta oportunidad. */
  | { estado: 'ninguna' }
  | { estado: 'ok'; referencia: string | null; creadaEn: string | null; caducada: boolean; simulado: boolean; precios: PrecioAvant2[] }

/** Una oferta del bot ya en ANUAL (`vistaPrecio(o).total`). */
export type OfertaBotParrilla = {
  producto: string | null
  primaAnual: number
  /** Hueco para cuando el bot la lea: hoy ningún bot la manda (`null` = no consta). */
  modalidad?: string | null
  franquiciaEur?: number | null
}

export type TrabajoBotParrilla = {
  /** Clave canónica del bot (`allianz`). */
  compania: string
  estado: string
  creadoEn: string
  error: { mensaje: string } | null
  ofertas: OfertaBotParrilla[]
}

export type LadoBot =
  /** Ningún bot cotiza este ramo. */
  | { estado: 'no_aplica' }
  | { estado: 'sin_leer'; motivo: string }
  /** `disponibles` = claves canónicas de los bots registrados para el ramo (para decir «bot sin pedir»). */
  | { estado: 'ok'; disponibles: string[]; trabajos: TrabajoBotParrilla[] }

// ─── Salida ─────────────────────────────────────────────────────────────────

export type PrecioCelda = {
  prima: number
  producto: string | null
  modalidad: string | null
  franquiciaEur: number | null
  /** Opciones con importe de esa compañía en ese lado (se compara la más barata). */
  opciones: number
}

export type CeldaAvant2 =
  | ({ estado: 'precio'; meses: number | null } & PrecioCelda)
  /** La compañía salió en Avant2 pero sin importe. */
  | { estado: 'sin_precio' }
  | { estado: 'no_pedido' }
  | { estado: 'no_aplica' }
  | { estado: 'sin_leer'; motivo: string }

export type CeldaBot =
  | ({ estado: 'precio' } & PrecioCelda)
  | { estado: 'en_curso' }
  | { estado: 'error'; mensaje: string }
  /** El bot terminó bien pero sin ninguna oferta con importe. */
  | { estado: 'sin_precio' }
  /** Hay bot para la compañía y el ramo, pero no se ha pedido desde esta oportunidad. */
  | { estado: 'no_pedido' }
  /** No hay bot de esa compañía para este ramo. */
  | { estado: 'sin_bot' }
  | { estado: 'sin_leer'; motivo: string }

export type Veredicto =
  /** `cuadra: null` = no se puede afirmar (Avant2 no declara el periodo). `difEur` = bot − Avant2. */
  | { tipo: 'comparada'; cuadra: boolean | null; difEur: number; difPct: number; reserva: string | null }
  | { tipo: 'no_comparable'; motivo: string }
  | { tipo: 'solo_avant2' }
  | { tipo: 'solo_bot' }
  /** Un lado sigue en curso: aún no se sabe. */
  | { tipo: 'pendiente' }
  /** Un lado no se ha podido leer: no se afirma nada. */
  | { tipo: 'sin_leer' }
  /** Ningún lado tiene precio. */
  | { tipo: 'sin_precios' }

export type FilaParrilla = {
  /** Código DGS o `sin-id:avant2:<nombre>` / `sin-id:bot:<clave>` (nunca se funden). */
  clave: string
  codigoDgs: string | null
  nombre: string
  avant2: CeldaAvant2
  bot: CeldaBot
  veredicto: Veredicto
}

export type Parrilla = {
  /** Ningún lado aplica a este ramo: la parrilla no se pinta. */
  vacia: boolean
  filas: FilaParrilla[]
  /** Compañías sin código DGS en las tablas (falta mapeo explícito). */
  sinIdentificar: string[]
}

// ─── Cruce ──────────────────────────────────────────────────────────────────

const esNumero = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const redondear2 = (n: number) => Math.round(n * 100) / 100

type Grupo<T> = { clave: string; codigoDgs: string | null; nombre: string; items: T[] }

function agrupar<T>(items: readonly T[], identidad: (x: T) => { dgs: string | null; crudo: string }, lado: 'avant2' | 'bot'): Map<string, Grupo<T>> {
  const m = new Map<string, Grupo<T>>()
  for (const x of items) {
    const { dgs, crudo } = identidad(x)
    const clave = dgs ?? `sin-id:${lado}:${normalizarClave(crudo) || '¿?'}`
    const nombre = dgs ? NOMBRE_POR_DGS[dgs] ?? dgs : crudo.trim() || 'Compañía sin nombre'
    const g = m.get(clave) ?? { clave, codigoDgs: dgs, nombre, items: [] }
    g.items.push(x)
    m.set(clave, g)
  }
  return m
}

function celdaAvant2(precios: readonly PrecioAvant2[]): CeldaAvant2 {
  const con = precios.filter((p) => esNumero(p.primaEur))
  if (con.length === 0) return { estado: 'sin_precio' }
  const min = con.reduce((a, b) => ((b.primaEur as number) < (a.primaEur as number) ? b : a))
  return {
    estado: 'precio',
    prima: min.primaEur as number,
    producto: min.producto ?? null,
    modalidad: min.modalidad ?? null,
    franquiciaEur: esNumero(min.franquiciaEur) ? min.franquiciaEur : null,
    meses: esNumero(min.meses) ? min.meses : null,
    opciones: con.length,
  }
}

function celdaBot(t: TrabajoBotParrilla): CeldaBot {
  if (t.estado === 'pendiente' || t.estado === 'en_curso' || t.estado === 'error_reintentable') return { estado: 'en_curso' }
  if (t.estado !== 'ok') return { estado: 'error', mensaje: t.error?.mensaje || `El bot terminó en «${t.estado}».` }
  const con = t.ofertas.filter((o) => esNumero(o.primaAnual))
  if (con.length === 0) return { estado: 'sin_precio' }
  const min = con.reduce((a, b) => (b.primaAnual < a.primaAnual ? b : a))
  return {
    estado: 'precio',
    prima: min.primaAnual,
    producto: min.producto || null,
    modalidad: min.modalidad ?? null,
    franquiciaEur: esNumero(min.franquiciaEur) ? min.franquiciaEur : null,
    opciones: con.length,
  }
}

/** Prima del bot frente a la de Avant2 (de la misma compañía, ya cruzada por DGS). */
export function compararPrimas(a: { prima: number; meses: number | null }, bot: { prima: number }, umbralPct = UMBRAL_CUADRA_PCT): Veredicto {
  if (a.meses !== null && a.meses !== 12) {
    return { tipo: 'no_comparable', motivo: `Avant2 da la prima de ${a.meses} meses y el bot la anual.` }
  }
  if (!(a.prima > 0)) return { tipo: 'no_comparable', motivo: 'La prima de Avant2 no es positiva: no hay base para el %.' }
  const difEur = redondear2(bot.prima - a.prima)
  const difPct = redondear2((difEur / a.prima) * 100)
  if (a.meses === null) {
    return { tipo: 'comparada', cuadra: null, difEur, difPct, reserva: 'Avant2 no declara el periodo de su prima: no se afirma que cuadre.' }
  }
  return { tipo: 'comparada', cuadra: Math.abs(difPct) <= umbralPct, difEur, difPct, reserva: null }
}

function veredicto(a: CeldaAvant2, b: CeldaBot, umbralPct: number): Veredicto {
  if (a.estado === 'precio' && b.estado === 'precio') return compararPrimas(a, b, umbralPct)
  if (a.estado === 'sin_leer' || b.estado === 'sin_leer') return { tipo: 'sin_leer' }
  if (b.estado === 'en_curso') return { tipo: 'pendiente' }
  if (a.estado === 'precio') return { tipo: 'solo_avant2' }
  if (b.estado === 'precio') return { tipo: 'solo_bot' }
  return { tipo: 'sin_precios' }
}

/** El último trabajo de cada bot (por `creadoEn`), como `ultimoPorCompania` de la sección de bots. */
function ultimosTrabajos(trabajos: readonly TrabajoBotParrilla[]): TrabajoBotParrilla[] {
  const vistos = new Set<string>()
  const out: TrabajoBotParrilla[] = []
  for (const t of [...trabajos].sort((x, y) => y.creadoEn.localeCompare(x.creadoEn))) {
    const k = normalizarClave(t.compania)
    if (vistos.has(k)) continue
    vistos.add(k)
    out.push(t)
  }
  return out
}

const ORDEN_VEREDICTO: Record<Veredicto['tipo'], number> = {
  comparada: 0, no_comparable: 1, pendiente: 2, solo_avant2: 3, solo_bot: 3, sin_leer: 4, sin_precios: 5,
}

function primaMin(f: FilaParrilla): number {
  const xs = [f.avant2.estado === 'precio' ? f.avant2.prima : null, f.bot.estado === 'precio' ? f.bot.prima : null].filter(esNumero)
  return xs.length ? Math.min(...xs) : Number.POSITIVE_INFINITY
}

/**
 * PURO: la parrilla de una oportunidad. Una fila por compañía (identidad DGS); las que no tienen código, en su propia fila.
 */
export function construirParrilla(avant2: LadoAvant2, bot: LadoBot, umbralPct = UMBRAL_CUADRA_PCT): Parrilla {
  if (avant2.estado === 'no_aplica' && bot.estado === 'no_aplica') return { vacia: true, filas: [], sinIdentificar: [] }

  const gruposA = avant2.estado === 'ok'
    ? agrupar(avant2.precios, (p) => ({ dgs: dgsDeVendorAvant2(p.compania), crudo: p.compania ?? '' }), 'avant2')
    : new Map<string, Grupo<PrecioAvant2>>()
  const ultimos = bot.estado === 'ok' ? ultimosTrabajos(bot.trabajos) : []
  const gruposB = agrupar(ultimos, (t) => ({ dgs: dgsDeBot(t.compania), crudo: t.compania }), 'bot')
  // Bots registrados para el ramo y aún sin pedir: también son una fila («bot sin pedir»).
  const disponibles = new Map<string, string>() // clave de fila → clave canónica del bot
  if (bot.estado === 'ok') {
    for (const c of bot.disponibles) {
      const dgs = dgsDeBot(c)
      disponibles.set(dgs ?? `sin-id:bot:${normalizarClave(c)}`, c)
    }
  }

  const claves = new Set<string>([...gruposA.keys(), ...gruposB.keys(), ...disponibles.keys()])
  const filas: FilaParrilla[] = []
  for (const clave of claves) {
    const ga = gruposA.get(clave)
    const gb = gruposB.get(clave)
    const codigoDgs = ga?.codigoDgs ?? gb?.codigoDgs ?? (clave.startsWith('sin-id:') ? null : clave)
    const nombre = codigoDgs ? NOMBRE_POR_DGS[codigoDgs] ?? codigoDgs : ga?.nombre ?? gb?.nombre ?? disponibles.get(clave) ?? clave

    const a: CeldaAvant2 =
      avant2.estado === 'no_aplica' ? { estado: 'no_aplica' }
      : avant2.estado === 'sin_leer' ? { estado: 'sin_leer', motivo: avant2.motivo }
      : avant2.estado === 'ninguna' ? { estado: 'no_pedido' }
      : ga ? celdaAvant2(ga.items) : { estado: 'no_pedido' }
    const b: CeldaBot =
      bot.estado === 'sin_leer' ? { estado: 'sin_leer', motivo: bot.motivo }
      : bot.estado === 'no_aplica' ? { estado: 'sin_bot' }
      : gb ? celdaBot(gb.items[0])
      : disponibles.has(clave) ? { estado: 'no_pedido' }
      : { estado: 'sin_bot' }
    filas.push({ clave, codigoDgs, nombre, avant2: a, bot: b, veredicto: veredicto(a, b, umbralPct) })
  }
  filas.sort((x, y) => ORDEN_VEREDICTO[x.veredicto.tipo] - ORDEN_VEREDICTO[y.veredicto.tipo] || primaMin(x) - primaMin(y) || x.nombre.localeCompare(y.nombre, 'es'))
  const sinIdentificar = filas.filter((f) => f.codigoDgs === null).map((f) => f.nombre)
  return { vacia: false, filas, sinIdentificar }
}

/** La variante de Avant2 que manda en la parrilla: la última pedida (por fecha), nunca otra. `null` = ninguna. */
export function ultimaVariante<V extends { id: string; creadoAt: string }>(variantes: readonly V[]): V | null {
  let mejor: V | null = null
  for (const v of variantes) if (!mejor || v.creadoAt > mejor.creadoAt) mejor = v
  return mejor
}

/** «+3,25 %» / «−1,10 %»: el % con coma decimal y signo explícito. */
export function textoPct(p: number): string {
  const abs = Math.abs(p).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${abs} %`
}

/** Rótulo corto del veredicto (la UI lo pinta como insignia). */
export function rotuloVeredicto(v: Veredicto): string {
  switch (v.tipo) {
    case 'comparada': return v.cuadra === true ? 'Cuadra' : v.cuadra === false ? 'No cuadra' : 'Sin periodo: no se afirma'
    case 'no_comparable': return 'No comparable'
    case 'solo_avant2': return 'Solo Avant2'
    case 'solo_bot': return 'Solo bot'
    case 'pendiente': return 'Bot en curso'
    case 'sin_leer': return 'Sin leer'
    case 'sin_precios': return 'Sin precios'
  }
}
