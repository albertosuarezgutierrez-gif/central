// lib/sivra/eventos-impacto.ts — cuánto sube el precio un evento descubierto automáticamente.
//
// POR QUÉ (01/08/2026). Esta escala vivía DUPLICADA y palabra por palabra en los dos crons de
// descubrimiento (`eventos/sync` de Ticketmaster y `eventos/websearch`), con un comentario que decía
// «idéntico a /eventos/sync» — la clase de duplicación que diverge en cuanto alguien toca una sola.
// Y tenía dos defectos de fondo:
//
//   1. **Techo real 1.60.** El tope estaba escrito como `Math.min(f, 2.5)`, pero ningún escalón
//      pasaba de 1.60: el 2.5 era inalcanzable. Los tres días de Karol G en La Cartuja —el pelotazo
//      del año, con el mercado a 4-8× lo normal— entraron por cron a 1.60 y solo llegaron a 2.5
//      porque se metieron A MANO. Es decir: los eventos-sorpresa que este sistema existe para
//      capturar estaban estructuralmente infravalorados, y justo en las noches que más dinero mueven.
//
//   2. **Un aforo no dice si la gente DUERME aquí.** Un Sevilla-Betis llena 43.000 asientos de
//      público mayoritariamente local que se va a su casa a cenar; un concierto de estadio de la
//      misma capacidad llena hoteles porque viene de fuera y se queda a dormir. Con una sola escala
//      por aforo, los dos pedían el mismo premio. Ahora el deporte de liga tiene su propia curva,
//      más plana: sube algo (hay desplazamiento de aficionados visitantes y ambiente) pero no
//      pretende ser un evento-destino.
//
// El número que sale de aquí NO es el precio: es un multiplicador que aguas abajo pasa por el
// mercado real de esa fecha (si hay comps, mandan ellos), por el raíl de ±%/día y por el centinela
// #7, que salta si una fecha con factor ≥2 no tiene el mercado subido. Equivocarse al alza aquí se
// corrige solo en cuanto llega mercado fresco; quedarse corto, en cambio, se traduce en noches
// vendidas baratas que no vuelven.

/** Tipos que distinguimos. Cualquier otra cosa cae en el caso general. */
export type TipoEvento = 'deporte' | 'concierto' | 'congreso' | 'festival' | 'otro'

const DEPORTE = /\b(f[úu]tbol|futbol|laliga|la liga|liga|partido|derbi|sevilla fc|real betis|betis|copa del rey|champions|europa league|baloncesto|deportes?|deportivo|sports?)\b/i
const CONGRESO = /\b(congreso|convenci[óo]n|feria|sal[óo]n|simposio|jornadas?|fibes|expo)\b/i

/** Normaliza el `tipo` que traen las fuentes (Ticketmaster o la IA), que es texto libre. */
export function clasificarTipo(texto?: string | null): TipoEvento {
  const t = String(texto ?? '')
  if (!t.trim()) return 'otro'
  if (DEPORTE.test(t)) return 'deporte'
  if (CONGRESO.test(t)) return 'congreso'
  if (/\b(concierto|concert|m[úu]sica|music|gira|tour|festival|fest)\b/i.test(t)) {
    return /\b(festival|fest)\b/i.test(t) ? 'festival' : 'concierto'
  }
  // Sin pista, `otro` — que usa la MISMA curva que un concierto. Es deliberado: el `tipo` de las
  // fuentes viene muchas veces vacío y lo que llega aquí es el nombre pelado ("KAROL G - VIAJANDO
  // POR EL MUNDO TROPITOUR"), que no contiene ninguna palabra clave. Caer en la curva general no
  // pierde dinero; caer en la de deporte —más plana— sí lo perdería.
  return 'otro'
}

/** Techo duro: es el mismo que honra `eventFactor` del calendario. Nada sale de aquí por encima. */
export const FACTOR_MAX = 2.5

// Un partido que SÍ mueve hotel (una final, una eliminatoria) nunca se demota por nombre: se deja
// en la curva general o se cataloga a mano. La lista es deliberadamente corta.
const RE_PARTIDO_GRANDE = /\b(final(es)?|semifinal(es)?|copa del rey|supercopa|champions|europa league|conference|eliminatoria|playoff)\b/i
const RE_CLUB_LOCAL = /\b(sevilla fc|real betis|betis)\b/i

