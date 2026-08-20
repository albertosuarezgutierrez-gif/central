// apps/plataforma/lib/sivra/disponibilidad-publica.ts
//
// Clasificación de noches para el calendario público de la landing de House Sevillana.
//
// Por qué esto es un módulo aparte y testeado en vez de tres líneas dentro del handler: la
// respuesta de Smoobu tiene TRES estados, no dos. `available: 1` es libre, `available: 0` es
// ocupada, y una fecha que no viene —o que viene sin el campo, o con null— es «no lo sé».
//
// Colapsar ese tercer caso a «libre» le diría a un huésped que puede reservar una noche sobre
// la que no tenemos ni un dato, que es exactamente la mentira que prohíbe la regla «dato que NO
// hay ≠ dato que NO se ha mirado» del CLAUDE.md raíz. Y es una mentira cara: la reserva directa
// es el canal que existe para esquivar la comisión de Booking, así que un calendario que se
// equivoca ahí quema justo la confianza que ese canal necesita.
//
// De ahí que el contrato devuelva los dos cubos «negativos» (ocupadas y sinDato) y deje «libre»
// como lo que queda: para marcar una noche disponible hace falta un `available: 1` explícito.

/** Noches del rango [desde, hasta), en orden, como 'AAAA-MM-DD'. */
export function noches(desde: string, hasta: string): string[] {
  const out: string[] = []
  const fin = new Date(hasta + 'T00:00:00Z')
  // UTC a propósito: con hora local, el cambio de horario de verano mueve el reloj una hora y
  // `getDate()+1` puede caer en el MISMO día, repitiéndolo, o saltarse uno.
  for (const d = new Date(desde + 'T00:00:00Z'); d < fin; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/**
 * Reparte las noches en ocupadas y sin dato. Lo que no cae en ningún cubo es libre.
 *
 * Ojo al `!== 1` del final: no es una forma rebuscada de escribir `== null`. Un `available` con
 * un valor inesperado (un string, un 7, un centinela) es un «no lo he sabido leer», y esos se
 * cuelan por las guardas basadas en null. Aquí se tratan como lo que son: sin dato.
 */
export function clasificar(
  rates: Record<string, { available?: number | null } | undefined>,
  fechas: string[],
): { ocupadas: string[]; sinDato: string[] } {
  const ocupadas: string[] = []
  const sinDato: string[] = []
  for (const f of fechas) {
    const a = rates[f]?.available
    if (a === 0) ocupadas.push(f)
    else if (a !== 1) sinDato.push(f)
  }
  return { ocupadas, sinDato }
}
