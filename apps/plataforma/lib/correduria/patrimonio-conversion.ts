// Panel de conversión de Patrimonio para Alberto (27/10/2026, ESTUDIO-PATRIMONIO-MERCADO §7 punto 10): por titular con
// patrimonio en el portal, qué cuesta (lecturas de IA) frente a qué aporta (pólizas en vigor, pólizas nuevas, comisión).
//
// PURO: intérprete del puerto de asegura + agregación. Sin BD, sin red, sin reloj (`ahora` entra por parámetro).
//
// ── Contrato con asegura (puerto, SOLO LECTURA): GET /api/operador/patrimonio-conversion?desdeMes=<ISO> ──────────────
//   { estado: 'ok', titulares: [{
//       titularId, clienteId, cliente, activoDesde (ISO: `portal_patrimonio_titular.creado_en`),
//       inmuebles: n|null      // filas no archivadas SIN padre (sueltos + edificios)
//       unidades:  n|null      // filas no archivadas con `inmueble_padre_id` (null: la columna aún no existe en la BD)
//       lecturas: { facturasTotal, facturasMes, volcadosTotal|null, volcadosMes|null }   // volcado=true: null si falta la columna
//       polizas: [{ importRef, eiacXmlHash, estado, sustituidaAt, mergedIntoPolizaId, creadaEn }] | null   // fichas del titular
//       recibos: [{ fecha, comisionBruta }] | null   // `poliza_recibos` de esas pólizas (fecha = fecha_emision ?? fecha_efecto_actual)
//   }] }
//   `desdeMes` = inicio del mes de Madrid (`inicioMesMadrid`) para que asegura cuente "el mes" con el mismo corte que el portal.
//
// 🚨 Tres estados, nunca colapsados (null pendiente · 0 revisado · dato):
//   · Pólizas: SIEMPRE `esCarteraEnVigor()` (nunca `clientes.tipo`); una fusionada en otra no cuenta (se contaría dos veces).
//   · COMISIÓN: NO hay comisión anual consolidada (el cupo de IA lo dice: anualizar recibos no es fiable). Aquí solo se suma
//     `comision_bruta` de los recibos de los ÚLTIMOS 12 MESES, y así se rotula. Sin recibos o sin ninguno legible → `null`
//     («sin dato»), jamás 0,00€. Los importes EIAC van por `importeEiac()` (texto: un ilegible no es 0, se cuenta aparte).
//   · Lecturas: sin la columna `volcado` el total de volcados es `null` → el total es un SUELO (`completas: false`).
import { esCarteraEnVigor, importeEiac } from '@central/module-seguros'
import { costeEstimadoIa, type CosteEstimadoIa } from './patrimonio-coste-ia.ts'

// ── Tipos de entrada (ya validados) ──────────────────────────────────────────

export type PolizaConversion = {
  importRef: string | null
  eiacXmlHash: string | null
  estado: string | null
  sustituidaAt: string | null
  mergedIntoPolizaId: string | null
  /** `polizas.created_at` (ISO). `null` = no consta. */
  creadaEn: string | null
}
export type ReciboConversion = { fecha: string | null; comisionBruta: string | null }

export type TitularConversion = {
  titularId: string
  clienteId: string
  cliente: string
  activoDesde: string
  inmuebles: number | null
  unidades: number | null
  lecturas: { facturasTotal: number; facturasMes: number; volcadosTotal: number | null; volcadosMes: number | null }
  polizas: PolizaConversion[] | null
  recibos: ReciboConversion[] | null
}

export type LecturaConversionPuerto =
  | { estado: 'ok'; titulares: TitularConversion[] }
  | { estado: 'sin_configurar' }
  | { estado: 'sin_correduria' }
  | { estado: 'error'; motivo: string }

// ── Intérprete ───────────────────────────────────────────────────────────────

const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)
const fechaIso = (v: unknown): string | null => {
  const s = cadena(v)
  return s !== null && !Number.isNaN(Date.parse(s)) ? s : null
}
const registro = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

function leerPoliza(v: unknown): PolizaConversion | null {
  const o = registro(v)
  if (!o) return null
  return {
    importRef: cadena(o.importRef), eiacXmlHash: cadena(o.eiacXmlHash), estado: cadena(o.estado),
    sustituidaAt: cadena(o.sustituidaAt), mergedIntoPolizaId: cadena(o.mergedIntoPolizaId), creadaEn: fechaIso(o.creadaEn),
  }
}
function leerRecibo(v: unknown): ReciboConversion | null {
  const o = registro(v)
  if (!o) return null
  // Una fecha o un importe ilegibles NO descartan el recibo: se cuentan como «sin leer» más abajo.
  return { fecha: fechaIso(o.fecha), comisionBruta: typeof o.comisionBruta === 'string' ? o.comisionBruta : null }
}