/**
 * ¿Es un partido de liga REGULAR de un club local? («Sevilla FC vs Valencia CF»)
 *
 * Existe porque el `tipo` que devuelve la IA muchas veces no trae ninguna palabra clave y el
 * partido caía en la curva general (12/08/2026: dos jornadas de liga entraron a ×2,2, el nivel de
 * una final — el centinela #7 las cazó porque el mercado iba a 0,82-0,85× su mes). El NOMBRE sí
 * delata el partido, pero solo se usa para DEMOTAR liga regular: una final de Copa («no tope!
 * final copa rey hay q aprovechar», decisión de Alberto 09/08/2026) jamás baja a la curva plana.
 */
export function esPartidoLigaRegular(nombre?: string | null): boolean {
  const n = String(nombre ?? '')
  if (!n.trim() || RE_PARTIDO_GRANDE.test(n)) return false
  return RE_CLUB_LOCAL.test(n) && /\bvs\.?\b|\bcontra\b|[-–—]\s*(fc|cf|ud|cd|real)\b/i.test(n)
}

/**
 * ¿Es un partido del Sevilla/Betis A DOMICILIO? («Levante UD vs Sevilla FC» se juega en Valencia.)
 *
 * En fútbol el equipo LOCAL va SIEMPRE primero, así que un club sevillano DETRÁS del «vs» significa
 * que el partido no se juega en Sevilla: no trae ni un huésped y no debe entrar en el calendario.
 * Caso real (14/08/2026): el websearch tenía 9 jornadas a domicilio confirmadas —Athletic-Sevilla en
 * Bilbao a ×2,2, Real Sociedad-Sevilla a ×1,9…— subiendo el precio de noches corrientes en Sevilla.
 *
 * Un partido GRANDE (final, eliminatoria) nunca se descarta por esto: las finales se juegan en campo
 * neutral y «X vs Sevilla FC» puede perfectamente ser en La Cartuja.
 */
export function esPartidoFueraDeSevilla(nombre?: string | null): boolean {
  const n = String(nombre ?? '')
  if (!n.trim() || RE_PARTIDO_GRANDE.test(n)) return false
  const partes = n.split(/\bvs\.?\b|\bcontra\b/i)
  if (partes.length < 2) return false
  const casa = partes[0]
  const visitante = partes.slice(1).join(' ')
  return !RE_CLUB_LOCAL.test(casa) && RE_CLUB_LOCAL.test(visitante)
}

/**
 * Multiplicador de precio para un evento, por aforo y tipo.
 *
 * La curva general (conciertos, festivales, lo que no sabemos clasificar) llega a 2.20 en aforo de
 * estadio: por debajo del 2.5 del calendario a propósito, porque la Feria y la Semana Santa —siete
 * noches de ciudad entera desbordada, con años de histórico detrás— deben seguir siendo el techo, y
 * esto es una estimación a partir de una capacidad que muchas veces la ha puesto la IA a ojo.
 *
 * El deporte de liga se queda en 1.35: el aficionado local no pernocta. Un partido que SÍ mueva
 * hotel (una final, una eliminatoria europea grande) se cataloga a mano, que es lo que ya hacemos
 * con los pelotazos.
 */
export function impactoEvento(aforo: number, tipo?: string | null, nombre?: string | null): number {
  const n = Number(aforo)
  if (!Number.isFinite(n) || n <= 0) return 1.08

  let clase = clasificarTipo(tipo)
  // El nombre solo puede DEMOTAR a la curva plana de liga (nunca promociona ni toca finales):
  // ver `esPartidoLigaRegular`. Con `tipo` reconocible, manda el tipo.
  if (clase === 'otro' && esPartidoLigaRegular(nombre)) clase = 'deporte'

  if (clase === 'deporte') {
    let f = 1.08
    if (n > 40000) f = 1.35
    else if (n > 20000) f = 1.30
    else if (n > 5000) f = 1.15
    return Math.min(f, FACTOR_MAX)
  }

  // Un congreso llena la ciudad ENTRE SEMANA y con estancias de 2-3 noches, pero su aforo declarado
  // (asistentes) es mucho menor que el de un estadio: el escalón bueno le llega antes.
  if (clase === 'congreso') {
    let f = 1.10
    if (n > 10000) f = 1.70
    else if (n > 5000) f = 1.50
    else if (n > 2000) f = 1.30
    else if (n > 500) f = 1.15
    return Math.min(f, FACTOR_MAX)
  }

  let f = 1.08
  if (n > 40000) f = 2.20
  else if (n > 20000) f = 1.90
  else if (n > 10000) f = 1.55
  else if (n > 5000) f = 1.30
  else if (n > 1000) f = 1.15
  return Math.min(f, FACTOR_MAX)
}
