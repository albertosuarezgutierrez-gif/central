// Gastos RECURRENTES detectados por proveedor + ámbito (piso, 'correduria', 'pilar'…). Puro: sin BD ni reloj.
// Runner: `node --test lib/gastos-recurrentes-detectados.test.ts`.
// (No confundir con `gastos-recurrentes.ts`, que detecta patrones en el banco para la proyección IRPF.)
//
// Detección genérica (sin lista fija de proveedores): un proveedor es recurrente si sus cargos mensuales caen
// a un ritmo regular (cada 1, 2, 3, 6 o 12 meses). Sirve para proyectar los cargos que faltan hasta el 31/12
// por su CALENDARIO real y para avisar cuando uno sube de golpe.
// Regla NULL: sin histórico suficiente NO se inventa recurrencia (no se proyecta nada, no se avisa).

export type GastoHist = { ambito: string; proveedor: string; fecha: string; importe: number; /** Categoría del gasto (`gastos.categoria`), si se conoce. */ categoria?: string | null }

/** Gasto que varía con la ocupación (limpieza, lavandería; Si Que Brilla y El Giraldillo cobran por reserva): su subida no es alarma. */
export const esVariablePorOcupacion = (g: Pick<GastoHist, 'proveedor' | 'categoria'>) =>
  /limpieza|lavander/i.test(g.categoria ?? '') || /brilla|giraldillo|lavander/.test(normalizarProveedor(g.proveedor))
export type Periodicidad = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'

const PERIODOS: [Periodicidad, number][] = [['mensual', 1], ['bimestral', 2], ['trimestral', 3], ['semestral', 6], ['anual', 12]]
/** Mínimo de meses con cargo para dar por recurrente (2 solo si distan exactamente 6 o 12 meses). */
export const MIN_CARGOS = 3
/** Fracción mínima de intervalos que deben coincidir con la periodicidad elegida. */
export const REGULARIDAD_MIN = 0.6

export type Recurrente = {
  ambito: string
  /** Nombre tal cual del cargo más reciente. */
  proveedor: string
  /** Proveedor normalizado (identidad). */
  clave: string
  periodicidad: Periodicidad
  cadaMeses: number
  /** Mediana de los últimos 3 cargos (el importe «habitual»). */
  tipico: number
  /** Total por mes con cargo, cronológico. */
  meses: { mes: string; importe: number }[]
  ultimoMes: string
  /** Día del mes del último cargo (para fechar los proyectados). */
  ultimoDia: number
}

