// lib/sivra/pricing-centinelas.ts — centinelas PUROS (sin BD ni red) que vigilan el pricing.
//
// POR QUÉ EXISTEN (31/07/2026). Los tres fallos caros encontrados ese día tenían la misma forma: un
// dato metido a ojo o marcado "provisional", que nadie volvió a mirar, y que el motor siguió usando
// como verdad durante meses. Ninguno se detectó porque el motor NO TENÍA FORMA DE QUEJARSE:
//   · La Feria de Abril 2027 estaba una semana tarde → 7 noches normales tarificadas de Feria (×2,5
//     de precio y ×2 de suelo) y los días de Feria real sin protección.
//   · Los comparables de una casa de 12 plazas eran apartamentos de 4 → House a mitad de precio.
//   · Septiembre 2026, mes alto, sin un solo evento catalogado (ahí cae la Bienal de Flamenco).
//
// La idea de fondo: en vez de fiarnos de que alguien revise, que el sistema CONTRASTE lo que hace
// contra el mercado real y avise solo. Cada centinela responde a una pregunta concreta con datos que
// ya tenemos, y todos comparten dos principios:
//
//   1. SIN DATOS NO SE OPINA. Devuelven `evaluado:false` cuando falta muestra — nunca un "todo bien"
//      que en realidad significa "no lo he mirado" (regla global del repo sobre NULL ≠ 0).
//   2. CONSERVADORES. El pecado capital aquí es la falsa alarma que hace ignorar el canal (lección
//      del 19/07). Umbrales holgados y mínimos de muestra en todos.

/** Resultado común: si no se pudo evaluar, `alerta` es false pero `evaluado` también. */
export type Veredicto = {
  alerta: boolean
  /** false = no había datos suficientes. NO confundir con "todo correcto". */
  evaluado: boolean
  motivo: string
}

const NO_EVALUADO = (motivo: string): Veredicto => ({ alerta: false, evaluado: false, motivo })

// ─── 1. Evento declarado que el mercado NO respalda ──────────────────────────────────────────
// Caza fechas de evento EQUIVOCADAS. Si el calendario dice "Feria, ×2,5" pero el mercado de ese día
// está en línea con un día normal del mes, o la fecha está mal o el evento no mueve el mercado. En
// ambos casos estamos inflando un día normal, que es exactamente lo que pasó con el 19-25 de abril.

export type EventoSinRespaldoInput = {
  /** factor de evento que aplicaría el motor (MAX de calendario y pricing_eventos_auto) */
  factorEvento: number
  /** p50 del mercado real de ESA fecha, ya normalizado por aforo */
  p50Fecha: number | null
  /** p50 del mercado del MES de esa fecha (la referencia de "día normal") */
  p50Mes: number | null
  /** nº de comparables de esa fecha (para no opinar con muestra ridícula) */
  compsFecha: number
}

export type EventoSinRespaldoOpts = {
  /** solo miramos eventos de verdad, no puentes flojos */
  factorMinimo?: number
  /** por debajo de este ratio fecha/mes, el mercado NO respalda el evento */
  ratioMinimo?: number
  minComps?: number
}

// OJO con el umbral: el p50 del MES ya viene inflado por el propio evento (abril 2027 va a 310€ de
// mediana justo porque dentro caen Feria y Semana Santa). Exigirle a una noche de Feria que supere
// esa mediana por mucho es pedirle que le gane a sí misma, así que el listón se queda BAJO (1,15):
// con los datos reales del 31/07/2026 separa igual los días de Feria (1,25x) de los días normales
// que estaban mal marcados como Feria (0,87x y 1,04x), y no castiga los meses con muchos eventos.
export function decidirEventoSinRespaldo(
  i: EventoSinRespaldoInput,
  o: EventoSinRespaldoOpts = {},
): Veredicto {
  const factorMinimo = o.factorMinimo ?? 2.0
  const ratioMinimo = o.ratioMinimo ?? 1.15
  const minComps = o.minComps ?? 6

  if (!(i.factorEvento >= factorMinimo)) {
    return NO_EVALUADO(`factor ${i.factorEvento} por debajo del umbral de evento fuerte`)
  }
  if (i.compsFecha < minComps || !i.p50Fecha || !i.p50Mes || i.p50Mes <= 0) {
    return NO_EVALUADO('sin mercado suficiente de esa fecha: no se puede confirmar ni desmentir')
  }

  const ratio = i.p50Fecha / i.p50Mes
  if (ratio >= ratioMinimo) {
    return { alerta: false, evaluado: true, motivo: `mercado ${ratio.toFixed(2)}x el mes: el evento se sostiene` }
  }
  return {
    alerta: true,
    evaluado: true,
    motivo:
      `evento declarado x${i.factorEvento} pero el mercado de ese día (${Math.round(i.p50Fecha)}€) ` +
      `solo va a ${ratio.toFixed(2)}x el mes (${Math.round(i.p50Mes)}€). ` +
      `Revisa la FECHA del evento: puede estar desplazada.`,
  }
}

