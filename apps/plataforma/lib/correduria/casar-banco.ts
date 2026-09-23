// El tramo del BANCO del libro de comisiones: qué abono del BBVA paga qué periodo.
//
// Lógica PURA (sin BD) para poder testearla; la llama `app/api/cron/cima-liq`.
//
// 🚨 Por qué existe (medido el 23/09/2026): el cron sumaba, para cada periodo, TODOS los abonos de
// la compañía entre el inicio del periodo y 45 días después de su fin. Con periodos mensuales esas
// ventanas se pisan mes y medio, así que el mismo abono entraba en dos o tres periodos (Occident,
// enero 2026: 592,19€ «en banco» contra 300,70€ devengados). Y solo miraba la columna
// `compania_seguros`, que está vacía en 73 abonos que la matriz de la pantalla SÍ atribuye por
// concepto o por regla aprendida. Aquí cada abono va a UN periodo como mucho, y la compañía se
// resuelve con la MISMA cascada que la matriz.

import { claveReferencia, detectarCompania } from '../correduria.ts'
import { NOMBRE_POR_CODIGO_DGS } from '../comisiones-asegura.ts'

/** Días tras el cierre del periodo en los que aún se acepta su ingreso. */
export const VENTANA_COBRO_DIAS = 45
/** Diferencia entre remesa y abono que se da por el mismo pago (comisiones bancarias, redondeos). */
export const TOLERANCIA_REMESA = 1

export type AbonoBanco = {
  id: string
  /** `YYYY-MM-DD`. */
  fecha: string
  importe: number
  concepto: string | null
  conceptoNormalizado: string | null
  contraparte: string | null
  /** Lo que se asignó a mano o al ingerir. Manda sobre todo lo demás. */
  companiaSeguros: string | null
}

export type PeriodoLiq = {
  codigo: string
  /** `YYYY-MM-DD`. */
  inicio: string
  fin: string
  /** Lo que la compañía dice que transfiere. `null` = no mandó extracto. */
  remesa: number | null
}

const CODIGO_POR_NOMBRE = new Map(
  Object.entries(NOMBRE_POR_CODIGO_DGS).map(([codigo, nombre]) => [nombre.toLowerCase(), codigo]),
)

/**
 * Código DGS de la compañía que paga el abono, o `null` si no se sabe. Misma prioridad que la matriz
 * (`app/api/correduria/route.ts`): asignación manual → regla aprendida por clave → concepto. Un abono
 * que cae en «Otras», o en una compañía sin código conocido, NO se atribuye a nadie.
 */
export function codigoDeAbono(a: AbonoBanco, reglas: ReadonlyMap<string, string>): string | null {
  const nombre = a.companiaSeguros
    || reglas.get(claveReferencia(a.concepto) ?? '')
    || detectarCompania(a.concepto ?? '', a.conceptoNormalizado ?? '', a.contraparte ?? '')
  return CODIGO_POR_NOMBRE.get(nombre.toLowerCase()) ?? null
}

/**
 * El mes que el propio concepto dice pagar: «Liq.comisiones 202512», «Comisiones mayo 2026050»,
 * «-fra-comis-20250531». Solo años 202x y con un no-dígito delante: los números de remesa
 * («2000071499 2remsaldo…») no pueden colar un «2000-07».
 */
export function mesDelConcepto(concepto: string | null): string | null {
  const m = /(?<!\d)(202\d)(0[1-9]|1[0-2])/.exec(concepto ?? '')
  return m ? `${m[1]}-${m[2]}` : null
}

function mas(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 864e5).toISOString().slice(0, 10)
}

function clave(p: PeriodoLiq): string {
  return `${p.codigo}|${p.inicio}|${p.fin}`
}

/**
 * A qué periodo va cada abono. Candidatos: los de SU compañía cuya ventana [inicio, fin + 45 días]
 * contiene la fecha. Entre ellos, por este orden:
 *   1. si el concepto nombra un mes, el periodo que contiene el día 15 de ese mes — y si ninguno lo
 *      contiene (p. ej. diciembre pagado en enero, con el libro empezando en enero), a NINGUNO: sería
 *      inflar el mes siguiente con dinero que no es suyo;
 *   2. el que tenga remesa igual al importe (±1€);
 *   3. el último cerrado antes del pago (se liquida al acabar el periodo). Si ninguno ha cerrado
 *      todavía, el abono paga un periodo ANTERIOR al libro (el 7 de enero llega diciembre) y no se
 *      asigna: medido, esa regla metía el saldo de diciembre de Occident en su enero.
 * Devuelve `periodo → ids`; un periodo sin abonos no aparece.
 */
export function casarAbonos(
  periodos: readonly PeriodoLiq[],
  abonos: readonly AbonoBanco[],
  reglas: ReadonlyMap<string, string>,
): Map<string, string[]> {
  const casado = new Map<string, string[]>()
  for (const a of abonos) {
    const codigo = codigoDeAbono(a, reglas)
    if (codigo === null) continue
    const candidatos = periodos
      .filter((p) => p.codigo === codigo && p.inicio <= a.fecha && a.fecha <= mas(p.fin, VENTANA_COBRO_DIAS))
      .sort((x, y) => (x.inicio < y.inicio ? -1 : x.inicio > y.inicio ? 1 : 0))
    if (candidatos.length === 0) continue

    let elegido: PeriodoLiq | undefined
    const mes = mesDelConcepto(a.concepto) ?? mesDelConcepto(a.conceptoNormalizado)
    if (mes !== null) {
      const dia15 = `${mes}-15`
      elegido = candidatos.find((p) => p.inicio <= dia15 && dia15 <= p.fin)
      if (!elegido) continue
    } else {
      elegido =
        candidatos.find((p) => p.remesa !== null && Math.abs(p.remesa - a.importe) <= TOLERANCIA_REMESA)
        ?? [...candidatos].reverse().find((p) => p.fin <= a.fecha)
    }
    if (!elegido) continue
    const k = clave(elegido)
    casado.set(k, [...(casado.get(k) ?? []), a.id])
  }
  return casado
}

/** Total y abonos casados con un periodo. `total: null` = ningún abono identificado (no «0€ cobrados»). */
export function bancoDePeriodo(
  p: PeriodoLiq,
  casado: ReadonlyMap<string, string[]>,
  abonos: readonly AbonoBanco[],
): { total: number | null; ids: string[] } {
  const ids = casado.get(clave(p)) ?? []
  if (ids.length === 0) return { total: null, ids }
  const porId = new Map(abonos.map((a) => [a.id, a.importe]))
  const total = ids.reduce((s, id) => s + (porId.get(id) ?? 0), 0)
  return { total: Math.round(total * 100) / 100, ids }
}

/** Primera y última fecha que hay que traer del banco para poder casar estos periodos. */
export function rangoAbonos(periodos: readonly PeriodoLiq[]): { desde: string; hasta: string } | null {
  if (periodos.length === 0) return null
  const desde = periodos.reduce((m, p) => (p.inicio < m ? p.inicio : m), periodos[0].inicio)
  const hasta = periodos.reduce((m, p) => (p.fin > m ? p.fin : m), periodos[0].fin)
  return { desde, hasta: mas(hasta, VENTANA_COBRO_DIAS) }
}
