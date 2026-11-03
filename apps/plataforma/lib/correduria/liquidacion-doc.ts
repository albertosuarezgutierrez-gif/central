// Lector de LIQUIDACIONES / EXTRACTOS de comisiones que llegan por correo (PDF) al agente de facturas.
// Módulo PURO (sin BD ni red): `node --test lib/correduria/liquidacion-doc.test.ts`.
//
// 🚨 Por qué existe (03/11/2026). `procesar.ts` descartaba estos documentos como «no es gasto» y se
// perdían el bruto y la retención: justo lo que va a la renta. Ahora se GUARDAN (tabla
// `comisiones_liquidacion_docs`) y el cron `cima-liq` los usa como fuente del eje LIQUIDADO del libro
// (`comisiones_devengo`, `liq_origen = 'pdf'`) en los periodos que CIMA no cubre. CIMA manda siempre:
// un PDF nunca pisa un periodo que ya trae el extracto oficial de TIREA.
//
// Regla Allianz (mediador 0018638), por prefijo del fichero:
//   · `ADYP_*` = extracto mensual de cuenta del mediador → LIQUIDACIÓN real (cuenta).
//   · `ADXP_*` = aviso por recibo → INFORMATIVO: ya está dentro del ADYP del mes; nunca se suma.
//   · `AMYA_*` = cartera prevista (no cobrada) → se IGNORA (ni se guarda).
// El resto de compañías: su liquidación cuenta como extracto (formato desconocido: lo lee la IA).
//
// 🚨 Tres estados: un importe que no consta es `null`, nunca 0. Y el periodo se lee del CUERPO del
// documento (lo da la IA); jamás se inventa del asunto ni de la fecha del correo (ver `pdf-allianz.ts`).
import { NOMBRE_POR_CODIGO_DGS } from '../comisiones-asegura.ts'

export type ClaseLiquidacion =
  /** Extracto/liquidación que CUENTA (Allianz ADYP o la liquidación de otra compañía). */
  | 'extracto'
  /** Aviso por recibo (Allianz ADXP): devengo informativo, ya incluido en el extracto del mes. */
  | 'aviso_recibo'
  /** Cartera prevista (Allianz AMYA): no es dinero cobrado. No se guarda. */
  | 'cartera_prevista'

/** Lo que la IA devuelve en `liquidacion` (todo opcional: la IA puede no darlo). */
export interface LiquidacionIA {
  compania?: unknown
  numero_documento?: unknown
  periodo_inicio?: unknown
  periodo_fin?: unknown
  bruto?: unknown
  retencion?: unknown
  otros_descuentos?: unknown
  neto?: unknown
  saldo_anterior?: unknown
}

export interface EntradaLiquidacion {
  liquidacion?: LiquidacionIA | null
  proveedor?: string | null
  concepto?: string | null
  numero_factura?: string | null
  fecha?: string | null
  /** Respaldo si la IA no dio el bloque `liquidacion`: solo se usan si cuadran entre sí. */
  base_imponible?: number | null
  irpf?: number | null
  total?: number | null
}

export interface LiquidacionLeida {
  clase: ClaseLiquidacion
  /** Código DGS (`C0109`) si la compañía está en el mapa; `null` = no se conoce el código. */
  companiaCodigo: string | null
  /** Nombre legible. `null` = no se sabe de qué compañía es. */
  compania: string | null
  /** Clave de dedupe de la compañía: el código DGS o el nombre en minúsculas. */
  companiaClave: string | null
  numeroDocumento: string | null
  periodoInicio: string | null
  periodoFin: string | null
  fechaDocumento: string | null
  bruto: number | null
  retencion: number | null
  otrosDescuentos: number | null
  neto: number | null
  saldoAnterior: number | null
  /** `true` = bruto − retención − otros = neto (±1 céntimo). `false` = no cuadra. `null` = faltan importes. */
  aritmeticaOk: boolean | null
}

/** Margen de la aritmética interna del extracto (redondeos de céntimo, como `cuadre.ts`). */
export const TOLERANCIA_ARITMETICA_DOC = 0.011

