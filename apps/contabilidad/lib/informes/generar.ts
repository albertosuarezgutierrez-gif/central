// Generación de informes a partir de una FUENTE inyectada (en producción, el repositorio de la empresa; en tests, un fake). Sin BD aquí.
// Balance, sumas y saldos y PyG se calculan sobre sumas por cuenta (exactas, sin tope); diario y mayor leen asientos con tope y lo DICEN.
import {
  libroDiario, libroMayor, sumasYSaldos, balanceSituacion, cuentaPyG, antiguedadSaldos, esFechaISO, sumarDias, aFechaISO, SEMILLA_PGC_PYMES,
  type Asiento, type PartidaDoc, type SumaCuenta,
} from '@central/module-contabilidad'
import { informePorClave, type ColumnaInforme } from './catalogo.ts'

export type Celda = string | number | null
export type FilaInforme = Record<string, Celda>
export type Tabla = {
  clave: string
  titulo: string
  subtitulo: string
  columnas: readonly ColumnaInforme[]
  filas: FilaInforme[]
  /** Fila de totales (mismas claves que las columnas), si procede. */
  totales: FilaInforme | null
  /** Avisos de lectura (datos truncados, balance que no cuadra, sin datos…). */
  avisos: string[]
}

export type ParametrosInforme = { desde: string; hasta: string; cuenta: string | null }

export interface FuenteInforme {
  asientos(o: { desde?: string; hasta: string; limite: number }): Promise<{ asientos: Asiento[]; truncado: boolean }>
  sumas(o: { desde?: string; hasta: string }): Promise<SumaCuenta[]>
  partidas(prefijos: readonly string[], hasta: string): Promise<PartidaDoc[]>
}

export const LIMITE_ASIENTOS_INFORME = 5000
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const NOMBRES: Record<string, string> = Object.fromEntries(SEMILLA_PGC_PYMES.map(([cu, n]) => [cu, n]))

/** Parámetros desde la query: fechas ISO válidas (por defecto el año de `hoy`), cuenta numérica o null. Nunca lanza. */
export function parametrosDe(sp: Record<string, string | string[] | undefined>, hoy: Date): ParametrosInforme {
  const a = hoy.getUTCFullYear()
  let desde = uno(sp.desde)
  let hasta = uno(sp.hasta)
  if (!esFechaISO(desde)) desde = `${a}-01-01`
  if (!esFechaISO(hasta)) hasta = aFechaISO(hoy)
  if (desde > hasta) [desde, hasta] = [hasta, desde]
  const cuenta = /^[1-9][0-9]{0,11}$/.test(uno(sp.cuenta)) ? uno(sp.cuenta) : null
  return { desde, hasta, cuenta }
}

const sintetico = (sumas: readonly SumaCuenta[], fecha: string): Asiento[] =>
  sumas.length === 0 ? [] : [{ fecha, ejercicio: Number(fecha.slice(0, 4)), concepto: 'Saldos acumulados', apuntes: sumas.map((s) => ({ cuenta: s.cuenta, debe: s.debe, haber: s.haber })) }]

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')

