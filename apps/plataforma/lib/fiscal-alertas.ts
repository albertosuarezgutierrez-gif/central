// Avisos fiscales a ALBERTO por Telegram (puro: sin BD, sin red, sin reloj; `node --test lib/fiscal-alertas.test.ts`).
//
// Cuatro avisos: (1) previsión de base liquidable a 31/12 cerca de / por encima del umbral de 60.000€,
// (2) cuentas sin movimientos hace +30 días, (3) meses CERRADOS sin factura de limpieza/suministros,
// (4) recordatorio de diciembre de acciones antes del 31/12. Más el anti-spam (`decidirEnvios`).
// Regla NULL: un dato que no se sabe sale como «sin dato»; nunca como 0 ni como «todo bien».
import { createHash } from 'node:crypto'
import { eur } from './dinero.ts'
import type { AvisosDatos } from './base-fiscal-devengo.ts'
import { MARGEN_CERCA, PALANCAS_SIMULABLES, ahorroPorPalanca, contribuyenteDe, type PalancaSimulable } from './fiscal-panel.ts'
import {
  CATALOGO_PALANCAS, SIN_PALANCAS, declarar, palancasPorDefecto,
  type CompraPrevista, type EntradaSimulador,
} from './simulador-irpf.ts'

export const VENTANA_DEDUPE_DIAS = 7
const DIA_MS = 86_400_000

export type Alerta = {
  /** Identidad estable del aviso (dedupe). */
  clave: string
  texto: string
  /** true = una vez por clave y año (recordatorio de diciembre): el contenido no cuenta. */
  soloUnaVez?: boolean
}

