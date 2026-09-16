// lib/sivra/agente-huesped/camas.ts — «¿cuántas camas hay y de qué tipo?» (política pura y testeada).
//
// El caso que lo dispara (16/09/2026, reserva 155333446, Dúplex Center). El huésped preguntó:
// «please confirm if there're at least two double beds in the apartment as we have 4 people».
// El agente no tenía NI UN dato de camas —ni en la ficha, ni en la guía, ni en los hechos: medido,
// las guías de los CUATRO pisos no mencionan la palabra cama/bed— y contestó con el número de al
// lado: «The apartment is set up to accommodate up to 4 guests, so you'll have enough sleeping
// arrangements for your group». Capacidad NO es configuración de camas: 4 plazas caben en dos
// dobles, en una doble + un sofá cama, o en literas. Es exactamente el fallo que prohíbe CLAUDE.md
// («dato que NO hay ≠ dato que NO se ha mirado»), y el precio de equivocarse no es un mensaje feo:
// son cuatro adultos llegando a un piso donde no caben como esperaban.
//
// Por qué el TIPO y no solo el número: `properties` sabe cuántas camas hay (`beds`), pero no si son
// dobles. Responder «hay 2 camas» a «¿hay dos camas DOBLES?» es el mismo pecado un piso más abajo.
//
// Sin imports a propósito: los módulos puros de esta carpeta se testean con `node --test`.

/** ¿El huésped pregunta por las camas / la distribución para dormir? (es · en · fr · de · it) */
export function preguntaPorCamas(texto: string): boolean {
  return /\bcamas?\b|cama de matrimonio|sof[áa] ?cama|litera|dormitorios?|habitaciones? (dobles?|individuales?)|plazas para dormir|c[óo]mo (se )?dorm|d[óo]nde (vamos a )?dorm|\bbeds?\b|bedrooms?|sleeping arrangement|sleep(ing)? (setup|configuration)|twin|double bed|king ?size|queen ?size|\blits?\b|chambres?|couchages?|canap[ée] ?lit|\bletti?\b|camere da letto|divano letto|\bbetten?\b|schlafzimmer|schlafm[öo]glichkeit|doppelbett|einzelbett/i.test(texto || '')
}

/**
 * ¿Alguna de nuestras fuentes DECLARA el tipo de cama (doble / individual / sofá cama / litera…)?
 *
 * Deliberadamente exige el TIPO, no la palabra «cama»: la línea de distribución que la ficha pinta
 * desde `properties` dice «2 camas» y esa línea no puede hacerse pasar por una respuesta sobre
 * camas dobles. Por eso el bloque de la ficha se excluye antes de mirar (`bloqueCamas` lleva su
 * propio aviso de que el tipo NO consta) y aquí solo cuentan la guía del piso y los hechos que
 * Alberto ha enseñado, que son las fuentes donde el tipo sí puede estar escrito.
 */
export function declaraTipoDeCama(fuentes: string): boolean {
  return /cama de matrimonio|camas? (dobles?|individuales?|supletorias?)|sof[áa] ?cama|literas?|double beds?|twin beds?|single beds?|sofa ?beds?|bunk beds?|king ?size|queen ?size|lits? (doubles?|simples?|superpos[ée]s?)|canap[ée] ?lit|letti? (matrimonial[ei]|singol[oi])|divano letto|doppelbett|einzelbett|schlafsofa|etagenbett/i.test(fuentes || '')
}

/**
 * Línea de distribución para la ficha del piso. Tres estados, no dos:
 *   · sin ningún dato  → cadena vacía (la ficha no dice nada; NO se inventa «no consta la casa»)
 *   · con dato         → se declara lo que sabemos Y se declara explícitamente lo que NO sabemos
 *
 * El aviso final no es decoración: es la única barrera dentro del prompt contra volver a contestar
 * «caben 4» a «¿hay dos camas dobles?».
 */
export function bloqueCamas(p: { dormitorios?: number | null; camas?: number | null; banos?: number | null }): string {
  const partes = [
    p.dormitorios != null && `${p.dormitorios} dormitorio${p.dormitorios === 1 ? '' : 's'}`,
    p.camas != null && `${p.camas} cama${p.camas === 1 ? '' : 's'}`,
    p.banos != null && `${p.banos} baño${p.banos === 1 ? '' : 's'}`,
  ].filter(Boolean) as string[]
  if (!partes.length) return ''
  return `Distribución: ${partes.join(' · ')}.\n`
    + '⚠️ El TIPO de cada cama (doble/matrimonio, individual, sofá cama, litera) NO consta en ninguna '
    + 'fuente. Si el huésped pregunta por camas dobles, de matrimonio o por cómo se reparten para '
    + 'dormir, NO lo deduzcas de la capacidad máxima ni del número de camas: di que lo confirmas y escala.'
}
