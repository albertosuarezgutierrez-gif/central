// lib/sivra/pricing-demanda.ts — el factor de demanda de UNA fecha: qué ocupación lo mueve y cuándo
// esa ocupación significa algo.
//
// POR QUÉ, PARTE 1 (09/08/2026, auditoría tras la reserva de Luxury 16-18/10). El motor calcula UN
// factor de demanda por piso (`1 + (ocupación − baseline) × k`, suelo ×0,92) con la ocupación media de
// TODO el horizonte, y lo aplica a TODAS las fechas por igual. Pero la ocupación de una fecha lejana no
// significa nada si ese piso todavía no la vende: Luxury coloca sus noches de octubre con 11-17 días
// de antelación (mediana medida por mes en `incomes.reserved_at`), así que estar "vacío" en octubre a
// 68 días vista es su estado NORMAL — y aun así el descuento de demanda le estaba quitando un 6-8%
// del precio meses antes de que empiece la venta. Es el mismo principio que la palanca last-minute
// (`pricing-lastminute.ts`): la urgencia se mide contra la antelación REAL del piso, no contra un
// calendario imaginario donde todo se reserva con medio año.
//
// POR QUÉ, PARTE 2 (09/08/2026, la otra mitad). Quitar el castigo no basta: con UNA sola cifra anual,
// el mes que SÍ se está llenando tampoco puede empujar el precio hacia arriba, porque su ocupación no
// llega nunca al cálculo. Con los 4 pisos recién activados la cifra anual era del 1-8% —real,
// contrastada contra Smoobu— así que septiembre, con el 30% de sus noches ya vendidas, recibía
// exactamente el mismo trato que un mes al 0%. Por eso esta función acepta además la ocupación del MES
// de la fecha y, cuando puede juzgarla, tarifica con ella.
//
// 🚨 Y AQUÍ ESTÁ LA TRAMPA, que se midió antes de darla por buena: partir la ocupación por mes SIN
// saber si ese mes ya se vende es PEOR que el bug original. Un mes a diez meses vista está al 0%
// porque NADIE ha podido reservarlo aún, no porque no lo quieran; ese 0% es un «todavía no se sabe»
// con forma de dato. Medido sobre el corpus real: en los meses donde la antelación tiene muestra
// insuficiente (House junio/julio-2027, 6-8 reservas), usar la ocupación del mes hundía el factor al
// suelo 0,92 contra el 0,9296 anual — bajando el precio justo en las fechas sin abrir. De ahí la
// regla: **la ocupación del mes solo se usa si la ventana de venta es JUZGABLE**; si no se puede
// juzgar, se usa el factor global de siempre y el motor se comporta como venía haciéndolo.
//
// Los tres estados de siempre, que es lo que evita reintroducir el bug con otro disfraz:
//   · ventana juzgable + mes medido → el factor sale del MES (y luego pasa por el gate);
//   · ventana NO juzgable           → factor global, comportamiento clásico (no inventamos ventanas);
//   · fuera de la ventana           → el descuento se neutraliza; el boost (>1) se conserva.
//
// Esa última asimetría es deliberada: la AUSENCIA de reservas a diez meses no es señal, pero su
// PRESENCIA sí, y de las buenas — nadie reserva tan pronto salvo que la fecha valga (Semana Santa,
// Feria…). Con los parámetros de producción (baseline 0,50 · k 0,16) premiar exige pasar del 50%
// vendido, que es un listón alto a propósito.
//
// Módulo PURO (sin BD ni `@/`) → testeable con node --test.

/**
 * Suelo y techo del factor de demanda. Son los MISMOS que aplica la SQL de `pricing/apply` al calcular
 * `demand_factor` (`GREATEST(LEAST(…, 1.10), 0.92)`): si se tocan aquí hay que tocarlos allí, o el
 * factor por mes y el global dejarían de vivir en la misma escala.
 */
export const DEMANDA_MIN = 0.92
export const DEMANDA_MAX = 1.10