export function normalizarProveedor(p: string): string {
  return p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[.,;:]/g, ' ')
    .replace(/\bayto\b/g, 'ayuntamiento')
    .replace(/\b(s ?a ?u|s ?l ?u|s ?a|s ?l|inc|llc|ltd|sociedad limitada|sociedad anonima)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

const idx = (mes: string) => Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1
const deIdx = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const r2 = (n: number) => Math.round(n * 100) / 100

/** Recurrentes de `hist` (solo cargos con fecha ≤ hoy; los importes ≤ 0 no cuentan). */
export function detectarRecurrentes(hist: GastoHist[], hoy: string): Recurrente[] {
  const grupos = new Map<string, { ambito: string; clave: string; filas: GastoHist[] }>()
  for (const g of hist) {
    if (g.fecha > hoy || !(g.importe > 0)) continue
    const clave = normalizarProveedor(g.proveedor)
    if (!clave) continue
    const k = `${g.ambito}|${clave}`
    const x = grupos.get(k) ?? { ambito: g.ambito, clave, filas: [] }
    x.filas.push(g); grupos.set(k, x)
  }
  const out: Recurrente[] = []
  for (const { ambito, clave, filas } of grupos.values()) {
    filas.sort((a, b) => a.fecha.localeCompare(b.fecha))
    const porMes = new Map<string, number>()
    for (const f of filas) porMes.set(f.fecha.slice(0, 7), r2((porMes.get(f.fecha.slice(0, 7)) ?? 0) + f.importe))
    const meses = [...porMes].map(([mes, importe]) => ({ mes, importe }))
    if (meses.length < 2) continue
    const gaps = meses.slice(1).map((m, i) => idx(m.mes) - idx(meses[i].mes))
    // Periodicidad = el intervalo permitido más frecuente (empate: el más corto).
    let mejor: [Periodicidad, number] | null = null, mejorN = 0
    for (const [nombre, n] of PERIODOS) {
      const c = gaps.filter(g => g === n).length
      if (c > mejorN) { mejorN = c; mejor = [nombre, n] }
    }
    if (!mejor || mejorN / gaps.length < REGULARIDAD_MIN) continue
    if (meses.length < MIN_CARGOS && mejor[1] < 6) continue
    const ult = filas[filas.length - 1]
    out.push({
      ambito, clave, proveedor: ult.proveedor, periodicidad: mejor[0], cadaMeses: mejor[1],
      tipico: r2(mediana(meses.slice(-3).map(m => m.importe))), meses,
      ultimoMes: meses[meses.length - 1].mes, ultimoDia: Math.min(28, Number(ult.fecha.slice(8, 10))),
    })
  }
  return out.sort((a, b) => a.ambito.localeCompare(b.ambito) || a.proveedor.localeCompare(b.proveedor))
}

export type CargoProyectado = { fecha: string; importe: number }
/** Días de cortesía tras la fecha esperada de un cargo antes de darlo por no llegado (cron/factura con retraso). */
export const GRACIA_DIAS = 10
const difDias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
/**
 * Cargos que faltan de `hoy` (excluido) al 31/12/`anio`: desde el último cargo, cada `cadaMeses`.
 * BAJA: si un cargo esperado antes de hoy no llegó (pasada la cortesía), el contrato se da por cancelado
 * (p. ej. PriceLabs, baja 09/08/2026) y NO se proyecta nada (`baja: true`). Un retraso dentro de la cortesía
 * no es baja: cuenta en `atrasados` y se siguen proyectando los futuros.
 */
export function proyectarRecurrente(r: Recurrente, hoy: string, anio: number): { cargos: CargoProyectado[]; atrasados: number; baja: boolean } {
  const cargos: CargoProyectado[] = []
  let atrasados = 0, baja = false
  const fin = idx(`${anio}-12`)
  for (let i = idx(r.ultimoMes) + r.cadaMeses; i <= fin; i += r.cadaMeses) {
    const fecha = `${deIdx(i)}-${String(r.ultimoDia).padStart(2, '0')}`
    if (fecha > hoy) cargos.push({ fecha, importe: r.tipico })
    else { atrasados++; if (difDias(fecha, hoy) > GRACIA_DIAS) baja = true }
  }
  return { cargos: baja ? [] : cargos, atrasados, baja }
}

export type ProyeccionRecurrentes = {
  /** Total proyectado por ámbito (solo ámbitos con algún cargo por venir). */
  porAmbito: Record<string, number>
  detalle: { recurrente: Recurrente; cargos: CargoProyectado[]; atrasados: number; baja: boolean }[]
}
/** `excluir(r)` = ya lo cubre otro concepto de la estimación (gastos_fijos, luz, agua, limpieza…): no se duplica. */
export function proyectarRecurrentes(hist: GastoHist[], hoy: string, anio: number, excluir: (r: Recurrente) => boolean = () => false): ProyeccionRecurrentes {
  const porAmbito: Record<string, number> = {}
  const detalle: ProyeccionRecurrentes['detalle'] = []
  for (const r of detectarRecurrentes(hist, hoy)) {
    if (excluir(r)) continue
    const p = proyectarRecurrente(r, hoy, anio)
    detalle.push({ recurrente: r, ...p })
    const t = p.cargos.reduce((s, c) => s + c.importe, 0)
    if (t > 0) porAmbito[r.ambito] = r2((porAmbito[r.ambito] ?? 0) + t)
  }
  return { porAmbito, detalle }
}

// ── Subidas ────────────────────────────────────────────────────────────────────────────────
export const UMBRAL_SUBIDA = 0.3
export const MIN_SUBIDA_EUR = 20
export const VENTANA_RECIBOS = 6

export type Subida = { recurrente: Recurrente; mes: string; importe: number; media: number; recibos: number; porcentaje: number }
/**
 * Recurrentes con cargo en el mes de `hoy` que superan en ≥30 % y ≥20 € su media de los últimos 6 recibos
 * (cadencia ≥ semestral: el cargo anterior, o sea el mismo periodo del ciclo previo). Exige 3 recibos previos
 * (1 si es semestral/anual). Si el mismo mes del año anterior ya costaba parecido (estacionalidad: luz en
 * invierno), no avisa.
 */
export function detectarSubidas(hist: GastoHist[], hoy: string): Subida[] {
  const mes = hoy.slice(0, 7)
  const out: Subida[] = []
  for (const r of detectarRecurrentes(hist, hoy)) {
    if (r.ultimoMes !== mes) continue
    const actual = r.meses[r.meses.length - 1].importe
    const previos = r.meses.slice(0, -1).slice(-(r.cadaMeses >= 6 ? 1 : VENTANA_RECIBOS)).map(m => m.importe)
    if (previos.length < (r.cadaMeses >= 6 ? 1 : 3)) continue
    const media = previos.reduce((s, x) => s + x, 0) / previos.length
    if (!(actual >= media * (1 + UMBRAL_SUBIDA) && actual - media >= MIN_SUBIDA_EUR)) continue
    const mesAnt = `${Number(mes.slice(0, 4)) - 1}${mes.slice(4)}`
    const antes = r.meses.find(m => m.mes === mesAnt)
    if (antes && actual < antes.importe * (1 + UMBRAL_SUBIDA)) continue // estacional
    out.push({ recurrente: r, mes, importe: actual, media: r2(media), recibos: previos.length, porcentaje: Math.round((actual / media - 1) * 100) })
  }
  return out
}

// ── Proveedor desde un apunte bancario ─────────────────────────────────────────────────────
const RUIDO_BANCO = new Set(['compra', 'en', 'pago', 'con', 'tarjeta', 'de', 'servicios', 'varios', 'adeudo', 'recibo', 'recibos', 'cuota', 'la', 'el', 'n', 'paypal', 'primas', 'inc', 'sl', 'sa', 'sau'])
/**
 * Nombre estable del proveedor de un apunte (contraparte, o concepto si no hay): sin «COMPRA EN», «PAGO CON TARJETA //»,
 * números de adeudo ni asteriscos, y reducido a su primera palabra con contenido. Sinónimos de un mismo cobrador
 * (TGSS = Seguridad Social; Claude = Anthropic) se unifican para que la serie no se parta en dos.
 */
export function proveedorBanco(contraparte: string | null | undefined, concepto: string | null | undefined): string | null {
  const bruto = (contraparte ?? '').trim() || (concepto ?? '').trim()
  if (!bruto) return null
  const tramo = bruto.split('//').map(t => t.trim()).filter(Boolean).pop() ?? bruto
  const t = tramo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/tgss|seguridad social/.test(t)) return 'seguridad social'
  if (/anthropic|claude/.test(t)) return 'anthropic'
  const palabras = t.replace(/[*.,;:#]|nº|n°/g, ' ').split(/\s+/).filter(w => w && !/\d/.test(w) && !RUIDO_BANCO.has(w))
  return palabras[0] ?? null
}
