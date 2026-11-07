// F5 — Libros para legalizar y depósito de cuentas: SOLO EXPORTACIÓN (tablas para CSV / HTML imprimible → PDF). PURO.
// No se legaliza ni se deposita nada desde aquí: el titular o su gestor lo hace en el Registro Mercantil con certificado digital.
// El fichero de depósito (XBRL) NO está implementado: `DEPOSITO_XBRL_PENDIENTE`.
import { saldosDeAsientos, esAsientoDeCierre, type SaldoCuenta } from './cierre.ts'
import type { Asiento } from '../partida/asiento.ts'
import type { BalanceAbreviado, PyGAbreviada } from './cuentas-anuales.ts'
import { MODELO_PENDIENTE_DE_CONTRASTAR } from './cuentas-anuales.ts'

export const DEPOSITO_XBRL_PENDIENTE = 'Fichero de depósito XBRL: NO implementado (pendiente). Solo se exportan las cuentas anuales en CSV/PDF para que el gestor las presente.'

export type TipoColumnaLibro = 'texto' | 'fecha' | 'dinero' | 'numero'
export type ColumnaLibro = { clave: string; etiqueta: string; tipo: TipoColumnaLibro }
export type CeldaLibro = string | number | null
export type TablaLibro = {
  clave: string
  titulo: string
  subtitulo: string
  columnas: readonly ColumnaLibro[]
  filas: Record<string, CeldaLibro>[]
  totales: Record<string, CeldaLibro> | null
  avisos: string[]
}

const col = (clave: string, etiqueta: string, tipo: TipoColumnaLibro): ColumnaLibro => ({ clave, etiqueta, tipo })
const AVISO_LEGAL = 'Exportación para legalizar: la legalización (Registro Mercantil, telemática) y el depósito los presenta el titular o su gestor con certificado digital. Este programa solo exporta.'

/** Plazos de referencia (ejercicio natural). Informativos y marcados a contrastar: la fuente es la normativa mercantil recordada. */
export function plazosCierreMercantil(anio: number): { concepto: string; fecha: string; nota: string }[] {
  const n = 'orientativo, pendiente de contrastar'
  return [
    { concepto: 'Formulación de las cuentas anuales (3 meses)', fecha: `${anio + 1}-03-31`, nota: n },
    { concepto: 'Legalización de libros en el Registro Mercantil (4 meses)', fecha: `${anio + 1}-04-30`, nota: n },
    { concepto: 'Aprobación por la junta (6 meses)', fecha: `${anio + 1}-06-30`, nota: n },
    { concepto: 'Depósito de cuentas (1 mes desde la aprobación; si se aprueba el último día)', fecha: `${anio + 1}-07-31`, nota: n },
  ]
}

const nombreDe = (nombres: Readonly<Record<string, string>>, c: string) => nombres[c] ?? ''

/** Libro diario para legalizar: una fila por apunte, con nº de asiento, fecha, concepto y cuenta. Totales debe = haber. */
export function libroDiarioLegal(asientos: readonly Asiento[], nombres: Readonly<Record<string, string>>, o: { anio: number; empresa: string }): TablaLibro {
  const orden = asientos.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.numero ?? 0) - (b.numero ?? 0)))
  const filas: Record<string, CeldaLibro>[] = []
  let debe = 0
  let haber = 0
  for (const a of orden) for (const p of a.apuntes) {
    filas.push({ numero: a.numero ?? null, fecha: a.fecha, concepto: a.concepto, cuenta: p.cuenta, nombre: nombreDe(nombres, p.cuenta), debe: p.debe, haber: p.haber })
    debe += p.debe; haber += p.haber
  }
  const avisos = [AVISO_LEGAL]
  if (debe !== haber) avisos.push('ATENCIÓN: el diario no cuadra (debe ≠ haber). No lo legalices hasta revisarlo.')
  if (orden.some((a) => a.numero === undefined)) avisos.push('Hay asientos sin número correlativo.')
  return {
    clave: 'libro-diario', titulo: `Libro diario ${o.anio}`, subtitulo: o.empresa,
    columnas: [col('numero', 'Nº asiento', 'numero'), col('fecha', 'Fecha', 'fecha'), col('concepto', 'Concepto', 'texto'), col('cuenta', 'Cuenta', 'texto'), col('nombre', 'Nombre de la cuenta', 'texto'), col('debe', 'Debe', 'dinero'), col('haber', 'Haber', 'dinero')],
    filas, totales: { concepto: 'Totales', debe, haber }, avisos,
  }
}

function filasSaldos(saldos: readonly SaldoCuenta[], nombres: Readonly<Record<string, string>>) {
  const filas: Record<string, CeldaLibro>[] = []
  let d = 0, h = 0, sd = 0, sa = 0
  for (const s of saldos) {
    const sal = s.debe - s.haber
    filas.push({ cuenta: s.cuenta, nombre: nombreDe(nombres, s.cuenta), debe: s.debe, haber: s.haber, saldoDeudor: sal > 0 ? sal : 0, saldoAcreedor: sal < 0 ? -sal : 0 })
    d += s.debe; h += s.haber; sd += sal > 0 ? sal : 0; sa += sal < 0 ? -sal : 0
  }
  return { filas, totales: { cuenta: 'Totales', debe: d, haber: h, saldoDeudor: sd, saldoAcreedor: sa } as Record<string, CeldaLibro> }
}
const COLS_SALDOS = [col('cuenta', 'Cuenta', 'texto'), col('nombre', 'Nombre', 'texto'), col('debe', 'Debe', 'dinero'), col('haber', 'Haber', 'dinero'), col('saldoDeudor', 'Saldo deudor', 'dinero'), col('saldoAcreedor', 'Saldo acreedor', 'dinero')]

