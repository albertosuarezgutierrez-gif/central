// Comisiones de la correduría leídas de la cartera real (schema `seguros` de la BD
// compartida; `ASEGURA_FUENTE=origen` vuelve al Supabase de Manuel). Esta app es la
// ÚNICA que toca esas tablas; plataforma las consume por el puerto
// `/api/operador/comisiones`.
//
// 🚨 Tres estados, nunca dos: sin la env es `sin_configurar` — que NO es «no hay
// comisiones» —, y un fallo de BD es `error`. Un catch que devolviera listas
// vacías convertiría una caída en «la compañía no te ha pagado», que es
// exactamente la afirmación falsa que este módulo existe para evitar.
//
// Y el `error` va SIEMPRE con su CAUSA (`lib/error-cartera.ts`, el mismo
// clasificador que el resto del puerto): un `error` pelado deja el aviso en «no
// se ha podido leer» sin decir dónde mirar, que es justo donde se quedó atascado
// el libro de comisiones el 02/09/2026 — la causa real resultó ser
// `credenciales` y solo se veía en los logs del pooler.
import { importeEiac as leerImporteEiac, sumarImportesEiac } from '@central/module-seguros'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { registrarErrorCartera, type CausaErrorCartera } from './error-cartera'
import {
  LIMITE_LIQUIDACIONES,
  LIMITE_RECIBOS_COBRADOS,
  cribaTruncada,
} from './cartera-techos.ts'

/**
 * Importe EIAC (guardado en TEXT) → número. `null` si no se puede leer.
 * Nunca 0: un importe ilegible y un importe de cero euros son cosas distintas.
 *
 * 🚨 Esto ERA una reimplementación local, y no una inocente: usaba
 * `Number(s.replace(',', '.'))`, que acepta `'1.234'` y devuelve **1,23 €**
 * sobre un texto que en formato español quería decir mil doscientos treinta y
 * cuatro. Es exactamente la lección de ORCL que el helper del módulo existe
 * para impedir (`packages/module-seguros/src/importe-eiac.ts`): una cifra mal
 * leída es peor que una ausente porque no deja hueco que la delate — y esta
 * alimenta el LIBRO DE COMISIONES, que es contra lo que se decide si reclamar
 * a una compañía.
 *
 * Medido el 20/09/2026 antes de unificar: los **372** recibos de la cartera
 * traen la forma canónica (`NNN.NN`), **0 con tres decimales y 0 con coma**, o
 * sea que las dos implementaciones daban HOY el mismo número. Era una mina sin
 * pisar, no un importe mal contado. Se re-exporta con el mismo nombre para no
 * cambiar la superficie pública de este módulo.
 */