/** La misma fórmula que la SQL, en JS, para poder alimentarla con la ocupación de un mes concreto. */
export function factorDemanda(p: { ocupacion: number; baseline: number; k: number }): number {
  const bruto = 1 + (p.ocupacion - p.baseline) * p.k
  return Math.max(Math.min(bruto, DEMANDA_MAX), DEMANDA_MIN)
}

export type DemandaFechaInput = {
  /** factor de demanda del piso que calculó el motor con la ocupación ANUAL (ya con suelo/techo) */
  factorDemanda: number
  /** días que faltan para la fecha (0 = hoy) */
  diasVista: number
  /** antelación MEDIANA medida del piso PARA EL MES de esa fecha (null = sin medir) */
  antelacionMediana: number | null
  /** nº de reservas observadas que sostienen esa mediana */
  muestra: number
  /** ocupación del MES de esa fecha (null/ausente = no hay snapshot de ese mes) */
  ocupacionMes?: number | null
  /** baseline y k del piso; hacen falta para recalcular el factor con `ocupacionMes` */
  demandaBaseline?: number
  demandaK?: number
}

export type DemandaFechaOpts = {
  /** reservas observadas mínimas para fiarse de la mediana (igual que el last-minute) */
  muestraMinima?: number
}

export type DemandaFechaResult = {
  /** factor a usar para ESTE día */
  factor: number
  /** true = el descuento se neutralizó porque la ventana de venta no ha abierto */
  gateado: boolean
  /** de dónde salió la ocupación que movió la palanca; para el informe y para poder auditarlo */
  fuente: "mes" | "global"
  motivo: string
}

export function factorDemandaFecha(i: DemandaFechaInput, o: DemandaFechaOpts = {}): DemandaFechaResult {
  const muestraMinima = o.muestraMinima ?? 10

  // ¿Podemos siquiera JUZGAR si esta fecha ya se vende? Sin mediana, sin muestra o con unos días vista
  // absurdos, no. Y si no podemos juzgarlo, tampoco podemos interpretar la ocupación de su mes.
  const ventanaJuzgable =
    i.antelacionMediana != null &&
    i.antelacionMediana > 0 &&
    i.muestra >= muestraMinima &&
    Number.isFinite(i.diasVista) &&
    i.diasVista >= 0

  // El factor de partida: el de SU MES cuando la ventana es juzgable y hay snapshot de ese mes; el
  // global del piso en cualquier otro caso. Sin esto, la palanca no puede premiar al mes que se llena.
  const usaMes =
    ventanaJuzgable &&
    i.ocupacionMes != null &&
    Number.isFinite(i.ocupacionMes) &&
    i.demandaBaseline != null &&
    i.demandaK != null
  const base = usaMes
    ? factorDemanda({ ocupacion: i.ocupacionMes as number, baseline: i.demandaBaseline as number, k: i.demandaK as number })
    : i.factorDemanda
  const fuente: DemandaFechaResult["fuente"] = usaMes ? "mes" : "global"

  if (base >= 1) {
    return { factor: base, gateado: false, fuente, motivo: "sin descuento que gatear (demanda ≥ baseline)" }
  }
  if (!ventanaJuzgable) {
    const porque =
      i.antelacionMediana == null || !(i.antelacionMediana > 0)
        ? "sin antelación medida"
        : i.muestra < muestraMinima
          ? `solo ${i.muestra} reservas observadas: muestra insuficiente`
          : "días vista inválidos"
    return { factor: base, gateado: false, fuente, motivo: `${porque}: descuento clásico` }
  }
  if (i.diasVista > (i.antelacionMediana as number)) {
    return {
      factor: 1,
      gateado: true,
      fuente,
      motivo:
        `faltan ${i.diasVista} días y este piso vende con ${i.antelacionMediana} de mediana: ` +
        "la ocupación baja aún no es señal, sin descuento",
    }
  }
  return { factor: base, gateado: false, fuente, motivo: "ventana de venta abierta: descuento aplicado" }
}
