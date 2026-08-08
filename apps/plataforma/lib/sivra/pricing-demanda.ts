// lib/sivra/pricing-demanda.ts — la palanca de DEMANDA del motor, y por qué mira el mes y no el año.
//
// POR QUÉ (08/08/2026). La subconsulta `occ` de `pricing/apply` calculaba UNA ocupación por piso para
// los 365 días (`rate_date >= CURRENT_DATE`, sin cota superior) y la aplicaba a TODAS las fechas. El día
// que se activaron los 4 pisos, esa cifra era del 1-8% —real, contrastada contra las reservas de
// Smoobu— y mandó el factor de demanda a su suelo (0,92) en todo el calendario por igual. Septiembre,
// al 30%, recibía el mismo castigo que marzo de 2027 al 0%. La palanca que debe subir el precio del mes
// que se está llenando estaba ciega al mes.
//
// 🚨 PERO EL ARREGLO OBVIO ES PEOR QUE LA AVERÍA. Partir la ocupación por mes, sin más, hunde justo los
// meses que todavía no se venden: un mes a diez meses vista está al 0% porque NADIE ha podido reservarlo
// aún, no porque no lo quieran. Ese 0% es un «todavía no se sabe» con forma de dato — el mismo veneno
// que el CLAUDE.md raíz persigue en `?? 0`, solo que aquí el cero es de verdad y aun así no significa
// lo que parece. Con el factor por mes a pelo, Semana Santa de 2027 se tarificaría hoy a precio de
// derribo por no tener reservas en agosto de 2026.
//
// La pregunta correcta no es «¿cuánto lleva vendido este mes?» sino **«¿cuánto lleva vendido PARA LO
// QUE TOCA a estas alturas?»**. Y el motor ya sabe a qué antelación se vende cada piso en cada mes: lo
// mide `antelacionDe` en `pricing/apply` contra `incomes.reserved_at`, el histórico REAL de Smoobu
// (mediana de días entre la reserva y la entrada, agrupada por piso y mes del año). Se reutiliza esa
// medición en vez de inventar una curva de llenado que no tenemos.
//
// Regla, con los tres estados de siempre:
//   · fecha DENTRO de la ventana de venta  → la ocupación del mes es un dato → factor por mes;
//   · fecha FUERA (más lejos de lo que ese piso vende en ese mes) → «no se sabe» → factor NEUTRO (1);
//   · sin antelación medida para ese mes   → se cae a la ocupación global (lo de antes, sin sorpresas).
//
// El estado conservador aquí es el NEUTRO, no el suelo: ante la duda no se regala margen.
//
// ASIMETRÍA DELIBERADA fuera de la ventana. «Nadie ha reservado marzo todavía» no es información —
// es que aún no toca. Pero «marzo ya va medio vendido a diez meses vista» SÍ lo es, y de las buenas:
// nadie reserva tan pronto salvo que la fecha valga. Así que fuera de la ventana el factor solo puede
// SUBIR: si la ocupación del mes queda por debajo del baseline se ignora (neutro), y si lo supera se
// aplica tal cual. Con los parámetros de producción (baseline 0,50 · k 0,16) eso exige pasar del 50%
// vendido, que es un listón alto a propósito. Caso real que lo motivó (08/08/2026): Busto y Luxury
// tenían el 22,6% de marzo-2027 ya bloqueado —la Semana Santa cae el 22-28 de marzo— a 205 días vista.

/** Suelo y techo del factor de demanda. Son los mismos que la SQL venía aplicando; no se tocan. */
export const DEMANDA_MIN = 0.92
export const DEMANDA_MAX = 1.10

/**
 * Cuántas veces la antelación mediana se considera todavía «ventana de venta». Con 2 el mes entra en
 * juego al doble de pronto de lo que se vende de mediana, que deja margen para las reservas tempranas
 * sin abrir la puerta a fechas que nadie ha podido reservar aún.
 */
export const FACTOR_VENTANA = 2

/** Muestra mínima de reservas para fiarse de la antelación mediana de un mes. */
export const MIN_MUESTRA_ANTELACION = 5

export function factorDemanda(p: { ocupacion: number; baseline: number; k: number }): number {
  const bruto = 1 + (p.ocupacion - p.baseline) * p.k
  return Math.max(Math.min(bruto, DEMANDA_MAX), DEMANDA_MIN)
}

/**
 * ¿La ocupación observada de esta fecha DICE algo? Solo si la fecha ya entró en la ventana en la que
 * ese piso se vende de verdad. Sin antelación medida (o con muestra ridícula) devuelve null = «no lo
 * sé», que aguas arriba significa «usa la global», no «castiga».
 */
export function ocupacionEsInformativa(p: {
  diasVista: number
  antelacion: { mediana: number; muestra: number } | null
  factorVentana?: number
}): boolean | null {
  if (!p.antelacion || p.antelacion.muestra < MIN_MUESTRA_ANTELACION) return null
  const ventana = p.antelacion.mediana * (p.factorVentana ?? FACTOR_VENTANA)
  return p.diasVista <= ventana
}

export type FactorDemandaFecha = {
  factor: number
  /** de dónde salió, para el informe de la pasada y para poder auditarlo después */
  fuente: 'mes' | 'mes-anticipado' | 'global' | 'neutro-fuera-de-ventana'
}

/**
 * El factor de demanda que le toca a UNA fecha. `ocupacionMes` es la del mes de esa fecha (null si no
 * hay snapshot de ese mes); `ocupacionGlobal` es la de siempre, que sigue siendo el fallback.
 */
export function factorDemandaDeLaFecha(p: {
  diasVista: number
  ocupacionMes: number | null
  ocupacionGlobal: number
  antelacion: { mediana: number; muestra: number } | null
  baseline: number
  k: number
  factorVentana?: number
}): FactorDemandaFecha {
  const informativa = ocupacionEsInformativa({
    diasVista: p.diasVista, antelacion: p.antelacion, factorVentana: p.factorVentana,
  })

  // Sin antelación fiable no cambiamos nada respecto de lo que el motor venía haciendo.
  if (informativa === null) {
    return { factor: factorDemanda({ ocupacion: p.ocupacionGlobal, baseline: p.baseline, k: p.k }), fuente: 'global' }
  }

  // Fuera de la ventana de venta la AUSENCIA de reservas no es señal: un mes que nadie ha podido
  // reservar todavía no está «flojo», está sin abrir → neutro. Su PRESENCIA sí lo es: si a esas
  // alturas ya está vendido por encima del baseline, alguien pagó muy por adelantado y eso solo pasa
  // con las fechas que valen. Por eso aquí el factor solo puede subir, nunca bajar.
  if (!informativa) {
    if (p.ocupacionMes === null) return { factor: 1, fuente: 'neutro-fuera-de-ventana' }
    const f = factorDemanda({ ocupacion: p.ocupacionMes, baseline: p.baseline, k: p.k })
    return f > 1
      ? { factor: f, fuente: 'mes-anticipado' }
      : { factor: 1, fuente: 'neutro-fuera-de-ventana' }
  }

  // Dentro de la ventana, si falta el dato del mes se usa la global (mismo criterio de siempre).
  if (p.ocupacionMes === null) {
    return { factor: factorDemanda({ ocupacion: p.ocupacionGlobal, baseline: p.baseline, k: p.k }), fuente: 'global' }
  }

  return { factor: factorDemanda({ ocupacion: p.ocupacionMes, baseline: p.baseline, k: p.k }), fuente: 'mes' }
}