export { importeEiac } from '@central/module-seguros'

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
  /**
   * Recibos del grupo cuya `comision_bruta` NO se pudo leer (texto con una forma
   * que `importeEiac` no reconoce). Se cuentan aparte en vez de sumarse como 0:
   * un devengo infravalorado es la cifra contra la que se decide si reclamar a
   * la compañía, y un 0 silencioso lo baja sin dejar hueco que lo delate.
   * `recibos` los sigue contando: se cobraron, solo que no sabemos cuánto.
   */
  ilegibles: number
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
  | { estado: 'error'; causa: CausaErrorCartera }
  | {
      estado: 'ok'
      periodos: PeriodoComisiones[]
      devengos: DevengoCompania[]
      cobertura: CoberturaCompania[]
      /**
       * 🚨 Alguna de las tres cribas (cuentas de efectivo, liquidaciones o
       * recibos cobrados) tocó su techo, así que el LIBRO ESTÁ INCOMPLETO y el
       * devengado sale más BAJO que el real.
       *
       * Es el mismo daño que el `?? 0` sobre un importe ilegible que este
       * módulo ya corrigió, un piso más arriba: una cifra plausible y corta,
       * sin hueco que la delate, contra la que se decide si reclamar a una
       * compañía. Por eso es UN solo campo para las tres: a quien lo lee no le
       * cambia la acción (no fiarse del total), y tres banderas sueltas
       * invitarían a fiarse de dos de ellas.
       *
       * NO significa «hay exactamente N filas».
       */
      truncado: boolean
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
        take: LIMITE_LIQUIDACIONES,
      }),
      db.liquidacion.findMany({
        where: { correduriaId, fechaLiquidacion: { gte: desde } },
        take: LIMITE_LIQUIDACIONES,
      }),
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
          liqBruto: leerImporteEiac(c.comisionesRecibos),
          liqRetencion: leerImporteEiac(c.retencionComisiones),
          liqRemesa: leerImporteEiac(c.remesas),
          liqHash: c.eiacXmlHash,
          pagado: pagadas.length
            ? Math.round(pagadas.reduce((s, l) => s + (leerImporteEiac(l.importeRemesa) ?? 0), 0) * 100) / 100
            : null,
        }
      })
      .filter(p => p.companiaCodigo && p.periodoInicio && p.periodoFin)

    const recibos = await db.polizaRecibo.findMany({
      where: { correduriaId, situacion: 'cobrado', fechaSituacion: { gte: desde } },
      select: { codigoEntidadDgs: true, fechaSituacion: true, comisionBruta: true },
      take: LIMITE_RECIBOS_COBRADOS,
    })

    // Las tres cribas, en un solo veredicto. Cualquiera que muerda deja el
    // libro corto, así que el `||` no pierde información: la acción de quien lo
    // lee es la misma en los tres casos.
    const truncado =
      cribaTruncada(cuentas.length, LIMITE_LIQUIDACIONES) ||
      cribaTruncada(liqs.length, LIMITE_LIQUIDACIONES) ||
      cribaTruncada(recibos.length, LIMITE_RECIBOS_COBRADOS)
    // 🚨 El `?? 0` que había aquí convertía un «no se ha podido leer» en «cobró
    // 0€ de comisión» y lo sumaba igual al devengo: la cifra salía plausible y
    // más BAJA que la real, que es justo la que se compara contra el extracto de
    // la compañía para decidir si se reclama. `sumarImportesEiac` ya existe para
    // esto (module-seguros) y devuelve los ilegibles CONTADOS aparte.
    const acc = new Map<string, string[]>()
    for (const r of recibos) {
      if (!r.codigoEntidadDgs || !r.fechaSituacion) continue
      const clave = `${r.codigoEntidadDgs}|${r.fechaSituacion.toISOString().slice(0, 7)}`
      const cur = acc.get(clave) ?? []
      cur.push(r.comisionBruta ?? '')
      acc.set(clave, cur)
    }
    const devengos: DevengoCompania[] = [...acc.entries()]
      .map(([k, textos]) => {
        const [companiaCodigo, mes] = k.split('|')
        const s = sumarImportesEiac(textos)
        // `recibos` = todos los del grupo (se cobraron); `ilegibles`, los que no
        // aportan importe. Sumar leídos+ilegibles NO es lo mismo que el total de
        // recibos: un `comision_bruta` vacío es «la compañía no informa comisión
        // en este recibo», ni leído ni ilegible.
        return {
          companiaCodigo,
          mes,
          bruto: s.total,
          recibos: textos.length,
          ilegibles: s.ilegibles,
        }
      })
      .sort((a, b) => a.mes.localeCompare(b.mes) || a.companiaCodigo.localeCompare(b.companiaCodigo))

    // Cobertura: TODO el histórico, sin filtro de fecha. No lleva techo y no le
    // hace falta: son `groupBy` por `codigo_entidad_dgs`, así que devuelven una
    // fila por compañía (5 hoy, 15 en `companias_dgs`), no una por recibo.
    // Un recuento limitado a
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

    return { estado: 'ok', periodos, devengos, cobertura, truncado }
  } catch (e) {
    // Mismo clasificador que las otras ocho rutas del puerto: la causa viaja en
    // la respuesta y el detalle (sin la URL, que llevaría la contraseña) va al
    // log de la función. Un `error` pelado obligaba a adivinar cuál de las cinco.
    return { estado: 'error', causa: registrarErrorCartera('operador/comisiones', e) }
  }
}
