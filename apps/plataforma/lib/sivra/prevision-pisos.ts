// lib/sivra/prevision-pisos.ts — previsión de rendimiento por piso (BD) + snapshot + seguimiento.
//
// Qué es cada número (decisión de Alberto, 30/08/2026 — SIEMPRE por separado):
// · confirmado = ingreso de reservas YA en el calendario para ese mes (medido, `incomes`).
// · estimado   = lo que faltaría por vender para repetir el MISMO mes del año anterior
//                («si repites el año pasado»). null = sin base histórica, jamás 0.
// · pace       = confirmado HOY vs lo confirmado a la MISMA altura del año pasado
//                (`incomes.reserved_at`, la fecha real de reserva que rellena el sync de Smoobu).
// El cron diario guarda una foto (`pisos_previsiones`) para poder contrastar después lo previsto
// contra lo real: el seguimiento es lo que convierte esto en previsión de tesorería o en papel.
import { prisma } from '@/lib/db'
import { getPLMensualCached } from './pl-rango'
import { mesAniosAtras } from './pl-rango-logica'
import {
  estimadoAdicional, mediaGastos, pace, type Pace,
  diasHastaMes, decidirAlertaPace, desvioPrevision,
} from './prevision-logica'

export interface PrevisionMesPiso {
  mes: string
  propertyId: string
  nombre: string
  confirmado: number
  reservas: number
  noches: number
  /** Ingreso REAL del mismo mes del año anterior. null = 0€ o sin datos (no sirve de base). */
  baseAnterior: number | null
  /** Estimado adicional «si repites el año pasado». null = sin base. */
  estimado: number | null
  /** Media de gastos de los últimos 3 meses CERRADOS del piso. null = sin datos. */
  gastosPrevistos: number | null
  pace: Pace
}

export interface SeguimientoFila {
  mes: string
  propertyId: string
  nombre: string
  /** Día del último snapshot ANTES de empezar el mes (la previsión que se juzga). */
  previstoEl: string
  confirmadoEntonces: number
  estimadoEntonces: number | null
  /** confirmado + estimado del snapshot; null si el estimado no existía (no era una previsión completa). */
  previstoTotal: number | null
  realIngresos: number
  desvioPct: number | null
}

export interface PrevisionData {
  generadoEn: string
  meses: string[]
  filas: PrevisionMesPiso[]
  seguimiento: SeguimientoFila[]
  /** Fecha del último snapshot guardado. null = el cron aún no ha corrido nunca — la UI lo declara. */
  ultimoSnapshot: string | null
}

function mesActualStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function inicioMes(mes: string, offsetMeses = 0): Date {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m - 1 + offsetMeses, 1)
}

function sumaMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Núcleo: previsión de mes en curso + `horizonte-1` siguientes, por piso. */
export async function computarPrevision(horizonte = 3): Promise<PrevisionMesPiso[]> {
  const mes0 = mesActualStr()
  const meses = Array.from({ length: horizonte }, (_, i) => sumaMes(inicioMes(mes0, i)))
  const start = inicioMes(mes0)
  const end = inicioMes(mes0, horizonte)
  const startAnt = inicioMes(mesAniosAtras(mes0))
  const endAnt = inicioMes(mesAniosAtras(mes0), horizonte)

  const [props, confirmados, anteriores] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name FROM properties
      WHERE id NOT IN ('prop_multi_apartamentos', 'prop_personal')
      ORDER BY name
    `,
    prisma.$queryRaw<Array<{ pid: string; mes: string; ingresos: number; reservas: number; noches: number }>>`
      SELECT "propertyId" AS pid, to_char("checkIn", 'YYYY-MM') AS mes,
        COALESCE(SUM(amount), 0)::float AS ingresos,
        COUNT(*)::int AS reservas,
        COALESCE(SUM(nights), 0)::int AS noches
      FROM incomes
      WHERE "checkIn" >= ${start} AND "checkIn" < ${end}
      GROUP BY 1, 2
    `,
    // Mismos meses un año antes: total real, lo que ya estaba reservado a esta misma altura
    // (reserved_at ≤ hoy − 1 año) y cuánto ingreso NO tiene fecha de reserva conocida.
    prisma.$queryRaw<Array<{ pid: string; mes: string; total: number; misma_altura: number; sin_fecha: number }>>`
      SELECT "propertyId" AS pid, to_char("checkIn", 'YYYY-MM') AS mes,
        COALESCE(SUM(amount), 0)::float AS total,
        COALESCE(SUM(amount) FILTER (WHERE reserved_at IS NOT NULL AND reserved_at <= now() - interval '1 year'), 0)::float AS misma_altura,
        COALESCE(SUM(amount) FILTER (WHERE reserved_at IS NULL), 0)::float AS sin_fecha
      FROM incomes
      WHERE "checkIn" >= ${startAnt} AND "checkIn" < ${endAnt}
      GROUP BY 1, 2
    `,
  ])

  // Gastos previstos: media de los últimos 3 meses CERRADOS de cada piso (método declarado en UI).
  const mesesCerrados = [-1, -2, -3].map(off => sumaMes(inicioMes(mes0, off)))
  const plCerrados = await Promise.all(mesesCerrados.map(m => getPLMensualCached(m)))
  const gastosPorPiso = new Map<string, number[]>()
  for (const pl of plCerrados) {
    for (const p of pl.pisos) {
      if (!gastosPorPiso.has(p.propertyId)) gastosPorPiso.set(p.propertyId, [])
      gastosPorPiso.get(p.propertyId)!.push(p.gastos.total)
    }
  }

  const mConf = new Map(confirmados.map(r => [`${r.pid}|${r.mes}`, r]))
  const mAnt = new Map(anteriores.map(r => [`${r.pid}|${r.mes}`, r]))

  const filas: PrevisionMesPiso[] = []
  for (const mes of meses) {
    const mesAnt = mesAniosAtras(mes)
    for (const p of props) {
      const c = mConf.get(`${p.id}|${mes}`)
      const a = mAnt.get(`${p.id}|${mesAnt}`)
      const confirmado = Math.round(Number(c?.ingresos ?? 0) * 100) / 100
      const totalAnterior = Math.round(Number(a?.total ?? 0) * 100) / 100
      filas.push({
        mes,
        propertyId: p.id,
        nombre: p.name,
        confirmado,
        reservas: Number(c?.reservas ?? 0),
        noches: Number(c?.noches ?? 0),
        baseAnterior: totalAnterior > 0 ? totalAnterior : null,
        estimado: estimadoAdicional(confirmado, totalAnterior > 0 ? totalAnterior : null),
        gastosPrevistos: mediaGastos(gastosPorPiso.get(p.id) ?? []),
        pace: pace({
          confirmadoHoy: confirmado,
          anteriorMismaAltura: Math.round(Number(a?.misma_altura ?? 0) * 100) / 100,
          totalAnterior,
          sinFechaReserva: Math.round(Number(a?.sin_fecha ?? 0) * 100) / 100,
        }),
      })
    }
  }
  return filas
}

/** Previsión completa para la página: filas + seguimiento (previsto vs real) + frescura. */
export async function getPrevision(): Promise<PrevisionData> {
  const mes0 = mesActualStr()
  const [filas, snapshots, ultimo] = await Promise.all([
    computarPrevision(),
    // La previsión que se juzga: el ÚLTIMO snapshot anterior al día 1 del mes previsto,
    // solo de meses ya cerrados (los abiertos aún no se pueden juzgar).
    prisma.$queryRaw<Array<{ mes: string; pid: string; fecha: Date; confirmado: number; estimado: number | null }>>`
      SELECT DISTINCT ON (mes, property_id)
        mes, property_id AS pid, fecha, confirmado::float AS confirmado, estimado::float AS estimado
      FROM pisos_previsiones
      WHERE fecha < to_date(mes || '-01', 'YYYY-MM-DD') AND mes < ${mes0}
      ORDER BY mes, property_id, fecha DESC
    `,
    prisma.$queryRaw<Array<{ f: Date | null }>>`SELECT MAX(fecha) AS f FROM pisos_previsiones`,
  ])

  let seguimiento: SeguimientoFila[] = []
  if (snapshots.length > 0) {
    const mesesJuzgados = [...new Set(snapshots.map(s => s.mes))]
    const inicioPrimero = inicioMes(mesesJuzgados.slice().sort()[0])
    const finUltimo = inicioMes(mesesJuzgados.slice().sort().pop()!, 1)
    const [reales, props] = await Promise.all([
      prisma.$queryRaw<Array<{ pid: string; mes: string; ingresos: number }>>`
        SELECT "propertyId" AS pid, to_char("checkIn", 'YYYY-MM') AS mes,
          COALESCE(SUM(amount), 0)::float AS ingresos
        FROM incomes
        WHERE "checkIn" >= ${inicioPrimero} AND "checkIn" < ${finUltimo}
        GROUP BY 1, 2
      `,
      prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM properties`,
    ])
    const mReal = new Map(reales.map(r => [`${r.pid}|${r.mes}`, Number(r.ingresos)]))
    const mNombre = new Map(props.map(p => [p.id, p.name]))
    seguimiento = snapshots.map(s => {
      const real = Math.round((mReal.get(`${s.pid}|${s.mes}`) ?? 0) * 100) / 100
      const previstoTotal = s.estimado == null
        ? null
        : Math.round((Number(s.confirmado) + Number(s.estimado)) * 100) / 100
      return {
        mes: s.mes,
        propertyId: s.pid,
        nombre: mNombre.get(s.pid) ?? s.pid,
        previstoEl: s.fecha.toISOString().slice(0, 10),
        confirmadoEntonces: Math.round(Number(s.confirmado) * 100) / 100,
        estimadoEntonces: s.estimado == null ? null : Math.round(Number(s.estimado) * 100) / 100,
        previstoTotal,
        realIngresos: real,
        desvioPct: desvioPrevision(previstoTotal, real),
      }
    }).sort((a, b) => b.mes.localeCompare(a.mes) || a.nombre.localeCompare(b.nombre))
  }

  return {
    generadoEn: new Date().toISOString(),
    meses: [...new Set(filas.map(f => f.mes))],
    filas,
    seguimiento,
    ultimoSnapshot: ultimo[0]?.f ? ultimo[0].f.toISOString().slice(0, 10) : null,
  }
}

