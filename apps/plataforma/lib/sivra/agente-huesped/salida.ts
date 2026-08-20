// lib/sivra/agente-huesped/salida.ts — política de SALIDA TARDÍA y de dónde dejar las maletas el
// último día. Dictada por Alberto el 20/08/2026, a raíz de la respuesta a Pilar («¿podemos dejar
// las maletas el domingo?»), que la mandó a unas taquillas de pago cuando el piso podía estar libre.
//
// La política, tal cual:
//  - Consigna como servicio: NO existe (eso lo dice `equipaje.ts`).
//  - PERO el día de salida, si NO entra nadie ese mismo día, pueden QUEDARSE en el apartamento
//    hasta las 12:00 sin coste — y por tanto también dejar dentro las maletas hasta esa hora.
//  - Más tarde de las 12:00 sí es posible, pero hay que reorganizar a la empresa de limpieza y eso
//    TIENE COSTE, variable según la hora. El agente lo OFRECE, nunca pone precio: dice que lo
//    consulta y Alberto confirma.
// Aplica igual a los cuatro pisos.
//
// Por qué vive aquí y se inyecta en la `ficha` (mismo patrón que `llegada.ts` / `equipaje.ts`): la
// ficha es la única fuente de verdad del agente y la que valida el guardrail anti-invención, así que
// un dato que solo estuviera en el prompt seguiría contando como inventado aguas abajo.
//
// Que la política es la de siempre lo confirma el histórico de Smoobu: 26/07/2026, a Manuel —
// «Confirmado que puedes salir a las 12:00 sin problema, ya que no entra nadie después de ti».

// Hasta esta hora, el día de salida y con el piso libre, la estancia se alarga SIN COSTE.
export const SALIDA_FLEX_HASTA = '12:00'

// Bloque para la `ficha` del piso. El agente lo usa SOLO si el huésped pregunta por la salida o por
// dónde dejar las maletas (REGLA DE ORO: no añadir información no pedida).
export function bloqueSalida(horaCheckOut = '11:00'): string {
  const salida = horaCheckOut || '11:00'
  return [
    `SALIDA / QUEDARSE MÁS TARDE: la salida oficial es a las ${salida}. Si el día de la salida NO entra ningún huésped nuevo, se pueden quedar en el apartamento hasta las ${SALIDA_FLEX_HASTA} SIN COSTE, y eso incluye dejar el equipaje dentro y volver a por él antes de esa hora. Esta es la respuesta a "¿dónde dejamos las maletas el día que nos vamos?" cuando el piso queda libre: no hace falta ninguna consigna de pago.`,
    `Más allá de las ${SALIDA_FLEX_HASTA} también se puede, pero hay que reorganizar a la empresa de limpieza y TIENE UN COSTE que depende de la hora de salida. Puedes ofrecérselo, pero NUNCA des un precio ni digas que es gratis: dile que lo consultas y se lo confirmas.`,
    `Esta flexibilidad depende de que el piso quede libre ese día: si entra otro huésped, no es posible y la salida es a las ${salida} (ahí sí valen las consignas del bloque anterior).`,
  ].join('\n')
}

// Bloque para el system prompt, según lo que se haya podido verificar de la ocupación del día de
// salida. Tri-estado, como el early check-in: verificado y libre / verificado y ocupado / sin
// verificar — porque prometer una hora extra que luego no hay es peor que no ofrecerla.
export function bloqueSalidaTardia(opts: {
  horaCheckOut?: string
  chequeado: boolean
  posible: boolean
  esDiaSalida: boolean
}): string {
  const salida = opts.horaCheckOut || '11:00'
  const coste =
    `Si necesita MÁS TARDE de las ${SALIDA_FLEX_HASTA}, dile que también es posible pero que tiene un coste ` +
    `(hay que reorganizar a la empresa de limpieza) que depende de la hora, y que lo consultas y se lo confirmas. ` +
    `NUNCA le des un importe ni se lo des por gratis.`

  if (!opts.chequeado) {
    return `SALIDA TARDÍA: ahora mismo NO hemos podido comprobar si el piso queda libre el día de su salida. Si pide salir más tarde de las ${salida} o pregunta dónde dejar las maletas ese día, NO se lo confirmes NI se lo niegues: dile con amabilidad que lo verificas y se lo confirmas en breve. NUNCA inventes disponibilidad.`
  }
  if (!opts.posible) {
    return `SALIDA TARDÍA: ese día entra otro huésped al piso, así que NO es posible alargar la salida más allá de las ${salida} (hay que limpiarlo y prepararlo para la siguiente entrada) y tampoco pueden dejar el equipaje dentro. Explícaselo con amabilidad y ofrécele la consigna del bloque CONSIGNAS de la ficha para que pueda dejar las maletas y seguir disfrutando de la ciudad.`
  }
  if (opts.esDiaSalida) {
    return `SALIDA TARDÍA: hoy, que es su día de salida, no entra nadie más al piso, así que SÍ puedes confirmarle que pueden quedarse hasta las ${SALIDA_FLEX_HASTA} sin coste —y dejar dentro las maletas hasta esa hora si prefieren salir a dar una vuelta—. ${coste}`
  }
  return `SALIDA TARDÍA: ahora mismo no hay ninguna entrada programada para el día de su salida, así que EN PRINCIPIO SÍ van a poder quedarse hasta las ${SALIDA_FLEX_HASTA} sin coste (y dejar dentro el equipaje hasta esa hora). Como pueden entrar reservas de última hora, NO se lo prometas en firme todavía: dile que en principio no hay problema y que se lo confirmáis el mismo día de la salida. ${coste}`
}