export async function generarInforme(clave: string, p: ParametrosInforme, fuente: FuenteInforme): Promise<Tabla | null> {
  const def = informePorClave(clave)
  if (!def) return null
  const base = { clave: def.clave, titulo: def.titulo, columnas: def.columnas }
  const periodo = `Del ${fechaEs(p.desde)} al ${fechaEs(p.hasta)}`

  switch (def.clave) {
    case 'diario': {
      const { asientos, truncado } = await fuente.asientos({ desde: p.desde, hasta: p.hasta, limite: LIMITE_ASIENTOS_INFORME })
      const filas: FilaInforme[] = libroDiario(asientos).flatMap((a) =>
        a.apuntes.map((x): FilaInforme => ({ numero: a.numero ?? null, fecha: a.fecha, concepto: a.concepto, cuenta: x.cuenta, documento: x.documento ?? null, debe: x.debe, haber: x.haber })))
      const debe = filas.reduce((t, f) => t + (f.debe as number), 0)
      const haber = filas.reduce((t, f) => t + (f.haber as number), 0)
      return { ...base, subtitulo: periodo, filas, totales: filas.length ? { concepto: 'Total', debe, haber } : null,
        avisos: [...(filas.length === 0 ? ['Sin datos: no hay asientos en el periodo.'] : []), ...(truncado ? [`Solo se incluyen los primeros ${LIMITE_ASIENTOS_INFORME} asientos del periodo; acota las fechas para ver el resto.`] : [])] }
    }
    case 'mayor': {
      if (!p.cuenta) return { ...base, subtitulo: periodo, filas: [], totales: null, avisos: ['Indica una cuenta para ver su mayor.'] }
      const antes = p.desde > '0000-01-01' ? sumarDias(p.desde, -1) : p.desde
      const [previas, { asientos, truncado }] = await Promise.all([
        fuente.sumas({ hasta: antes }),
        fuente.asientos({ desde: p.desde, hasta: p.hasta, limite: LIMITE_ASIENTOS_INFORME }),
      ])
      const saldoInicial = previas.filter((s) => s.cuenta.startsWith(p.cuenta!)).reduce((t, s) => t + s.debe - s.haber, 0)
      const m = libroMayor(asientos, p.cuenta, { saldoInicial })
      const filas: FilaInforme[] = [
        ...(saldoInicial !== 0 ? [{ fecha: p.desde, numero: null, concepto: 'Saldo inicial', cuenta: p.cuenta, debe: null, haber: null, saldo: saldoInicial } as FilaInforme] : []),
        ...m.lineas.map((l): FilaInforme => ({ fecha: l.fecha, numero: l.numero ?? null, concepto: l.concepto, cuenta: l.cuenta, debe: l.debe, haber: l.haber, saldo: l.saldo })),
      ]
      return { ...base, subtitulo: `${p.cuenta}${NOMBRES[p.cuenta] ? ` · ${NOMBRES[p.cuenta]}` : ''} · ${periodo}`, filas,
        totales: m.lineas.length ? { concepto: 'Total del periodo', debe: m.totalDebe, haber: m.totalHaber, saldo: m.saldo } : null,
        avisos: [...(filas.length === 0 ? ['Sin datos: la cuenta no tiene movimientos.'] : []), ...(truncado ? [`Solo se incluyen los primeros ${LIMITE_ASIENTOS_INFORME} asientos del periodo; el saldo final puede no ser completo.`] : [])] }
    }
    case 'sumas_saldos': {
      const sumas = await fuente.sumas({ desde: p.desde, hasta: p.hasta })
      const r = sumasYSaldos(sintetico(sumas, p.hasta))
      return { ...base, subtitulo: periodo,
        filas: r.filas.map((f): FilaInforme => ({ cuenta: f.cuenta, nombre: NOMBRES[f.cuenta] ?? null, debe: f.debe, haber: f.haber, saldoDeudor: f.saldoDeudor, saldoAcreedor: f.saldoAcreedor })),
        totales: r.filas.length ? { nombre: 'Totales', ...r.totales } : null,
        avisos: [...(r.filas.length === 0 ? ['Sin datos: no hay apuntes en el periodo.'] : []), ...(r.filas.length > 0 && !r.cuadra ? ['ATENCIÓN: las sumas no cuadran. No debería ocurrir: avisa al soporte.'] : [])] }
    }
    case 'balance': {
      const sumas = await fuente.sumas({ hasta: p.hasta })
      const b = balanceSituacion(sintetico(sumas, p.hasta), p.hasta)
      const filas: FilaInforme[] = [
        ...b.activo.map((x): FilaInforme => ({ lado: 'Activo', rubrica: x.etiqueta, importe: x.importe })),
        ...b.patrimonioNetoYPasivo.map((x): FilaInforme => ({ lado: 'Patrimonio neto y pasivo', rubrica: x.etiqueta, importe: x.importe })),
      ]
      if (filas.length) {
        filas.push({ lado: 'Activo', rubrica: 'TOTAL ACTIVO', importe: b.totalActivo }, { lado: 'Patrimonio neto y pasivo', rubrica: 'TOTAL PATRIMONIO NETO Y PASIVO', importe: b.totalPatrimonioNetoYPasivo })
      }
      return { ...base, subtitulo: `A ${fechaEs(p.hasta)}`, filas, totales: null,
        avisos: [...(filas.length === 0 ? ['Sin datos: no hay apuntes hasta esa fecha.'] : []), ...(filas.length > 0 && !b.cuadra ? [`El balance no cuadra (diferencia ${b.totalActivo - b.totalPatrimonioNetoYPasivo} céntimos). No debería ocurrir: avisa al soporte.`] : [])] }
    }
    case 'pyg': {
      const sumas = await fuente.sumas({ desde: p.desde, hasta: p.hasta })
      const r = cuentaPyG(sintetico(sumas, p.hasta))
      const filas: FilaInforme[] = [
        ...r.lineas.map((x): FilaInforme => ({ rubrica: x.etiqueta, importe: x.importe })),
        ...(r.lineas.length ? [
          { rubrica: 'Resultado de explotación', importe: r.resultadoExplotacion }, { rubrica: 'Resultado financiero', importe: r.resultadoFinanciero },
          { rubrica: 'Resultado antes de impuestos', importe: r.resultadoAntesImpuestos }, { rubrica: 'Resultado del ejercicio', importe: r.resultadoEjercicio },
        ] : []),
      ]
      return { ...base, subtitulo: periodo, filas, totales: null, avisos: filas.length === 0 ? ['Sin datos: no hay ingresos ni gastos en el periodo.'] : [] }
    }
    case 'antiguedad_clientes':
    case 'antiguedad_proveedores': {
      const tipo = def.clave === 'antiguedad_clientes' ? 'clientes' : 'proveedores'
      const a = antiguedadSaldos(await fuente.partidas(tipo === 'clientes' ? ['43'] : ['40', '41'], p.hasta), tipo, new Date(`${p.hasta}T00:00:00Z`))
      const f = (x: { cuenta: string; documento: string | null; desde: string; dias: number; tramo: string; importe: number }): FilaInforme => ({ ...x })
      return { ...base, subtitulo: `A ${fechaEs(p.hasta)}`, filas: a ? [...a.filas.map(f), ...a.aFavor.map((x) => ({ ...f(x), tramo: 'A favor', importe: -x.importe }))] : [],
        totales: a ? { documento: 'Total pendiente', importe: a.total } : null,
        avisos: a === null ? ['Sin datos: ninguna cuenta de este tipo tiene apuntes.']
          : [`Reparto: 0-30 días, 31-60, 61-90 y +90. Una partida se casa por cuenta y documento (la referencia de la factura); sin documento no se puede casar.`,
            ...(a.aFavor.length ? [`${a.aFavor.length} partidas con saldo contrario (anticipos o cobros/pagos sin factura casada) aparecen como «A favor» en negativo y no se compensan con las abiertas.`] : [])] }
    }
    default:
      return null
  }
}
