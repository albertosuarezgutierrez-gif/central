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

// ─── 4. El mercado de un piso se está leyendo de comps de OTRO tamaño ────────────────────────
//
// POR QUÉ (01/08/2026, lo levantó Alberto: «House Sevillana aún está como dúplex»).
//
// El 31/07 se arregló que el barrido buscara por el AFORO REAL de cada piso, y el motor pasó a
// NORMALIZAR cada comparable con `pricing_factor_aforo` antes de meterlo en el percentil. Las dos
// cosas son correctas y ninguna de las dos avisa de esto: que los comps de un piso sean, todos, de
// un tamaño distinto al suyo. Cuando pasa, el ancla de mercado deja de ser una MEDICIÓN y se
// convierte en una EXTRAPOLACIÓN — un número perfectamente plausible que nadie puede distinguir de
// uno medido, que es la forma más cara de error que hay en este repo (ver la regla del NULL que se
// pinta como 0, y el flujo de caja de ORCL leído del periodo equivocado).
//
// Caso real que lo motiva: el 01/08/2026 los 30 comps vivos de House —casa de 12 plazas— eran de
// apartamentos de 8 plazas (media 314€). Normalizados salen a 403€, mientras los últimos comps de
// 12 plazas de verdad (junio) estaban en 621-694€. El motor no mentía: extrapolaba. Pero una
// propuesta de bajar el precio de la casa salida de ahí sí habría sido una decisión tomada sobre
// una casa que no es la suya.
//
// Esto NO sustituye a la normalización: es el aviso de que la normalización está haciendo todo el
// trabajo. La respuesta correcta es lanzar un barrido del aforo bueno, no tocar el precio.

export type CompsDeOtroAforoInput = {
  /** plazas reales del piso (pricing_piso_zona.max_guests) */
  plazasPiso: number | null
  /** comps de la búsqueda MÁS RECIENTE, agrupados por el aforo con el que se buscaron */
  comps: { plazas: number; n: number }[]
}

export type CompsDeOtroAforoOpts = {
  minComps?: number
  /** cuota mínima de comps del propio aforo para dar el ancla por medida */
  minCuotaPropia?: number
  /** extrapolación tolerable antes de avisar (ver nota del umbral) */
  factorMaxTolerado?: number
}

/**
 * Mismo cálculo que la función SQL `pricing_factor_aforo` (exponente 1,1 y recorte a [0,6 · 2,5]).
 * Está duplicado a propósito: el centinela tiene que poder decir EXACTAMENTE cuánto está
 * extrapolando el motor, y hacerlo puro es lo que permite testearlo. Si cambia la función SQL,
 * cambia esta — el test de abajo fija los valores que hoy comparten.
 */
export function factorAforo(plazasPiso: number, plazasComp: number): number {
  if (!(plazasPiso > 0) || !(plazasComp > 0) || plazasPiso === plazasComp) return 1
  return Math.min(2.5, Math.max(0.6, Math.pow(plazasPiso / plazasComp, 1.1)))
}

// ⚠️ EL UMBRAL ES HOLGADO A PROPÓSITO (1,35). Con 1,25 saltaría también Luxury Busto, que son 5
// plazas medidas con comps de 4 (factor 1,28): esa diferencia de UNA plaza es ruido de cómo cada
// anfitrión cuenta los sofás-cama, y un canal que avisa de eso todas las semanas se acaba
// ignorando — la lección del 19/07. A 1,35 pasa Luxury y salta House (1,56), que es la diferencia
// que de verdad cambia una decisión de precio.
export function decidirCompsDeOtroAforo(
  i: CompsDeOtroAforoInput,
  o: CompsDeOtroAforoOpts = {},
): Veredicto {
  const minComps = o.minComps ?? 8
  const minCuotaPropia = o.minCuotaPropia ?? 0.5
  const factorMaxTolerado = o.factorMaxTolerado ?? 1.35

  const plazas = Number(i.plazasPiso ?? 0)
  const total = i.comps.reduce((a, c) => a + (Number(c.n) || 0), 0)

  if (!(plazas > 0)) return NO_EVALUADO('el piso no tiene aforo declarado: no se puede juzgar contra qué se compara')
  if (total < minComps) return NO_EVALUADO(`solo ${total} comparables: muestra insuficiente para opinar del aforo`)

  const propios = i.comps.filter(c => Number(c.plazas) === plazas).reduce((a, c) => a + Number(c.n), 0)
  const cuota = propios / total
  if (cuota >= minCuotaPropia) {
    return {
      alerta: false,
      evaluado: true,
      motivo: `${Math.round(cuota * 100)}% de los comparables son de ${plazas} plazas: el ancla está medida`,
    }
  }

  // El aforo que MANDA en la muestra es el que más comps aporta: es el que decide de qué tamaño de
  // piso viene de verdad el ancla.
  const dominante = i.comps
    .filter(c => Number(c.n) > 0 && Number(c.plazas) > 0)
    .sort((a, b) => Number(b.n) - Number(a.n))[0]
  if (!dominante) return NO_EVALUADO('los comparables no traen aforo: no se puede juzgar')

  const factor = factorAforo(plazas, Number(dominante.plazas))
  const desvio = Math.max(factor, 1 / factor)
  if (desvio <= factorMaxTolerado) {
    return {
      alerta: false,
      evaluado: true,
      motivo: `comparables de ${dominante.plazas} plazas para un piso de ${plazas}: extrapolación x${factor.toFixed(2)}, dentro de lo tolerable`,
    }
  }

  return {
    alerta: true,
    evaluado: true,
    motivo:
      `el ${Math.round((1 - cuota) * 100)}% de los comparables vivos son de ${dominante.plazas} plazas y el piso tiene ${plazas}. ` +
      `El precio de mercado no está MEDIDO, está EXTRAPOLADO x${factor.toFixed(2)} desde un piso de otro tamaño. ` +
      `Lanza un barrido del aforo correcto antes de mover el precio con este dato.`,
  }
}
