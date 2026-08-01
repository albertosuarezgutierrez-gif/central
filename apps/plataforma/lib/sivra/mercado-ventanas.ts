// lib/sivra/mercado-ventanas.ts — QUÉ fechas barre el mercado, y por qué.
//
// POR QUÉ (01/08/2026). El barrido mensual (`mercado/sweep`) miraba el PRIMER VIERNES de cada mes y
// nada más. Ocho fechas al año y media, todas elegidas por el calendario gregoriano: el barrido nunca
// veía la Feria, ni la Semana Santa, ni los tres días de Karol G — justo las noches que el motor
// tarifica al triple y donde equivocarse cuesta de verdad. Medido ese día: de 5 a 7 fechas por mes en
// el corpus, y octubre —el mejor mes de Sevilla— con su último barrido de hacía 15 días.
//
// El daño no era solo tarificar a ciegas: los dos centinelas que vigilan los eventos (#7 «evento sin
// respaldo de mercado» y #8 «el mercado sube y no sabemos por qué») EXIGEN comps de esa fecha, así que
// sin barrido de las fechas de evento se quedaban en `evaluado:false` para siempre. Catalogábamos
// eventos que nadie comprobaba nunca.
//
// Ahora el barrido tiene dos patas:
//   · la BASE mensual (un finde por mes) → la línea de temporada, que es para lo que nació;
//   · las fechas de EVENTO → lo que el motor va a tarificar caro, para poder verificarlo.
//
// Un bloque de evento (la Feria son 7 noches seguidas) gasta UNA ventana, no siete: se barre la noche
// de mayor factor del bloque. Y se priorizan los eventos MÁS CERCANOS, que son los que ya se están
// vendiendo — un error en la Feria de dentro de 8 meses todavía da tiempo a corregirlo.

export type EventoFecha = {
  /** YYYY-MM-DD */
  fecha: string
  factor: number
  nombre?: string
}

export type Ventana = {
  /** YYYY-MM-DD */
  checkin: string
  /** YYYY-MM-DD */
  checkout: string
  /** por qué se barre esta fecha */
  motivo: 'mes' | 'evento'
  /** nombre del evento, cuando lo hay (para el informe de la pasada) */
  etiqueta?: string
}

export type VentanasOpts = {
  /** meses vista de la base mensual */
  mesesBase?: number
  /** cuántas ventanas de evento como mucho (cada una cuesta 1 búsqueda por aforo distinto) */
  maxEventos?: number
  /** a partir de qué factor una fecha cuenta como evento */
  factorMinimo?: number
  /** noches de cada ventana */
  noches?: number
  /** horizonte en días: más allá no se barre (el motor tampoco tarifica) */
  horizonteDias?: number
}

const DIA_MS = 86_400_000

function aFecha(iso: string): Date {
  return new Date(iso + 'T00:00:00Z')
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function sumarDias(iso: string, n: number): string {
  return fmt(new Date(aFecha(iso).getTime() + n * DIA_MS))
}
function diasEntre(desdeIso: string, hastaIso: string): number {
  return Math.round((aFecha(hastaIso).getTime() - aFecha(desdeIso).getTime()) / DIA_MS)
}

/** Primer viernes del mes a `m` meses vista de `hoy`. */
export function findeDelMes(hoyIso: string, m: number): string {
  const d = aFecha(hoyIso)
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + m)
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1)
  return fmt(d)
}

/**
 * Agrupa fechas de evento CONTIGUAS en bloques y devuelve, de cada bloque, la de mayor factor
 * (empate → la primera). La Feria entera gasta una sola ventana.
 */
export function picosDeEvento(eventos: EventoFecha[], factorMinimo = 1.15): EventoFecha[] {
  const dignos = eventos
    .filter(e => Number(e.factor) >= factorMinimo)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (!dignos.length) return []

  const picos: EventoFecha[] = []
  let bloque: EventoFecha[] = [dignos[0]]

  const cerrar = () => {
    let mejor = bloque[0]
    for (const e of bloque) if (Number(e.factor) > Number(mejor.factor)) mejor = e
    picos.push(mejor)
  }

  for (let i = 1; i < dignos.length; i++) {
    // Misma fecha repetida (dos fuentes) o día siguiente ⇒ sigue el mismo bloque.
    const salto = diasEntre(dignos[i - 1].fecha, dignos[i].fecha)
    if (salto <= 1) bloque.push(dignos[i])
    else { cerrar(); bloque = [dignos[i]] }
  }
  cerrar()
  return picos
}

/**
 * Ventanas a barrer en una pasada. La base mensual va SIEMPRE (es la línea de temporada); las de
 * evento se añaden por cercanía hasta el tope, sin repetir una fecha que ya cubre la base.
 */
export function ventanasDelBarrido(
  hoyIso: string,
  eventos: EventoFecha[],
  opts: VentanasOpts = {},
): Ventana[] {
  const mesesBase = opts.mesesBase ?? 8
  const maxEventos = opts.maxEventos ?? 6
  const factorMinimo = opts.factorMinimo ?? 1.15
  const noches = opts.noches ?? 2
  const horizonteDias = opts.horizonteDias ?? 365

  const ventanas: Ventana[] = []
  const vistas = new Set<string>()

  for (let m = 1; m <= mesesBase; m++) {
    const checkin = findeDelMes(hoyIso, m)
    if (vistas.has(checkin)) continue
    vistas.add(checkin)
    ventanas.push({ checkin, checkout: sumarDias(checkin, noches), motivo: 'mes' })
  }

  if (maxEventos <= 0) return ventanas

  const candidatos = picosDeEvento(eventos, factorMinimo)
    .filter(e => {
      const d = diasEntre(hoyIso, e.fecha)
      return d >= 0 && d <= horizonteDias
    })
    // Lo más cercano primero: es lo que ya se está vendiendo.
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  for (const e of candidatos) {
    if (ventanas.filter(v => v.motivo === 'evento').length >= maxEventos) break
    if (vistas.has(e.fecha)) continue
    vistas.add(e.fecha)
    ventanas.push({
      checkin: e.fecha,
      checkout: sumarDias(e.fecha, noches),
      motivo: 'evento',
      etiqueta: e.nombre,
    })
  }

  return ventanas
}
