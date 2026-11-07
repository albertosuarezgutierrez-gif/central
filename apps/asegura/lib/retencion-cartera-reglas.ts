// RETENCIÓN DE CARTERA F1 (Alberto, 07/11/2026: «automatizar la cartera para retenerla y yo dedicarme a vender»).
// Lo PURO (sin BD ni red), con test. Diseño: docs/superpowers/specs/2026-11-07-retencion-cartera.md.
//
// Calendario de RENOVACIÓN para pólizas EN VIGOR (`esCarteraEnVigor`, lo calcula quien lee) de AUTO y HOGAR. El vencimiento es
// el de `vencimientoConRecibos()` (nunca la fecha pelada de la póliza). Con D = días de antelación de la propuesta (40 por
// defecto, preferencia del cliente entre 35 y 90):
//   · D+20 → «t60_datos»     ¿tenemos los datos para tarificar? si faltan, se PROPONE la solicitud de datos (✅ de Alberto).
//   · D+5  → «t45_bots»      bots gratis (mismo camino que `solicitud-renovacion-bots`). Avant2 NUNCA (0,50 €: botón de Alberto).
//   · D    → «t40_propuesta» presupuesto de renovación + Telegram de revisión con su ✅ (el de siempre) + resumen diario.
//   · ≤30  → «tarde»         art. 22 LCS: el tomador se opone ≥1 mes antes del vencimiento. Ya no se automatiza: se lista.
// NADA sale al cliente desde aquí: el único camino al cliente es el ✅ de Alberto en el Telegram de revisión de cada póliza.
import type { ReciboVigencia } from '@central/module-seguros'

// ─── Preferencias del cliente (nulo = defecto global) ─────────────────────────

export const DIAS_ANTELACION_DEFECTO = 40
/** Por debajo no da tiempo al art. 22 LCS (oposición ≥1 mes antes) con margen para que el cliente conteste. */
export const DIAS_ANTELACION_MIN = 35
export const DIAS_ANTELACION_MAX = 90
export const UMBRAL_SUBIDA_DEFECTO = 10
export const UMBRAL_SUBIDA_MIN = 0
export const UMBRAL_SUBIDA_MAX = 50
/** Plazo del tomador para oponerse a la prórroga (art. 22 LCS): a partir de aquí es «tarde». */
export const DIAS_OPOSICION_TOMADOR = 30
/** Separación de cada paso respecto a la propuesta (nominal: 60/45/40 con D = 40). */
export const ADELANTO_DATOS = 20
export const ADELANTO_BOTS = 5

export type PreferenciasRenovacion = { umbralSubidaPct: number | null; diasAntelacion: number | null }
export type PreferenciasEfectivas = { umbralSubidaPct: number; diasAntelacion: number; origen: 'defecto' | 'cliente' | 'invalida' }

/**
 * Preferencia del cliente → la que se aplica. `null`/ausente = defecto global (nunca 0). Un valor fuera de rango (la BD lo
 * impide con CHECK; esto es la red) NO se recorta a un valor que el cliente no eligió: se usa el defecto y se marca `invalida`. PURA.
 */
export function preferenciasEfectivas(p: PreferenciasRenovacion | null | undefined): PreferenciasEfectivas {
  const d = p?.diasAntelacion ?? null
  const u = p?.umbralSubidaPct ?? null
  const dOk = d === null || (Number.isInteger(d) && d >= DIAS_ANTELACION_MIN && d <= DIAS_ANTELACION_MAX)
  const uOk = u === null || (Number.isFinite(u) && u >= UMBRAL_SUBIDA_MIN && u <= UMBRAL_SUBIDA_MAX)
  const origen: PreferenciasEfectivas['origen'] = !dOk || !uOk ? 'invalida' : d === null && u === null ? 'defecto' : 'cliente'
  return {
    diasAntelacion: dOk && d !== null ? d : DIAS_ANTELACION_DEFECTO,
    umbralSubidaPct: uOk && u !== null ? u : UMBRAL_SUBIDA_DEFECTO,
    origen,
  }
}

