// Comisiones de la correduría leídas de la cartera real (BD de Manuel, vía
// `ASEGURA_DATABASE_URL`). Esta app es la ÚNICA que toca esa BD; plataforma las
// consume por el puerto `/api/operador/comisiones`.
//
// 🚨 Tres estados, nunca dos: sin la env es `sin_configurar` — que NO es «no hay
// comisiones» —, y un fallo de BD es `error`. Un catch que devolviera listas
// vacías convertiría una caída en «la compañía no te ha pagado», que es
// exactamente la afirmación falsa que este módulo existe para evitar.
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

/**
 * Importe EIAC (guardado en TEXT) → número. `null` si no se puede leer.
 *
 * 🚨 Nunca 0: un importe ilegible y un importe de cero euros son cosas
 * distintas, y aguas abajo el 0 pasaría por «comprobado y no hay».
 */
export function importeEiac(v: string | null | undefined): number | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export type PeriodoComisiones = {
  companiaCodigo: string
  /** 'YYYY-MM-DD'. Fechas REALES: CIMA trae periodos como 31/05 → 01/07 que un
   *  'YYYY-MM' destruiría. */
  periodoInicio: string
  periodoFin: string
  liqBruto: number | null
  liqRetencion: number | null
  liqRemesa: number | null
  liqHash: string | null
  /** Remesa con fecha de pago dentro del periodo. `null` = la compañía reconoce
   *  la deuda pero no consta que la haya ingresado. */
  pagado: number | null
}

export type DevengoCompania = {
  companiaCodigo: string
  /** 'YYYY-MM' del mes en que el recibo pasó a cobrado. */
  mes: string
  bruto: number
  recibos: number
}

export type CoberturaCompania = {
  companiaCodigo: string
  recibos: number
  liquidaciones: number
  primerRecibo: string | null
  ultimoRecibo: string | null
}

export type ComisionesCartera =
  | { estado: 'sin_configurar' }
  | { estado: 'error' }
  | {
      estado: 'ok'
      periodos: PeriodoComisiones[]
      devengos: DevengoCompania[]
      cobertura: CoberturaCompania[]
    }

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

/**
 * Comisiones de la cartera desde `desde` (inclusive).
 *
 * El DEVENGADO se cuenta por `fechaSituacion` del recibo **cobrado**: es la
 * fecha en que la compañía se quedó el dinero del cliente, que es lo que
 * dispara su obligación de liquidar. Un recibo anulado o devuelto no devenga —
 * y ojo, un recibo puede caerse después (medido: el de 29,52€ de Allianz figura
 * «Pendiente» en el PDF de julio y `anulado` en CIMA a 01/08/2026), así que
 * esto es una previsión, no una deuda.
 */
export async function comisionesCartera(correduriaId: string, desde: Date): Promise<ComisionesCartera> {
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  try {
    const db = prismaAsegura()

    const [cuentas, liqs] = await Promise.all([
      db.cuentaEfectivo.findMany({
        where: { correduriaId, periodoInicio: { gte: desde } },
        orderBy: { periodoInicio: 'asc' },
      }),
      db.liquidacion.findMany({ where: { correduriaId, fechaLiquidacion: { gte: desde } } }),
    ])

    const periodos: PeriodoComisiones[] = cuentas
      .map(c => {
        const pagadas = liqs.filter(
          l =>
            l.codigoEntidadDgs === c.codigoEntidadDgs &&
            l.fechaPago != null &&
            c.periodoInicio != null &&
            c.periodoFin != null &&
            l.fechaPago >= c.periodoInicio &&
            l.fechaPago <= c.periodoFin,
        )
        return {
          companiaCodigo: c.codigoEntidadDgs ?? '',
          periodoInicio: iso(c.periodoInicio) ?? '',
          periodoFin: iso(c.periodoFin) ?? '',
          liqBruto: importeEiac(c.comisionesRecibos),
          liqRetencion: importeEiac(c.retencionComisiones),
          liqRemesa: importeEiac(c.remesas),
          liqHash: c.eiacXmlHash,
          pagado: pagadas.length
            ? Math.round(pagadas.reduce((s, l) => s + (importeEiac(l.importeRemesa) ?? 0), 0) * 100) / 100
            : null,
        }
      })
      .filter(p => p.companiaCodigo && p.periodoInicio && p.periodoFin)

    const recibos = await db.polizaRecibo.findMany({
      where: { correduriaId, situacion: 'cobrado', fechaSituacion: { gte: desde } },
      select: { codigoEntidadDgs: true, fechaSituacion: true, comisionBruta: true },
    })
    const acc = new Map<string, { bruto: number; recibos: number }>()
    for (const r of recibos) {
      if (!r.codigoEntidadDgs || !r.fechaSituacion) continue
      const clave = `${r.codigoEntidadDgs}|${r.fechaSituacion.toISOString().slice(0, 7)}`
      const cur = acc.get(clave) ?? { bruto: 0, recibos: 0 }
      cur.bruto += importeEiac(r.comisionBruta) ?? 0
      cur.recibos += 1
      acc.set(clave, cur)
    }
    const devengos: DevengoCompania[] = [...acc.entries()]
      .map(([k, v]) => {
        const [companiaCodigo, mes] = k.split('|')
        return { companiaCodigo, mes, bruto: Math.round(v.bruto * 100) / 100, recibos: v.recibos }
      })
      .sort((a, b) => a.mes.localeCompare(b.mes) || a.companiaCodigo.localeCompare(b.companiaCodigo))

    // Cobertura: TODO el histórico, sin filtro de fecha. Un recuento limitado a
    // la ventana daría «sin cobertura» a una compañía que simplemente no ha
    // movido nada este año, y eso mandaría a Alberto a hacer una gestión que no
    // hace falta.
    const [porCia, liqsPorCia] = await Promise.all([
      db.polizaRecibo.groupBy({
        by: ['codigoEntidadDgs'],
        _count: { _all: true },
        _min: { fechaSituacion: true },
        _max: { fechaSituacion: true },
        where: { correduriaId },
      }),
      db.cuentaEfectivo.groupBy({
        by: ['codigoEntidadDgs'],
        _count: { _all: true },
        where: { correduriaId },
      }),
    ])
    const cobertura: CoberturaCompania[] = porCia
      .filter(g => g.codigoEntidadDgs)
      .map(g => ({
        companiaCodigo: g.codigoEntidadDgs as string,
        recibos: g._count._all,
        liquidaciones: liqsPorCia.find(l => l.codigoEntidadDgs === g.codigoEntidadDgs)?._count._all ?? 0,
        primerRecibo: iso(g._min.fechaSituacion ?? null),
        ultimoRecibo: iso(g._max.fechaSituacion ?? null),
      }))
      .sort((a, b) => a.companiaCodigo.localeCompare(b.companiaCodigo))

    return { estado: 'ok', periodos, devengos, cobertura }
  } catch {
    return { estado: 'error' }
  }
}