export interface ResultadoSnapshot {
  snapshots: number
  avisos: string[]
}

/** Pasada del cron: guarda la foto del día y decide los avisos de «previsión floja». */
export async function snapshotPrevision(hoy = new Date()): Promise<ResultadoSnapshot> {
  const filas = await computarPrevision()
  for (const f of filas) {
    await prisma.$executeRaw`
      INSERT INTO pisos_previsiones (fecha, mes, property_id, confirmado, estimado, gastos_estimados)
      VALUES (CURRENT_DATE, ${f.mes}, ${f.propertyId}, ${f.confirmado}, ${f.estimado}, ${f.gastosPrevistos})
      ON CONFLICT (fecha, mes, property_id) DO UPDATE SET
        confirmado = EXCLUDED.confirmado,
        estimado = EXCLUDED.estimado,
        gastos_estimados = EXCLUDED.gastos_estimados
    `
  }

  const avisos: string[] = []
  for (const f of filas) {
    const decision = decidirAlertaPace({
      diasHastaInicio: diasHastaMes(f.mes, hoy),
      confirmado: f.confirmado,
      totalAnterior: f.baseAnterior,
    })
    if (!decision.avisar) continue
    // Dedupe en BD: una vez por (mes, piso). Si la fila ya existe, el aviso ya sonó.
    const insertadas = await prisma.$executeRaw`
      INSERT INTO pisos_previsiones_avisos (mes, property_id, tipo)
      VALUES (${f.mes}, ${f.propertyId}, 'pace_flojo')
      ON CONFLICT DO NOTHING
    `
    if (insertadas > 0) avisos.push(`${f.nombre} · ${f.mes}: ${decision.motivo}`)
  }
  return { snapshots: filas.length, avisos }
}