const dinero = (n: number | null | undefined) => (n == null ? 'sin dato' : eur(n))
const fechaEs = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const mesEs = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`

// ── 1. Umbral de 60.000€ ────────────────────────────────────────────────────────────────────
export type Mejor = { id: PalancaSimulable; nombre: string; ahorro: number }
/** La palanca de mayor ahorro positivo (null si ninguna se sabe o ahorra). */
export function mejorPalanca(ahorros: Partial<Record<PalancaSimulable, number | null>>): Mejor | null {
  let mejor: Mejor | null = null
  for (const id of PALANCAS_SIMULABLES) {
    const a = ahorros[id]
    if (a == null || a <= 0) continue
    if (!mejor || a > mejor.ahorro) mejor = { id, nombre: CATALOGO_PALANCAS[id].nombre, ahorro: a }
  }
  return mejor
}

/**
 * `e` = escenario base de cierre (a 31/12). Avisa si la base liquidable de Alberto en individual, o la conjunta,
 * queda a menos de `MARGEN_CERCA` del umbral o lo supera. Si ninguna se sabe, lo dice (no calla).
 */
export function avisoUmbral(e: EntradaSimulador, compras: CompraPrevista[], anio: number): Alerta | null {
  const ind = contribuyenteDe(declarar(e, SIN_PALANCAS, 'individual'), 'alberto')
  const conj = contribuyenteDe(declarar(e, SIN_PALANCAS, 'conjunta'), 'conjunta')
  const mi = ind?.distanciaUmbral ?? null // umbral − base: negativo = te pasas
  const mc = conj?.distanciaUmbral ?? null
  const clave = `umbral-${anio}`
  if (mi == null && mc == null) {
    return { clave, texto: `⚠️ Umbral 60.000€ (previsión a 31/12): sin dato de base liquidable, ni individual ni conjunta.` }
  }
  const salta = (m: number | null) => m != null && m < MARGEN_CERCA
  if (!salta(mi) && !salta(mc)) return null

  const linea = (nombre: string, base: number | null, m: number | null) =>
    m == null ? `${nombre}: sin dato`
      : m < 0 ? `${nombre}: ${dinero(base)}, por ENCIMA en ${dinero(-m)}`
        : `${nombre}: ${dinero(base)}, margen ${dinero(m)}`
  const lineas = [
    `⚠️ Umbral 60.000€ (previsión a 31/12)`,
    linea('Alberto individual', ind?.baseLiquidable ?? null, mi),
    linea('Conjunta', conj?.baseLiquidable ?? null, mc),
  ]
  const mejor = mejorPalanca(ahorroPorPalanca(e, palancasPorDefecto(e), compras, 'alberto'))
  lineas.push(mejor ? `Mejor palanca: ${mejor.nombre}, ahorra ${dinero(mejor.ahorro)}.` : `Mejor palanca: sin dato o sin ahorro.`)
  return { clave, texto: lineas.join('\n') }
}

// ── 2 y 3. Calidad del dato (las mismas listas que el panel: `AvisosDatos`) ─────────────────
/** Meses con `YYYY-MM` estrictamente anteriores al de `hoy`: el mes en curso aún no se puede dar por «sin factura». */
export const soloCerrados = (meses: string[], hoy: string) => meses.filter(m => m < hoy.slice(0, 7))

/**
 * Cuentas cuyos cargos ya salen en otra cuenta que sí sincroniza → no se avisa por ellas (Alberto, 31/10/2026:
 * la «tarjeta Kutxabank» es de DÉBITO de la cuenta Kutxabank de pisos). Único sitio: añadir aquí si hay más.
 */
export const CUENTAS_CUBIERTAS_POR: { cuenta: RegExp; madre: string }[] = [
  { cuenta: /tarjeta.*kutxa|kutxa.*tarjeta/i, madre: 'Kutxabank (pisos)' },
]
export const estaCubierta = (nombre: string) => CUENTAS_CUBIERTAS_POR.some(c => c.cuenta.test(nombre))
/** BBVA (Dúplex y correduría) y las de Pilar no sincronizan: se pide el extracto; el resto, reconectar. */
export const esPorExtracto = (nombre: string) => /bbva|pilar/i.test(nombre)

export function avisoCuentas(a: AvisosDatos, anio: number): Alerta | null {
  const pendientes = a.cuentasSinActualizar.filter(c => !estaCubierta(c.nombre))
  if (!pendientes.length) return null
  const filas = pendientes.map(c => {
    const accion = esPorExtracto(c.nombre) ? 'envía el extracto para importarlo' : 'reconecta'
    return c.dias == null ? `• ${c.nombre}: sin movimientos registrados, ${accion}`
      : `• ${c.nombre}: último movimiento ${fechaEs(c.ultimoMovimiento ?? '')} (hace ${c.dias} días), ${accion}`
  })
  return { clave: `cuentas-${anio}`, texto: [`🏦 Cuentas sin movimientos hace más de 30 días`, ...filas].join('\n') }
}

export function avisoFacturasMeses(a: AvisosDatos, hoy: string, anio: number): Alerta | null {
  const limp = soloCerrados(a.mesesSinLimpieza, hoy)
  const sum = soloCerrados(a.mesesSinSuministros, hoy)
  if (!limp.length && !sum.length) return null
  const lineas = [`🧾 Meses cerrados sin factura`]
  if (limp.length) lineas.push(`• Limpieza: ${limp.map(mesEs).join(', ')}`)
  if (sum.length) lineas.push(`• Suministros: ${sum.map(mesEs).join(', ')}`)
  return { clave: `facturas-meses-${anio}`, texto: lineas.join('\n') }
}

// ── 4. Diciembre ────────────────────────────────────────────────────────────────────────────
/** Del 1 al 31 de diciembre (`hoy` = 'YYYY-MM-DD'). Un recordatorio único por año. */
export function avisoDiciembre(e: EntradaSimulador, compras: CompraPrevista[], hoy: string, anio: number): Alerta | null {
  if (hoy.slice(0, 4) !== String(anio) || hoy.slice(5, 7) !== '12') return null
  const ah = ahorroPorPalanca(e, palancasPorDefecto(e), compras, 'alberto')
  const fila = (txt: string, a: number | null) => `• ${txt}${a == null ? ': sin dato' : a > 0 ? `: ahorra ${dinero(a)}` : ''}`
  return {
    clave: `diciembre-${anio}`, soloUnaVez: true,
    texto: [
      `📅 Antes del 31/12: acciones fiscales`,
      fila('Plan de pensiones de Pilar (aportación de Alberto)', ah.plan_conyuge),
      fila('Donativos', ah.donativos),
      fila(`Reparaciones previstas${compras.length ? ` (${compras.length})` : ''}`, ah.compras),
    ].join('\n'),
  }
}

/** Los cuatro avisos (los que no apliquen, fuera). `avisos` y `e` salen del panel (`armarPanel`). */
export function construirAlertas(p: {
  hoy: string; anio: number; entrada: EntradaSimulador | null; avisos: AvisosDatos | null; compras: CompraPrevista[]
}): Alerta[] {
  const out: (Alerta | null)[] = []
  if (p.entrada) { out.push(avisoUmbral(p.entrada, p.compras, p.anio), avisoDiciembre(p.entrada, p.compras, p.hoy, p.anio)) }
  if (p.avisos) { out.push(avisoCuentas(p.avisos, p.anio), avisoFacturasMeses(p.avisos, p.hoy, p.anio)) }
  return out.filter((a): a is Alerta => a != null)
}

// ── Anti-spam ───────────────────────────────────────────────────────────────────────────────
export const hashTexto = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 32)
export type EnvioPrevio = { clave: string; hash: string; enviadoAt: Date }

/**
 * No repetir el mismo aviso (clave + contenido) en `ventanaDias` días; los `soloUnaVez` no se repiten en
 * 365 días aunque cambie el contenido. Contenido distinto = aviso nuevo (la situación ha cambiado).
 */
export function decidirEnvios(alertas: Alerta[], previos: EnvioPrevio[], ahora: Date, ventanaDias = VENTANA_DEDUPE_DIAS): Alerta[] {
  return alertas.filter(a => {
    const h = hashTexto(a.texto)
    const dias = a.soloUnaVez ? 365 : ventanaDias
    return !previos.some(p => p.clave === a.clave && (a.soloUnaVez || p.hash === h) && ahora.getTime() - p.enviadoAt.getTime() < dias * DIA_MS)
  })
}
