// ────────────────────────────────────────────────────────────────────────────
// Tesorería del depósito: cuánto dinero hay que tener BLOQUEADO para poder
// pujar, y cuándo.
//
// POR QUÉ NO BASTA CON SUMAR: pujar exige consignar el 5% del valor de subasta
// (art. 647 LEC), y ese dinero queda inmovilizado hasta que se devuelve a los
// no adjudicatarios — semanas después del cierre. Si dos subastas se solapan en
// el calendario, los dos depósitos coinciden en la cuenta; si no se solapan, el
// mismo dinero sirve para las dos. Lo que hay que tener en el banco NO es la
// suma de todos los depósitos, es el MÁXIMO SIMULTÁNEO.
//
// El cálculo es un barrido de eventos (+depósito al bloquear, −depósito al
// liberar) sobre la línea del tiempo. PURO y determinista: la fecha «hoy» entra
// por parámetro, nunca se lee el reloj aquí.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Días que tarda en volver el depósito de quien NO se adjudica el bien. La LEC
 * no fija plazo; en la práctica el Portal lo devuelve tras la aprobación del
 * remate. 15 días es una estimación PRUDENTE (mejor sobreestimar el dinero
 * inmovilizado que quedarse corto el día de pujar).
 */
export const DIAS_RETENCION_DEPOSITO = 15

/** Un depósito comprometido con su ventana temporal. */
export interface CompromisoDeposito {
  dedupeKey: string
  /** Texto corto para el aviso: identificador, municipio… */
  etiqueta: string
  deposito: number
  /** Apertura de la subasta. `null` = ya está abierta (bloquea desde hoy). */
  fechaInicio?: string | null
  /** Conclusión. Sin ella no se puede saber cuándo se libera el dinero. */
  fechaFin?: string | null
}

/** Un tramo del calendario con importe inmovilizado constante. */
export interface TramoTesoreria {
  desde: string
  hasta: string
  importe: number
  subastas: string[]
}

export interface PlanTesoreria {
  /** Suma de todos los depósitos. Informativo: NO es lo que hace falta tener. */
  total: number
  /** Máximo inmovilizado a la vez. **Esta es la cifra que importa.** */
  pico: number
  /** Primer día en que se alcanza el pico. */
  picoDesde: string | null
  /** Subastas que componen el pico. */
  picoSubastas: string[]
  tramos: TramoTesoreria[]
  /** `pico − saldoDisponible`, >0 = falta dinero. `null` si no se pasó saldo. */
  deficit: number | null
  /** Compromisos ignorados por no tener fecha de cierre o depósito. */
  incompletos: string[]
}

/** Fecha ISO (YYYY-MM-DD) de un timestamp o fecha cualquiera. */
function dia(v: string): string {
  return v.slice(0, 10)
}

function sumarDias(isoDia: string, n: number): string {
  const d = new Date(`${isoDia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Calendario de dinero inmovilizado por los depósitos.
 *
 * @param hoy         día de referencia, ISO (`YYYY-MM-DD`). Lo que ya está
 *                    abierto bloquea desde hoy, no desde su apertura pasada.
 * @param saldo       dinero realmente disponible; `null` para no calcular déficit.
 * @param retencion   días hasta la devolución del depósito.
 */
export function planTesoreria(
  compromisos: CompromisoDeposito[],
  hoy: string,
  saldo: number | null = null,
  retencion = DIAS_RETENCION_DEPOSITO,
): PlanTesoreria {
  const hoyDia = dia(hoy)
  const incompletos: string[] = []
  type Ev = { fecha: string; delta: number; key: string }
  const eventos: Ev[] = []
  let total = 0

  for (const c of compromisos) {
    // Sin cierre no hay ventana que calcular, y sin depósito no hay nada que
    // bloquear. Se declaran en `incompletos` en vez de inventar una fecha.
    if (!c.fechaFin || !(c.deposito > 0)) {
      incompletos.push(c.etiqueta)
      continue
    }
    const inicio = c.fechaInicio ? dia(c.fechaInicio) : hoyDia
    const desde = inicio > hoyDia ? inicio : hoyDia
    const hasta = sumarDias(dia(c.fechaFin), retencion)
    // Ya liberado: no computa.
    if (hasta <= hoyDia) {
      incompletos.push(c.etiqueta)
      continue
    }
    total += c.deposito
    eventos.push({ fecha: desde, delta: c.deposito, key: c.etiqueta })
    eventos.push({ fecha: hasta, delta: -c.deposito, key: c.etiqueta })
  }

  if (!eventos.length) {
    return { total: 0, pico: 0, picoDesde: null, picoSubastas: [], tramos: [], deficit: null, incompletos }
  }

  // Las liberaciones (−) se aplican ANTES que los bloqueos (+) del mismo día:
  // el dinero que vuelve ese día ya sirve para el depósito que entra.
  eventos.sort((a, b) => (a.fecha === b.fecha ? a.delta - b.delta : a.fecha < b.fecha ? -1 : 1))

  const tramos: TramoTesoreria[] = []
  const abiertas = new Set<string>()
  let acumulado = 0
  let i = 0
  while (i < eventos.length) {
    const fecha = eventos[i].fecha
    while (i < eventos.length && eventos[i].fecha === fecha) {
      const e = eventos[i++]
      acumulado += e.delta
      if (e.delta > 0) abiertas.add(e.key)
      else abiertas.delete(e.key)
    }
    const siguiente = i < eventos.length ? eventos[i].fecha : fecha
    if (acumulado > 0 && siguiente > fecha) {
      tramos.push({
        desde: fecha,
        hasta: siguiente,
        importe: Math.round(acumulado * 100) / 100,
        subastas: [...abiertas],
      })
    }
  }

  const pico = tramos.reduce((m, t) => (t.importe > m ? t.importe : m), 0)
  const tramoPico = tramos.find((t) => t.importe === pico) ?? null

  return {
    total: Math.round(total * 100) / 100,
    pico,
    picoDesde: tramoPico?.desde ?? null,
    picoSubastas: tramoPico?.subastas ?? [],
    tramos,
    deficit: saldo == null ? null : Math.round(Math.max(0, pico - saldo) * 100) / 100,
    incompletos,
  }
}
