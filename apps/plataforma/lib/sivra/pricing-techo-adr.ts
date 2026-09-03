// Techo ABSOLUTO por lo que este piso ha cobrado de verdad. El raíl que faltaba.
//
// ── POR QUÉ (03/09/2026) ─────────────────────────────────────────────────────────────────────
// El motor tiene suelo (`min_price`, suelo estacional) y varios techos, pero TODOS son relativos
// al mercado: `max_price` (casi siempre NULL), el techo de mercado medido y el `ceil_pctl`. El
// histórico propio entraba solo por `prior-estacional.ts`, y ahí es un ÍNDICE que multiplica el
// ancla de mercado — nunca compara el precio resultante con euros que alguien haya pagado.
//
// Consecuencia medida el 03/09/2026, mismo mes contra mismo mes, en precio BRUTO al huésped:
//
//     piso            cobrado de verdad     pedíamos          multiplicador
//     Busto Reform        57-122€           115-244€           ×1,6 – ×3,1
//     Luxury Busto        90-129€           174-306€           ×1,9 – ×2,6
//     Duplex Center       67-119€           144-212€           ×1,6 – ×2,1
//     House Sevillana    382-692€           524-918€           ×0,85 – ×1,7
//
// Nada en el motor podía ver eso, porque nada miraba los euros. Un ancla de mercado equivocada
// —comps fuera de nuestra liga, ver `pricing-comps-liga.ts`— se propagaba entera hasta Smoobu.
// Este módulo es la última red: aunque el ancla vuelva a envenenarse, el precio no puede alejarse
// arbitrariamente de lo que este piso concreto consigue cobrar.
//
// ── LAS TRES CONDICIONES DE SEGURIDAD ────────────────────────────────────────────────────────
//
//   1. **Sin muestra no hay techo, y eso NO es «no hay problema».** Por debajo de
//      `MIN_NOCHES_ADR` noches vendidas en ese mes devuelve `null` = «no lo sé». Colapsarlo a un
//      número sería inventar un techo con dos reservas, y colapsarlo a «ok» sería la mentira que
//      persigue la regla global de `CLAUDE.md` («Dato que NO hay ≠ dato que NO se ha mirado»).
//      Quien llame tiene que distinguir los dos casos: por eso se devuelve `motivo`.
//
//   2. **Las fechas de EVENTO quedan fuera.** Un evento nuevo no está en el histórico de ese mes
//      —por definición— y taparlo con la media del mes es la forma más cara de equivocarse: se
//      vende la Feria a precio de martes y eso no se recupera. El umbral `UMBRAL_EVENTO = 1.15`
//      es el mismo que ya usan el bucket del mes y `pricing-lastminute.ts`, para que las tres
//      piezas tengan una sola definición de «esta fecha no es normal».
//
//      Caso real que lo obligó: el 19-21/02/2027 es el Zurich Maratón de Sevilla (40.000
//      dorsales). El mercado sube ×2,5 ese fin de semana en los cuatro escenarios y el motor lo
//      siguió BIEN — el precio de esas noches está entre los pocos que hoy son correctos. Un
//      techo por ADR de febrero se los habría comido.
//
//   3. **El techo nunca perfora el suelo.** Si el suelo del piso queda por encima del techo, manda
//      el suelo: «bajar, pero sin regalar el precio» es una decisión ya tomada en esta casa
//      (`prior-estacional.ts`, 06/08/2026) y este módulo no la revisa.
//
// ── LA HOLGURA ───────────────────────────────────────────────────────────────────────────────
// `HOLGURA_ADR = 1,30` no es «el precio correcto»: es el punto donde dejamos de creernos el
// mercado. El objetivo lo fija `target_pctl` sobre el corpus ya filtrado, y con la calibración
// del 03/09/2026 cae en 1,01-1,11× el ADR real de cada piso — o sea, este techo NO debe morder en
// una fecha normal. Si muerde, es la señal de que el ancla se ha vuelto a ir, y por eso el motivo
// viaja a la respuesta en vez de aplicarse en silencio.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

/** Cuánto por encima del ADR probado de ese mes se permite pedir antes de frenar. */
export const HOLGURA_ADR = 1.30

/**
 * Noches vendidas mínimas en ese mes para que su ADR sea un techo y no una anécdota.
 * Mismo número que `MIN_NOCHES_MES` de `prior-estacional.ts`, y por el mismo motivo.
 */
export const MIN_NOCHES_ADR = 30

/** Por encima de este factor de evento la fecha no se juzga con el histórico del mes. */
export const UMBRAL_EVENTO = 1.15

export type MotivoTecho =
  /** hay techo y es este */
  | 'aplicado'
  /** el objetivo ya estaba por debajo: el techo no ha hecho nada */
  | 'no_muerde'
  /** fecha de evento: el histórico del mes no la describe */
  | 'evento'
  /** no hay noches suficientes vendidas ese mes: NO es «todo en orden» */
  | 'sin_muestra'
  /** el suelo del piso queda por encima del techo: manda el suelo */
  | 'suelo_manda'

export interface TechoAdr {
  /** techo en la MISMA unidad que `objetivo` (base de Smoobu). `null` = no se sabe. */
  techo: number | null
  /** objetivo ya recortado (o el original si el techo no muerde/no se sabe) */
  objetivo: number
  motivo: MotivoTecho
}

/**
 * Aplica el techo por ADR propio a un objetivo de precio.
 *
 * `adrBase` y `objetivo` van en la MISMA unidad —base de Smoobu—: quien llama convierte el ADR
 * bruto del huésped a base con la misma conversión de canal que usa el motor (`aBase`), para que
 * la comparación sea homogénea. Mezclar aquí precio de huésped con base sería el fallo que
 * `pricing-precio-huesped.ts` documenta en su cabecera.
 */
export function aplicarTechoAdr(input: {
  objetivo: number
  /** ADR del mes, ya convertido a base. `null` si no hay histórico utilizable. */
  adrBase: number | null
  /** noches vendidas de ese mes en todo el histórico */
  nochesMuestra: number
  /** factor de evento de ESA fecha (1 = día normal) */
  factorEvento?: number
  /** suelo ya aplicado al objetivo (min_price / suelo estacional) */
  suelo?: number | null
  holgura?: number
}): TechoAdr {
  const { objetivo, adrBase, nochesMuestra } = input
  const holgura = input.holgura ?? HOLGURA_ADR
  const factorEvento = Number(input.factorEvento ?? 1)

  if (factorEvento >= UMBRAL_EVENTO) return { techo: null, objetivo, motivo: 'evento' }
  if (adrBase == null || !Number.isFinite(Number(adrBase)) || Number(adrBase) <= 0
      || !(Number(nochesMuestra) >= MIN_NOCHES_ADR)) {
    return { techo: null, objetivo, motivo: 'sin_muestra' }
  }

  let techo = Math.round(Number(adrBase) * holgura)
  const suelo = input.suelo != null && Number.isFinite(Number(input.suelo)) ? Number(input.suelo) : null
  if (suelo != null && techo < suelo) {
    return { techo: suelo, objetivo: Math.max(objetivo, suelo), motivo: 'suelo_manda' }
  }
  if (objetivo <= techo) return { techo, objetivo, motivo: 'no_muerde' }
  return { techo, objetivo: techo, motivo: 'aplicado' }
}