// ─── 2. Mercado disparado SIN evento catalogado ──────────────────────────────────────────────
// El espejo del anterior: caza eventos que no conocemos. Si el mercado de un día se dispara respecto
// a su mes y no hay evento en ninguna fuente, alguien sabe algo que nosotros no. Es el que habría
// destapado la Bienal de Flamenco de septiembre.

export type EventoNoCatalogadoInput = {
  factorEvento: number
  p50Fecha: number | null
  p50Mes: number | null
  compsFecha: number
}

export type EventoNoCatalogadoOpts = {
  /** a partir de este ratio fecha/mes el mercado grita "aquí pasa algo" */
  ratioAviso?: number
  minComps?: number
  /** si ya hay un evento con al menos este factor, no avisamos: ya está contemplado */
  factorYaCubierto?: number
}

export function decidirEventoNoCatalogado(
  i: EventoNoCatalogadoInput,
  o: EventoNoCatalogadoOpts = {},
): Veredicto {
  const ratioAviso = o.ratioAviso ?? 1.5
  const minComps = o.minComps ?? 6
  const factorYaCubierto = o.factorYaCubierto ?? 1.15

  if (i.compsFecha < minComps || !i.p50Fecha || !i.p50Mes || i.p50Mes <= 0) {
    return NO_EVALUADO('sin mercado suficiente de esa fecha')
  }
  if (i.factorEvento >= factorYaCubierto) {
    return { alerta: false, evaluado: true, motivo: `ya catalogado (x${i.factorEvento})` }
  }

  const ratio = i.p50Fecha / i.p50Mes
  if (ratio < ratioAviso) {
    return { alerta: false, evaluado: true, motivo: `mercado normal (${ratio.toFixed(2)}x el mes)` }
  }
  return {
    alerta: true,
    evaluado: true,
    motivo:
      `el mercado de ese día se dispara a ${ratio.toFixed(2)}x el mes ` +
      `(${Math.round(i.p50Fecha)}€ vs ${Math.round(i.p50Mes)}€) y NO hay evento catalogado. ` +
      `Probablemente hay algo en Sevilla ese día que el calendario no conoce.`,
  }
}

// ─── 3. Precio por PLAZA indigno ─────────────────────────────────────────────────────────────
// La métrica que pidió Alberto tras ver Socorro: "165€ en una casa de 12 plazas son 13,75€ por
// persona". Un total puede parecer alto y ser precio de hostal al repartirlo. Este centinela mira el
// precio EFECTIVO por plaza (tras el descuento típico de canal), que es lo que de verdad se cobra.

export type PrecioPorPlazaInput = {
  /** precio de listado por noche */
  precio: number
  plazas: number | null
  /** ratio de lo que queda tras el stack de canal (Booking ≈0,76 en estancias largas) */
  ratioCanal?: number
}

export type PrecioPorPlazaOpts = {
  /** mínimo digno de € por plaza y noche, ya en efectivo */
  minimoPorPlaza?: number
  /** por debajo de este aforo la métrica NO aplica (ver nota) */
  plazasMinimas?: number
}

// ⚠️ Solo aplica a pisos GRANDES, y no es un tecnicismo: en un apartamento pequeño las "plazas" son
// en buena parte sofás-cama (Luxury son 5 plazas en 2 dormitorios), así que dividir por ellas da un
// número que no significa nada — su suelo de 72€ saldría a 10,94€/plaza y sin embargo cubre el coste
// 2,4 veces y va a precio de mercado. Donde el reparto SÍ manda es en una casa de 12 plazas, que es
// justo el caso que levantó Alberto. Por debajo del umbral devolvemos "no evaluado", no "correcto":
// a esos pisos los vigilan el suelo de coste y el ancla de mercado, no esta métrica.
export function decidirPrecioPorPlaza(i: PrecioPorPlazaInput, o: PrecioPorPlazaOpts = {}): Veredicto {
  const minimo = o.minimoPorPlaza ?? 18
  const plazasMinimas = o.plazasMinimas ?? 6
  const ratioCanal = i.ratioCanal ?? 0.76

  if (!i.plazas || i.plazas <= 0 || !(i.precio > 0)) {
    return NO_EVALUADO('sin aforo o sin precio: no se puede juzgar el € por plaza')
  }
  if (i.plazas < plazasMinimas) {
    return NO_EVALUADO(`aforo ${i.plazas}: en un piso pequeño el €/plaza no mide nada (lo vigilan el suelo y el mercado)`)
  }

  const efectivoPorPlaza = (i.precio * ratioCanal) / i.plazas
  if (efectivoPorPlaza >= minimo) {
    return {
      alerta: false,
      evaluado: true,
      motivo: `${efectivoPorPlaza.toFixed(2)}€ por plaza en efectivo`,
    }
  }
  return {
    alerta: true,
    evaluado: true,
    motivo:
      `${i.precio}€ entre ${i.plazas} plazas se queda en ${efectivoPorPlaza.toFixed(2)}€ por plaza y noche ` +
      `tras el descuento de canal (min ${minimo}€). Para un piso de ese tamaño es regalarlo.`,
  }
}
