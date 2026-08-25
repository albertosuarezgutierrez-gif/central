// lib/sivra/pricing-base-evento.ts — sobre QUÉ base se multiplica el factor de un evento.
//
// 🚨 EL SERRUCHO (diagnosticado el 25/08/2026). Durante semanas los precios de casi todas las
// fechas subían y bajaban dentro de la misma semana —el 74% del calendario, con un factor 1,44
// entre su máximo y su mínimo—. No era el mercado moviéndose: era la COMPOSICIÓN de la muestra.
//
// El ancla GLOBAL del motor (`med_guest_global`) es el percentil de los comparables de la ÚLTIMA
// pasada de Booking, y esa pasada muestrea cada mañana un puñado distinto de fechas de entrada
// (5-19 de las ~111 del horizonte). Medido en Duplex Center:
//
//     pasada    fechas muestreadas                                mediana
//     23/08      6 (oct-25, nov-08, dic-20, dic-24, dic-25, mar-25)   129€
//     24/08     19 (incluye Semana Santa y Feria: 2.437€, 3.137€)     205€
//     25/08      6 (cinco noches muertas de enero: 273-352€)          146€
//
// Ese número entraba aquí multiplicado por el factor del evento, y —como el salto de evento se
// salta el raíl ±20%/día A PROPÓSITO, que para eso es un evento y no ruido— viajaba entero al
// precio en UNA sola pasada. Duplex 16/09/2026 (Betis-Getafe, factor 1,35): 158€ → 289€ (+83%) el
// 24/08, y a bajar otra vez al día siguiente, esa vez sí a ritmo de raíl (−20%/día). Con el Sevilla
// FC y el Betis jugando casi cada semana, casi toda fecha es fecha de evento: de ahí el 74%.
//
// La base correcta ya estaba en el motor: el bucket del MES. Es la que hay que usar porque
//   · EXCLUYE las fechas con evento (`FACTOR_EVENTO_EXCLUIR`) → es precio de noche NORMAL de ese
//     mes, así que multiplicarla por el factor NO es doble conteo (que era el motivo por el que se
//     eligió la global en su día, ver #985);
//   · distingue temporada (un sábado de diciembre no es un martes de febrero), cosa que la global
//     —una mediana de todo el horizonte revuelto— no puede hacer por construcción;
//   · se mide sobre el corpus ACUMULADO de 120 días, no sobre el barrido de esta mañana: en la
//     semana del incidente el bucket de septiembre de Duplex se movió 122€ → 123€.
//
// Sin bucket del mes se sigue cayendo al ancla global. Es peor, pero es lo único que hay, y el
// motor ya avisa por otra vía cuando un mes se queda sin mercado medido.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

export type BaseEventoInput = {
  /**
   * Base del BUCKET DEL MES, ya acotada entre su suelo y su techo, o `null` si ese mes no llega a
   * los mínimos de muestra (`MIN_BUCKET` comps de `MIN_FECHAS_MES` fechas distintas).
   */
  baseMes: number | null
  /** Base del ANCLA GLOBAL, ya acotada. Respaldo cuando el mes no tiene mercado medido. */
  baseGlobal: number
}

export type BaseEventoResult = {
  /** Base sobre la que multiplicar el factor del evento. */
  base: number
  /** De dónde salió. Viaja a la respuesta del motor: un salto anclado a la global es más frágil. */
  origen: "mes" | "global"
}

/**
 * Base del salto de evento. El bucket del MES manda siempre que exista; la global es el respaldo.
 *
 * `baseMes` no válida (null, 0, negativa, NaN) cae a la global — un mes sin mercado medido no es
 * un mes a precio cero.
 */
export function baseSaltoEvento(i: BaseEventoInput): BaseEventoResult {
  const mes = i.baseMes
  if (mes != null && Number.isFinite(mes) && mes > 0) return { base: mes, origen: "mes" }
  return { base: i.baseGlobal, origen: "global" }
}