export function leerTitular(v: unknown): TitularConversion | null {
  const o = registro(v)
  if (!o) return null
  const titularId = cadena(o.titularId), clienteId = cadena(o.clienteId), cliente = cadena(o.cliente), activoDesde = fechaIso(o.activoDesde)
  const l = registro(o.lecturas)
  const facturasTotal = entero(l?.facturasTotal), facturasMes = entero(l?.facturasMes)
  if (!titularId || !clienteId || !cliente || !activoDesde || facturasTotal === null || facturasMes === null) return null
  const lista = <T,>(x: unknown, leer: (e: unknown) => T | null): T[] | null => {
    if (!Array.isArray(x)) return null
    const r = x.map(leer)
    return r.some((e) => e === null) ? null : (r as T[])
  }
  return {
    titularId, clienteId, cliente, activoDesde,
    inmuebles: entero(o.inmuebles), unidades: entero(o.unidades),
    lecturas: { facturasTotal, facturasMes, volcadosTotal: entero(l?.volcadosTotal), volcadosMes: entero(l?.volcadosMes) },
    // Una lista rota entera = «no se pudo leer» (null), no una lista recortada que subestime.
    polizas: lista(o.polizas, leerPoliza),
    recibos: lista(o.recibos, leerRecibo),
  }
}