/** Clase por el prefijo del fichero (solo Allianz los usa). `null` = el nombre no lo dice. */
export function claseAllianzPorNombre(nombreArchivo: string | null | undefined): ClaseLiquidacion | null {
  const n = (nombreArchivo ?? '').trim().split(/[\\/]/).pop() ?? ''
  if (/^ADYP[_-]/i.test(n)) return 'extracto'
  if (/^ADXP[_-]/i.test(n)) return 'aviso_recibo'
  if (/^AMYA[_-]/i.test(n)) return 'cartera_prevista'
  return null
}

/** Compañías que pueden mandar liquidación por correo. El nombre es el de `NOMBRE_POR_CODIGO_DGS` cuando existe. */
const COMPANIAS: Array<[RegExp, string]> = [
  [/\ballianz\b/i, 'Allianz'],
  [/\bmapfre\b/i, 'Mapfre'],
  [/\b(occident|catalana\s+occidente|seguros\s+catalana)\b/i, 'Occident'],
  [/\bgenerali\b/i, 'Generali'],
  [/\breale\b/i, 'Reale'],
  [/\bcaser\b/i, 'Caser'],
  [/\basisa\b/i, 'Asisa'],
  [/\bpelayo\b/i, 'Pelayo'],
  [/\baegon\b/i, 'Aegon'],
  [/\baxa\b/i, 'AXA'],
  [/\bmbi\b/i, 'MBI'],
  [/\bz[uü]rich\b/i, 'Zurich'],
  [/\bhelvetia\b/i, 'Helvetia'],
  [/\bliberty\b/i, 'Liberty'],
  [/\bplus\s*ultra\b/i, 'Plus Ultra'],
  [/\bmutua\b/i, 'Mutua'],
]

const CODIGO_POR_NOMBRE = new Map(
  Object.entries(NOMBRE_POR_CODIGO_DGS).map(([codigo, nombre]) => [nombre.toLowerCase(), codigo]),
)

/** Nombre de la compañía a partir de lo que diga el documento. `null` si no se reconoce. */
export function companiaDeTexto(texto: string): string | null {
  for (const [re, nombre] of COMPANIAS) if (re.test(texto)) return nombre
  return null
}

/** Importe leído por la IA → número. Texto español («1.234,56») también. Ilegible → `null`, nunca 0. */
export function importe(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null
  if (typeof v !== 'string') return null
  const s = v.replace(/€|\s/g, '')
  if (!s) return null
  const limpio = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null
  return Math.round(Number(limpio) * 100) / 100
}