/** Libro de inventarios y cuentas anuales, por partes (cada una exportable). */
export function libroInventarios(asientos: readonly Asiento[], nombres: Readonly<Record<string, string>>, o: { anio: number; empresa: string }): TablaLibro[] {
  const sub = o.empresa
  const apertura = asientos.filter((a) => a.origen?.tipo === 'apertura')
  const abiertos = apertura.length ? filasSaldos(saldosDeAsientos(apertura).map((s) => ({ ...s })), nombres) : null
  const parteApertura: TablaLibro = {
    clave: 'inventario-apertura', titulo: `Inventario inicial ${o.anio}`, subtitulo: sub, columnas: COLS_SALDOS,
    filas: abiertos?.filas ?? [], totales: abiertos?.totales ?? null,
    avisos: [AVISO_LEGAL, ...(abiertos ? [] : ['No hay asiento de apertura en este ejercicio (primer ejercicio o sin abrir): el inventario inicial queda vacío, no a cero.'])],
  }
  const sinCierre = asientos.filter((a) => !esAsientoDeCierre(a))
  const trimestres: [string, string][] = [['1T', `${o.anio}-03-31`], ['2T', `${o.anio}-06-30`], ['3T', `${o.anio}-09-30`], ['4T', `${o.anio}-12-31`]]
  const comp: Record<string, CeldaLibro>[] = []
  for (const [t, hasta] of trimestres) {
    const { filas } = filasSaldos(saldosDeAsientos(sinCierre.filter((a) => a.fecha <= hasta)), nombres)
    for (const f of filas) comp.push({ trimestre: t, ...f })
  }
  const parteComp: TablaLibro = {
    clave: 'balances-comprobacion', titulo: `Balances de comprobación trimestrales ${o.anio}`, subtitulo: sub,
    columnas: [col('trimestre', 'Trimestre', 'texto'), ...COLS_SALDOS], filas: comp, totales: null, avisos: [AVISO_LEGAL, 'Sumas y saldos acumulados a fin de cada trimestre, sin los asientos de regularización y cierre.'],
  }
  const cierreSaldos = saldosDeAsientos(sinCierre).filter((s) => s.debe - s.haber !== 0)
  const inv = filasSaldos(cierreSaldos, nombres)
  const parteCierre: TablaLibro = {
    clave: 'inventario-cierre', titulo: `Inventario de cierre ${o.anio}`, subtitulo: sub, columnas: COLS_SALDOS, filas: inv.filas, totales: inv.totales,
    avisos: [AVISO_LEGAL, 'Saldos a 31/12 antes de la regularización y el cierre (las cuentas 6/7 muestran el resultado del ejercicio).'],
  }
  return [parteApertura, parteComp, parteCierre]
}

const lineasATabla = (clave: string, titulo: string, sub: string, lineas: readonly { etiqueta: string; importe: number; anterior: number | null; nivel: number }[], avisos: string[]): TablaLibro => ({
  clave, titulo, subtitulo: sub,
  columnas: [col('concepto', 'Concepto', 'texto'), col('importe', 'Ejercicio', 'dinero'), col('anterior', 'Ejercicio anterior', 'dinero')],
  filas: lineas.map((l) => ({ concepto: `${l.nivel === 2 ? '    ' : ''}${l.etiqueta}`, importe: l.importe, anterior: l.anterior })), totales: null, avisos,
})

/** Cuentas anuales exportables (balance y PyG abreviados). La columna anterior vacía significa «no aportada», no cero. */
export function libroCuentasAnuales(b: BalanceAbreviado, p: PyGAbreviada, o: { anio: number; empresa: string }): TablaLibro[] {
  const avisosB = [AVISO_LEGAL, DEPOSITO_XBRL_PENDIENTE, ...b.avisos.filter((a) => a !== MODELO_PENDIENTE_DE_CONTRASTAR), `Modelo: ${MODELO_PENDIENTE_DE_CONTRASTAR}.`]
  const activo = [...b.activo, { clave: 'TA', etiqueta: 'TOTAL ACTIVO', nivel: 0 as const, importe: b.totalActivo, anterior: b.totalActivoAnterior }]
  const pasivo = [...b.patrimonioNetoYPasivo, { clave: 'TP', etiqueta: 'TOTAL PATRIMONIO NETO Y PASIVO', nivel: 0 as const, importe: b.totalPatrimonioNetoYPasivo, anterior: b.totalPatrimonioNetoYPasivoAnterior }]
  return [
    lineasATabla('balance-abreviado', `Balance abreviado — activo ${o.anio}`, o.empresa, activo, avisosB),
    lineasATabla('balance-abreviado-pasivo', `Balance abreviado — patrimonio neto y pasivo ${o.anio}`, o.empresa, pasivo, avisosB),
    lineasATabla('pyg-abreviada', `Cuenta de pérdidas y ganancias abreviada ${o.anio}`, o.empresa, p.lineas, [AVISO_LEGAL, DEPOSITO_XBRL_PENDIENTE, ...p.avisos.filter((a) => a !== MODELO_PENDIENTE_DE_CONTRASTAR), `Modelo: ${MODELO_PENDIENTE_DE_CONTRASTAR}.`]),
  ]
}