/** Un titular ilegible no se esconde: si falta uno, la lista no es la lista. */
export function interpretarConversion(status: number, json: unknown): LecturaConversionPuerto {
  const j = registro(json)
  if (status === 404) return { estado: 'error', motivo: 'asegura aún no tiene /api/operador/patrimonio-conversion desplegado' }
  if (status === 200 && j?.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (status === 200 && j?.estado === 'sin_correduria') return { estado: 'sin_correduria' }
  if (status !== 200 || j?.estado !== 'ok' || !Array.isArray(j.titulares)) {
    const causa = typeof j?.causa === 'string' ? ` (${j.causa})` : ''
    return { estado: 'error', motivo: `HTTP ${status}${causa}` }
  }
  const titulares = j.titulares.map(leerTitular)
  if (titulares.some((t) => t === null)) return { estado: 'error', motivo: 'asegura devolvió un titular incompleto' }
  return { estado: 'ok', titulares: titulares as TitularConversion[] }
}

// ── Reloj de Madrid ──────────────────────────────────────────────────────────

const PARTES_MADRID = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
function partesMadrid(d: Date) {
  const p = Object.fromEntries(PARTES_MADRID.formatToParts(d).map((x) => [x.type, Number(x.value)]))
  return { año: p.year, mes: p.month, dia: p.day, hora: p.hour }
}

/** Instante en que empieza el mes en curso en Madrid (00:00 hora de Madrid del día 1), el corte del cupo mensual del portal. */
export function inicioMesMadrid(ahora: Date): Date {
  const { año, mes } = partesMadrid(ahora)
  for (const horasDesfase of [1, 2]) {
    const c = new Date(Date.UTC(año, mes - 1, 1) - horasDesfase * 3_600_000)
    const m = partesMadrid(c)
    if (m.mes === mes && m.dia === 1 && m.hora === 0) return c
  }
  return new Date(Date.UTC(año, mes - 1, 1)) // inalcanzable con Europe/Madrid (UTC+1/+2); red de seguridad
}

// ── Agregación ───────────────────────────────────────────────────────────────

export type ComisionRecibos = {
  /** Suma de `comision_bruta` de los recibos de los últimos 12 meses. NO es la comisión anual consolidada. */
  euros: number
  /** Recibos de la ventana con importe legible (los que suman). */
  recibos: number
  /** Recibos de la ventana cuyo importe no se pudo leer (no suman, ni como 0). */
  ilegibles: number
}

export type FilaConversion = {
  titularId: string
  clienteId: string
  cliente: string
  activoDesde: string
  inmuebles: number | null
  unidades: number | null
  lecturasMes: number
  lecturasTotal: number
  /** `false`: falta el recuento de volcados (columna sin aplicar); los totales son un SUELO. */
  lecturasCompletas: boolean
  costeMes: CosteEstimadoIa | null
  costeTotal: CosteEstimadoIa | null
  /** `null` = no se pudieron leer las pólizas (≠ 0). */
  polizasEnVigor: number | null
  /** En vigor y creadas en la cartera desde `activoDesde`. `null` = no se sabe (lectura fallida o alguna sin fecha). */
  polizasNuevas: number | null
  /** `null` = «sin dato»: no hay recibos en 12 meses, ninguno legible, o no se pudieron leer. */
  comision: ComisionRecibos | null
  /** Por qué `comision` es `null` (para decirlo en pantalla). */
  comisionMotivo: 'no_leidos' | 'sin_recibos' | 'ilegibles' | null
}

export type ResumenConversion = {
  titulares: number
  lecturasMes: number
  lecturasTotal: number
  lecturasCompletas: boolean
  costeTotalEuros: number
  costeTotalEsSuelo: boolean
  /** `null` si ningún titular tiene las pólizas legibles. */
  polizasEnVigor: number | null
  polizasNuevas: number | null
  /** Suma de las comisiones conocidas; `titularesSinComision` dice a cuántos les falta (la cifra es un suelo). */
  comisionEuros: number | null
  titularesSinComision: number
}

const MS_DIA = 86_400_000

function comisionDoce(recibos: readonly ReciboConversion[] | null, ahora: Date): { comision: ComisionRecibos | null; motivo: FilaConversion['comisionMotivo'] } {
  if (recibos === null) return { comision: null, motivo: 'no_leidos' }
  const hasta = ahora.getTime()
  const desde = new Date(ahora); desde.setUTCFullYear(desde.getUTCFullYear() - 1)
  let euros = 0, leidos = 0, ilegibles = 0, enVentana = 0
  for (const r of recibos) {
    const t = r.fecha === null ? NaN : Date.parse(r.fecha)
    // Sin fecha legible no se sabe si cae en la ventana: cuenta como ilegible (no suma, no se esconde).
    if (Number.isNaN(t)) { ilegibles++; enVentana++; continue }
    if (t < desde.getTime() || t > hasta + MS_DIA) continue
    enVentana++
    const n = importeEiac(r.comisionBruta)
    if (n === null) { ilegibles++; continue }
    euros += n; leidos++
  }
  if (enVentana === 0) return { comision: null, motivo: 'sin_recibos' }
  if (leidos === 0) return { comision: null, motivo: 'ilegibles' }
  return { comision: { euros: Math.round(euros * 100) / 100, recibos: leidos, ilegibles }, motivo: null }
}

export function filaConversion(t: TitularConversion, ahora: Date): FilaConversion {
  const { facturasTotal, facturasMes, volcadosTotal, volcadosMes } = t.lecturas
  const desdeActivo = Date.parse(t.activoDesde)
  let polizasEnVigor: number | null = null
  let polizasNuevas: number | null = null
  if (t.polizas !== null) {
    const vigor = t.polizas.filter((p) => p.mergedIntoPolizaId === null && esCarteraEnVigor({ importRef: p.importRef, eiacXmlHash: p.eiacXmlHash, estado: p.estado, sustituidaAt: p.sustituidaAt }))
    polizasEnVigor = vigor.length
    // Una póliza sin fecha de alta no se asigna a «antes» ni a «después»: sin ella el número no es fiable.
    polizasNuevas = vigor.some((p) => p.creadaEn === null) ? null : vigor.filter((p) => Date.parse(p.creadaEn as string) >= desdeActivo).length
  }
  const { comision, motivo } = comisionDoce(t.recibos, ahora)
  return {
    titularId: t.titularId, clienteId: t.clienteId, cliente: t.cliente, activoDesde: t.activoDesde,
    inmuebles: t.inmuebles, unidades: t.unidades,
    lecturasMes: facturasMes + (volcadosMes ?? 0),
    lecturasTotal: facturasTotal + (volcadosTotal ?? 0),
    lecturasCompletas: volcadosTotal !== null && volcadosMes !== null,
    costeMes: costeEstimadoIa({ facturas: facturasMes, volcados: volcadosMes }),
    costeTotal: costeEstimadoIa({ facturas: facturasTotal, volcados: volcadosTotal }),
    polizasEnVigor, polizasNuevas, comision, comisionMotivo: motivo,
  }
}

/** Más valor primero (pólizas en vigor; `null` al final), luego más lecturas, luego nombre: orden estable y explicable. */
export function ordenarConversion(filas: readonly FilaConversion[]): FilaConversion[] {
  return [...filas].sort((a, b) =>
    (b.polizasEnVigor ?? -1) - (a.polizasEnVigor ?? -1) || b.lecturasTotal - a.lecturasTotal || a.cliente.localeCompare(b.cliente, 'es'))
}

export function resumirConversion(filas: readonly FilaConversion[]): ResumenConversion {
  const suma = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : null)
  const conComision = filas.filter((f) => f.comision !== null)
  return {
    titulares: filas.length,
    lecturasMes: filas.reduce((a, f) => a + f.lecturasMes, 0),
    lecturasTotal: filas.reduce((a, f) => a + f.lecturasTotal, 0),
    lecturasCompletas: filas.every((f) => f.lecturasCompletas),
    costeTotalEuros: Math.round(filas.reduce((a, f) => a + (f.costeTotal?.euros ?? 0), 0) * 100) / 100,
    // Si algún coste no se pudo calcular o es suelo, la suma lo es también.
    costeTotalEsSuelo: filas.some((f) => f.costeTotal === null || f.costeTotal.esSuelo),
    polizasEnVigor: suma(filas.map((f) => f.polizasEnVigor)),
    polizasNuevas: suma(filas.map((f) => f.polizasNuevas)),
    comisionEuros: conComision.length === 0 ? null : Math.round(conComision.reduce((a, f) => a + (f.comision as ComisionRecibos).euros, 0) * 100) / 100,
    titularesSinComision: filas.length - conComision.length,
  }
}

export function agregarConversion(titulares: readonly TitularConversion[], ahora: Date): { filas: FilaConversion[]; resumen: ResumenConversion } {
  const filas = ordenarConversion(titulares.map((t) => filaConversion(t, ahora)))
  return { filas, resumen: resumirConversion(filas) }
}

export type LecturaConversion =
  | { estado: 'ok'; filas: FilaConversion[]; resumen: ResumenConversion }
  | { estado: 'sin_configurar' }
  | { estado: 'sin_correduria' }
  | { estado: 'error'; motivo: string }