// ─── Etapa del calendario ─────────────────────────────────────────────────────

export const RAMOS_RETENCION = ['auto', 'hogar'] as const
export type RamoRetencion = (typeof RAMOS_RETENCION)[number]

export type EtapaRenovacion =
  | 'no_aplica' // no es cartera en vigor o no es auto/hogar
  | 'sin_vencimiento' // no se sabe cuándo vence: no se afirma nada (≠ «no vence»)
  | 'fuera' // aún falta
  | 't60_datos'
  | 't45_bots'
  | 't40_propuesta'
  | 'tarde' // ≤30 días: el preaviso del art. 22 ya no da margen
  | 'vencida'

export type PolizaCalendario = {
  enVigor: boolean
  ramo: string | null
  /** `vencimientoConRecibos()` ya aplicado, `YYYY-MM-DD…`. `null` = no se sabe. */
  vencimiento: string | null
}

/** Días naturales de `hoy` (fecha de Madrid, `YYYY-MM-DD`) a `vencimiento` (`YYYY-MM-DD`). `null` si alguna fecha no se lee. */
export function diasHasta(vencimiento: string, hoy: string): number | null {
  const v = Date.parse(`${vencimiento.slice(0, 10)}T00:00:00Z`)
  const h = Date.parse(`${hoy.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(v) || !Number.isFinite(h)) return null
  return Math.round((v - h) / 86_400_000)
}

/** ¿En qué paso del calendario está la póliza HOY? `hoy` = fecha de Madrid `YYYY-MM-DD`. PURA. */
export function etapaRenovacion(p: PolizaCalendario, hoy: string, pref?: PreferenciasRenovacion | null): EtapaRenovacion {
  if (!p.enVigor || !p.ramo || !(RAMOS_RETENCION as readonly string[]).includes(p.ramo)) return 'no_aplica'
  if (!p.vencimiento) return 'sin_vencimiento'
  const dias = diasHasta(p.vencimiento, hoy)
  if (dias === null) return 'sin_vencimiento'
  const D = preferenciasEfectivas(pref).diasAntelacion
  if (dias < 0) return 'vencida'
  if (dias <= DIAS_OPOSICION_TOMADOR) return 'tarde'
  if (dias <= D) return 't40_propuesta'
  if (dias <= D + ADELANTO_BOTS) return 't45_bots'
  if (dias <= D + ADELANTO_DATOS) return 't60_datos'
  return 'fuera'
}

/** El mayor adelanto posible (para acotar la consulta): D máx + paso de datos. */
export const HORIZONTE_MAX_DIAS = DIAS_ANTELACION_MAX + ADELANTO_DATOS

// ─── Qué toca hacer (idempotencia por anualidad) ──────────────────────────────

/** Lo ya hecho en ESTA anualidad (fila de `renovacion_ciclo`). `null` = sin fila aún. */
export type CicloHecho = { datosAt: Date | string | null; botsAt: Date | string | null; propuestaAt: Date | string | null; subidaAvisadaAt: Date | string | null }
export type Accion = 'datos' | 'bots' | 'propuesta'

/**
 * Las acciones pendientes de la etapa, en orden. Se recupera lo saltado (un día sin cron) mientras quede ventana: en «t45»
 * aún se comprueban los datos; en «t40» aún se lanzan los bots. Solo HOGAR tiene solicitud de datos y bots automáticos en F1
 * (auto: «Probar» a mano). «tarde», «vencida», «fuera»…: nada. Cada acción se hace UNA vez por anualidad. PURA.
 */
export function accionesPendientes(etapa: EtapaRenovacion, ramo: string | null, ciclo: CicloHecho | null): Accion[] {
  const hecho = (a: Accion) => (a === 'datos' ? ciclo?.datosAt : a === 'bots' ? ciclo?.botsAt : ciclo?.propuestaAt) != null
  const hogar = ramo === 'hogar'
  const quiere: Accion[] =
    etapa === 't60_datos' ? (hogar ? ['datos'] : [])
      : etapa === 't45_bots' ? (hogar ? ['datos', 'bots'] : [])
        : etapa === 't40_propuesta' ? (hogar ? ['bots', 'propuesta'] : ['propuesta'])
          : []
  return quiere.filter((a) => !hecho(a))
}

/** Dos vencimientos a menos de esto son la MISMA anualidad (CIMA corrige la fecha unos días: no se reprocesa). */
export const MARGEN_MISMA_ANUALIDAD_DIAS = 45

/** De los ciclos de la póliza, el de esta anualidad (vencimiento a ±45 días). PURA. */
export function cicloDeAnualidad<C extends { vencimiento: string }>(ciclos: readonly C[], vencimiento: string): C | null {
  let mejor: { c: C; d: number } | null = null
  for (const c of ciclos) {
    const d = diasHasta(c.vencimiento, vencimiento)
    if (d === null || Math.abs(d) > MARGEN_MISMA_ANUALIDAD_DIAS) continue
    if (!mejor || Math.abs(d) < mejor.d) mejor = { c, d: Math.abs(d) }
  }
  return mejor?.c ?? null
}

// ─── Disparo extra: CIMA trae la prima de la renovación y sube ────────────────

export type Subida =
  | { estado: 'sin_dato' } // no hay recibo de la anualidad nueva o de la anterior (≠ «no sube»)
  | { estado: 'sin_subida' | 'subida'; anterior: number; nueva: number; pct: number }

function importe(t: string | null): number | null {
  if (typeof t !== 'string' || !/^\d+(\.\d{1,2})?$/.test(t.trim())) return null
  const n = Number(t.trim())
  return n > 0 ? n : null
}

/**
 * ¿Sube la prima de la renovación más del umbral? Solo pago ANUAL (un recibo fraccionado es un trozo de la prima, igual que
 * `primaConRecibos`). «Nueva» = recibo de anualidad (CA/NP no anulado) que acaba DESPUÉS del vencimiento próximo (la anualidad
 * que viene, ya emitida por CIMA); «anterior» = el que acaba en el vencimiento o antes (el más reciente). Sin alguno de los
 * dos: `sin_dato`. Subida = estrictamente mayor que el umbral. PURA.
 */
export function subidaPrimaRenovacion(e: { recibos: readonly ReciboVigencia[]; vencimiento: string; fraccionamiento: string | null; umbralPct: number }): Subida {
  if (e.fraccionamiento !== 'anual') return { estado: 'sin_dato' }
  const venc = e.vencimiento.slice(0, 10)
  const anuales = e.recibos
    .filter((r) => (r.claseRecibo === 'CA' || r.claseRecibo === 'NP') && r.situacion !== 'anulado' && r.fechaVencimiento)
    .map((r) => ({ fin: r.fechaVencimiento!.slice(0, 10), imp: importe(r.primaTotal) }))
    .filter((r): r is { fin: string; imp: number } => r.imp !== null)
  const nueva = anuales.filter((r) => r.fin > venc).sort((a, b) => a.fin.localeCompare(b.fin))[0]
  const anterior = anuales.filter((r) => r.fin <= venc).sort((a, b) => b.fin.localeCompare(a.fin))[0]
  if (!nueva || !anterior) return { estado: 'sin_dato' }
  const pct = Math.round(((nueva.imp - anterior.imp) / anterior.imp) * 1000) / 10
  return { estado: pct > e.umbralPct ? 'subida' : 'sin_subida', anterior: anterior.imp, nueva: nueva.imp, pct }
}

// ─── Interruptor ──────────────────────────────────────────────────────────────

/** `RENOVACION_AUTO_ACTIVA=1` y solo «1»: cualquier otra cosa (vacío, «true», «0») = ensayo. `?contar=1` fuerza ensayo. PURA. */
export function modoRetencion(env: Record<string, string | undefined>, contar: boolean): 'ensayo' | 'activo' {
  return !contar && env.RENOVACION_AUTO_ACTIVA?.trim() === '1' ? 'activo' : 'ensayo'
}

// ─── Textos de Telegram (sin PII: nombre de pila + ramo + compañía + vencimiento) ──

export type LineaPoliza = {
  polizaId: string
  nombre: string | null // SOLO nombre de pila (`nombreDePila`)
  ramo: string
  compania: string | null
  vencimiento: string | null
  etapa: EtapaRenovacion
  acciones: readonly Accion[]
  subida: Subida
  /** Lo que pasó con cada acción ejecutada (estado corto, sin valores). */
  resultados?: Partial<Record<Accion, string>>
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : 'sin fecha')
const QUE_HACE: Readonly<Record<Accion, string>> = { datos: 'comprobar datos (y proponerte la solicitud si faltan)', bots: 'lanzar los bots (gratis)', propuesta: 'prepararte la propuesta de renovación' }
const ETIQUETA_ETAPA: Readonly<Record<EtapaRenovacion, string>> = {
  no_aplica: 'no aplica', sin_vencimiento: 'sin vencimiento conocido', fuera: 'aún no toca', t60_datos: 'datos', t45_bots: 'bots', t40_propuesta: 'propuesta', tarde: 'tarde (≤30 días)', vencida: 'vencida',
}

/** Una línea por póliza. PURA. */
export function lineaPoliza(l: LineaPoliza): string {
  const sube = l.subida.estado === 'subida' ? ` · 📈 sube ${String(l.subida.pct).replace('.', ',')} %` : ''
  return `• ${esc(l.nombre ?? 'Cliente')} · ${esc(l.ramo)} · ${esc(l.compania ?? 'compañía sin leer')} · vence ${fecha(l.vencimiento)}${sube}`
}

export function contarPorEtapa(ls: readonly Pick<LineaPoliza, 'etapa'>[]): Record<EtapaRenovacion, number> {
  const c = { no_aplica: 0, sin_vencimiento: 0, fuera: 0, t60_datos: 0, t45_bots: 0, t40_propuesta: 0, tarde: 0, vencida: 0 } as Record<EtapaRenovacion, number>
  for (const l of ls) c[l.etapa]++
  return c
}

const VISIBLES: readonly EtapaRenovacion[] = ['t60_datos', 't45_bots', 't40_propuesta', 'tarde', 'sin_vencimiento']
const MAX_LINEAS = 15

/** Telegram de ENSAYO (sin interruptor o sin migración): cuántas hay en cada etapa y qué HARÍA. No se ha creado nada. PURA. */
export function textoEnsayo(e: { lineas: readonly LineaPoliza[]; motivo: 'interruptor' | 'sin_migracion' | 'contar'; preferenciasLeidas: boolean }): string {
  const n = contarPorEtapa(e.lineas)
  const out = [
    '🧪 <b>Retención de cartera · ENSAYO</b> (no he creado ni enviado nada)',
    e.motivo === 'sin_migracion' ? 'Falta la migración 2026-11-07a_retencion_cartera.sql: sin ella no hay memoria de lo hecho y no actúo.'
      : e.motivo === 'interruptor' ? 'Interruptor RENOVACION_AUTO_ACTIVA apagado.' : 'Ensayo pedido (?contar=1).',
    `Auto y hogar en vigor: ${n.t60_datos} en datos · ${n.t45_bots} en bots · ${n.t40_propuesta} en propuesta · ${n.tarde} tarde (≤30 días) · ${n.sin_vencimiento} sin vencimiento conocido.`,
  ]
  if (!e.preferenciasLeidas) out.push('Preferencias de los clientes no leídas: uso los valores por defecto (40 días, subida 10 %).')
  for (const etapa of VISIBLES) {
    const de = e.lineas.filter((l) => l.etapa === etapa)
    if (de.length === 0) continue
    out.push('', `<b>${esc(ETIQUETA_ETAPA[etapa])}</b>`)
    for (const l of de.slice(0, MAX_LINEAS)) {
      const haria = l.acciones.length ? ` → haría: ${l.acciones.map((a) => QUE_HACE[a]).join('; ')}` : etapa === 'tarde' ? ' → a mano' : ''
      out.push(`${lineaPoliza(l)}${haria}`)
    }
    if (de.length > MAX_LINEAS) out.push(`… y ${de.length - MAX_LINEAS} más.`)
  }
  const subidas = e.lineas.filter((l) => l.subida.estado === 'subida').length
  if (subidas) out.push('', `📈 ${subidas === 1 ? 'Una renovación sube' : `${subidas} renovaciones suben`} por encima del umbral del cliente.`)
  out.push('', 'Avant2 nunca se lanza solo. Nada sale al cliente sin tu ✅.')
  return out.join('\n')
}

/**
 * Resumen DIARIO en modo activo. Lista explícitamente cada póliza con lo hecho hoy. Las propuestas llegan además cada una en
 * su propio Telegram de revisión (con su ✅ por póliza, el de siempre): este resumen no lleva ningún botón que envíe nada. PURA.
 */
export function textoResumenDiario(e: { lineas: readonly LineaPoliza[]; preferenciasLeidas: boolean }): string {
  const hoy = e.lineas.filter((l) => (l.resultados && Object.keys(l.resultados).length > 0) || l.etapa === 'tarde' || l.subida.estado === 'subida')
  const out = ['🔁 <b>Retención de cartera · resumen del día</b>']
  if (!e.preferenciasLeidas) out.push('Preferencias de los clientes no leídas: valores por defecto (40 días, subida 10 %).')
  if (hoy.length === 0) out.push('Hoy no había nada que hacer.')
  const propuestas = hoy.filter((l) => l.resultados?.propuesta === 'preparada')
  if (propuestas.length) {
    out.push('', `<b>Propuestas listas para revisar (${propuestas.length})</b> — cada una tiene su mensaje con ✅:`)
    for (const l of propuestas.slice(0, MAX_LINEAS)) out.push(lineaPoliza(l))
  }
  const resto = hoy.filter((l) => !propuestas.includes(l) && l.etapa !== 'tarde')
  if (resto.length) {
    out.push('', '<b>En marcha</b>')
    for (const l of resto.slice(0, MAX_LINEAS)) {
      const r = Object.entries(l.resultados ?? {}).map(([a, s]) => `${a}: ${esc(String(s))}`).join(' · ')
      out.push(`${lineaPoliza(l)}${r ? ` — ${r}` : ''}`)
    }
  }
  const tarde = hoy.filter((l) => l.etapa === 'tarde')
  if (tarde.length) {
    out.push('', `<b>Tarde (≤30 días, a mano)</b>`)
    for (const l of tarde.slice(0, MAX_LINEAS)) out.push(lineaPoliza(l))
  }
  out.push('', 'Avant2 nunca se lanza solo. Nada sale al cliente sin tu ✅.')
  return out.join('\n')
}

/** Botones del resumen: SOLO enlaces a la póliza en plataforma (con sesión). Ninguno envía nada. Uno por propuesta, máx. 10. PURA. */
export function botonesResumenDiario(lineas: readonly LineaPoliza[], urlPoliza: (polizaId: string) => string): { texto: string; url: string }[][] {
  return lineas
    .filter((l) => l.resultados?.propuesta === 'preparada')
    .slice(0, 10)
    .map((l) => [{ texto: `👁 ${(l.nombre ?? 'Cliente').slice(0, 20)} · ${l.ramo}`, url: urlPoliza(l.polizaId) }])
}