function fechaIso(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`))) return t
  const m = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(t)
  if (m) return fechaIso(`${m[3]}-${m[2]}-${m[1]}`)
  return null
}

function texto(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const t = String(v).trim()
  return t && t.toLowerCase() !== 'null' ? t : null
}

/** Nombre del fichero sin extensión: el nº de documento de Allianz (`ADYP_<AAMMDD>_A<mediador>_…`). */
function tronco(nombreArchivo: string | null | undefined): string | null {
  const n = (nombreArchivo ?? '').trim().split(/[\\/]/).pop() ?? ''
  const sin = n.replace(/\.[a-z0-9]{2,4}$/i, '')
  return sin || null
}

/**
 * Lee la liquidación de lo que extrajo la IA. Devuelve `null` si el documento es cartera prevista
 * (AMYA): no se guarda nada.
 */
export function leerLiquidacion(e: EntradaLiquidacion, nombreArchivo?: string | null): LiquidacionLeida | null {
  const porNombre = claseAllianzPorNombre(nombreArchivo)
  if (porNombre === 'cartera_prevista') return null
  const l = e.liquidacion ?? {}

  const compania = porNombre
    ? 'Allianz'
    : companiaDeTexto(`${texto(l.compania) ?? ''} ${e.proveedor ?? ''}`) ?? companiaDeTexto(e.concepto ?? '')
  const companiaCodigo = compania ? CODIGO_POR_NOMBRE.get(compania.toLowerCase()) ?? null : null

  let bruto = importe(l.bruto)
  let retencion = importe(l.retencion)
  const otrosDescuentos = importe(l.otros_descuentos)
  let neto = importe(l.neto)
  // Respaldo: sin bloque `liquidacion`, la IA suele dejar bruto/IRPF/neto en base/irpf/total. Solo se
  // aceptan si cuadran entre sí al céntimo: si no, mejor `null` que un número con forma de dato.
  if (bruto == null && retencion == null && neto == null) {
    const b = importe(e.base_imponible), r = importe(e.irpf), t = importe(e.total)
    if (b != null && r != null && t != null && Math.abs(b - r - t) <= TOLERANCIA_ARITMETICA_DOC) {
      bruto = b; retencion = r; neto = t
    }
  }

  const aritmeticaOk = bruto != null && retencion != null && neto != null
    ? Math.abs(bruto - retencion - (otrosDescuentos ?? 0) - neto) <= TOLERANCIA_ARITMETICA_DOC
    : null

  const periodoInicio = fechaIso(l.periodo_inicio)
  const periodoFin = fechaIso(l.periodo_fin)
  const periodoValido = periodoInicio != null && periodoFin != null && periodoInicio <= periodoFin

  return {
    clase: porNombre ?? 'extracto',
    companiaCodigo,
    compania,
    companiaClave: companiaCodigo ?? (compania ? compania.toLowerCase() : null),
    // Allianz: el nombre del fichero ES el documento (único por mes y mediador). Los demás: el nº que
    // rotule el documento; si no, el del fichero.
    numeroDocumento: porNombre ? tronco(nombreArchivo) : texto(l.numero_documento) ?? texto(e.numero_factura) ?? tronco(nombreArchivo),
    periodoInicio: periodoValido ? periodoInicio : null,
    periodoFin: periodoValido ? periodoFin : null,
    fechaDocumento: fechaIso(e.fecha),
    bruto,
    retencion,
    otrosDescuentos,
    neto,
    saldoAnterior: importe(l.saldo_anterior),
    aritmeticaOk,
  }
}

/**
 * ¿Es sin duda una liquidación al MEDIADOR? Retención de IRPF > 0 y aritmética que cuadra: un recibo
 * de prima de un seguro propio (Occident/ASISA de la lista blanca) no lleva retención. Lo usa
 * `procesar.ts` para no mandar a la bandeja la liquidación de una compañía que también asegura a Alberto.
 */
export function esLiquidacionInequivoca(l: LiquidacionLeida | null): boolean {
  return l != null && l.aritmeticaOk === true && l.retencion != null && l.retencion > 0
}

/** Id del fichero de Drive a partir de su URL (`/file/d/<id>/`). `null` si no se reconoce. */
export function driveFileId(url: string | null | undefined): string | null {
  const m = /\/file\/d\/([A-Za-z0-9_-]+)/.exec(url ?? '') ?? /[?&]id=([A-Za-z0-9_-]+)/.exec(url ?? '')
  return m ? m[1] : null
}

// ── Fusión con el libro (`comisiones_devengo`) ─────────────────────────────────────────────────────

/** Una fila del libro tal como la arma el cron `cima-liq` antes de escribirla. */
export interface FilaLibro {
  codigo: string
  inicio: string
  fin: string
  bruto: number | null
  ret: number | null
  remesa: number | null
  hash: string | null
  /** De dónde sale el eje LIQUIDADO: `'cima'` (TIREA) o `'pdf'` (correo). */
  origen: 'cima' | 'pdf'
}

/** Un documento guardado, tal como se lee de `comisiones_liquidacion_docs`. */
export interface DocGuardado {
  companiaCodigo: string | null
  clase: ClaseLiquidacion
  numeroDocumento: string
  periodoInicio: string | null
  periodoFin: string | null
  fechaDocumento: string | null
  bruto: number | null
  retencion: number | null
  neto: number | null
  aritmeticaOk: boolean | null
}

export type MotivoDocNoUsado =
  | 'sin-codigo'          // compañía sin código DGS: no puede entrar en el libro (se queda en la tabla de docs)
  | 'sin-periodo'         // la IA no leyó el periodo: no se inventa
  | 'sin-importes'        // falta bruto o neto
  | 'aritmetica'          // bruto − retención − otros ≠ neto: lectura dudosa, no se usa
  | 'cima-manda'          // CIMA ya trae la liquidación de ese periodo
  | 'manual-manda'        // Alberto confirmó a mano la liquidación de ese periodo (`/api/correduria/comisiones/confirmar`)
  | 'solapa-otro-pdf'     // otro extracto PDF de la misma compañía ya cubre ese periodo

export interface ResultadoFusion {
  filas: FilaLibro[]
  usados: string[]
  noUsados: Array<{ numeroDocumento: string; motivo: MotivoDocNoUsado }>
  /** Avisos ADXP de meses SIN extracto: devengo informativo. Nunca se suman al libro. */
  informativos: Array<{ codigo: string | null; mes: string; bruto: number | null; avisos: number }>
}

function solapan(a1: string, a2: string, b1: string, b2: string): boolean {
  return a1 <= b2 && b1 <= a2
}

/**
 * Añade al libro los extractos PDF en los periodos que CIMA no cubre. PURA.
 * Se llama ANTES de añadir las filas de «solo devengo»: así un mes cubierto por un PDF no queda
 * además como fila suelta (se contaría dos veces).
 */
export function fusionarExtractosPdf(
  filasCima: readonly FilaLibro[],
  docs: readonly DocGuardado[],
  /** Periodos con liquidación confirmada A MANO: un PDF no la pisa. */
  manuales: ReadonlyArray<{ codigo: string; inicio: string; fin: string }> = [],
): ResultadoFusion {
  const filas = filasCima.map(f => ({ ...f }))
  const usados: string[] = []
  const noUsados: ResultadoFusion['noUsados'] = []

  const extractos = docs
    .filter(d => d.clase === 'extracto')
    // Orden estable: el más reciente primero (una corrección de la compañía manda sobre el original).
    .sort((a, b) => (b.fechaDocumento ?? '').localeCompare(a.fechaDocumento ?? '') || a.numeroDocumento.localeCompare(b.numeroDocumento))

  for (const d of extractos) {
    const no = (motivo: MotivoDocNoUsado) => noUsados.push({ numeroDocumento: d.numeroDocumento, motivo })
    if (!d.companiaCodigo) { no('sin-codigo'); continue }
    if (!d.periodoInicio || !d.periodoFin) { no('sin-periodo'); continue }
    if (d.bruto == null || d.neto == null) { no('sin-importes'); continue }
    if (d.aritmeticaOk === false) { no('aritmetica'); continue }
    if (manuales.some(m => m.codigo === d.companiaCodigo && solapan(m.inicio, m.fin, d.periodoInicio as string, d.periodoFin as string))) { no('manual-manda'); continue }
    const solapadas = filas.filter(f => f.codigo === d.companiaCodigo && solapan(f.inicio, f.fin, d.periodoInicio as string, d.periodoFin as string))
    if (solapadas.some(f => f.origen === 'cima' && f.bruto != null)) { no('cima-manda'); continue }
    if (solapadas.some(f => f.origen === 'pdf')) { no('solapa-otro-pdf'); continue }
    const exacta = solapadas.find(f => f.inicio === d.periodoInicio && f.fin === d.periodoFin)
    const valores = { bruto: d.bruto, ret: d.retencion, remesa: d.neto, hash: `pdf:${d.numeroDocumento}`, origen: 'pdf' as const }
    if (exacta) Object.assign(exacta, valores)
    else filas.push({ codigo: d.companiaCodigo, inicio: d.periodoInicio, fin: d.periodoFin, ...valores })
    usados.push(d.numeroDocumento)
  }

  // ADXP: informativo y SOLO en meses sin extracto (ni CIMA ni PDF). Con el extracto del mes ya está
  // dentro de él: sumarlo sería contarlo dos veces.
  const porMes = new Map<string, { codigo: string | null; mes: string; bruto: number | null; avisos: number }>()
  for (const d of docs) {
    if (d.clase !== 'aviso_recibo') continue
    const fecha = d.periodoInicio ?? d.fechaDocumento
    if (!fecha) continue
    const mes = fecha.slice(0, 7)
    const primer = `${mes}-01`, ultimo = finDeMesIso(mes)
    const cubierto = filas.some(f => f.codigo === d.companiaCodigo && f.bruto != null && solapan(f.inicio, f.fin, primer, ultimo))
    if (cubierto) continue
    const k = `${d.companiaCodigo ?? '?'}|${mes}`
    const acc = porMes.get(k) ?? { codigo: d.companiaCodigo, mes, bruto: 0 as number | null, avisos: 0 }
    acc.avisos++
    // Un aviso sin importe deja el total en «no se sabe», no lo rebaja.
    acc.bruto = acc.bruto == null || d.bruto == null ? null : Math.round((acc.bruto + d.bruto) * 100) / 100
    porMes.set(k, acc)
  }

  return { filas, usados, noUsados, informativos: [...porMes.values()] }
}

function finDeMesIso(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}
