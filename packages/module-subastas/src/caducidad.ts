// ────────────────────────────────────────────────────────────────────────────
// CADUCIDAD DE LAS ANOTACIONES PREVENTIVAS DE EMBARGO (art. 86 LH). PURO.
//
// Una anotación preventiva de embargo NO dura para siempre: caduca a los CUATRO
// AÑOS desde su fecha, salvo que se prorrogue por mandamiento judicial (otros
// cuatro, reiterables). Cuando caduca es cancelable y deja de ser oponible: el
// adjudicatario NO la hereda.
//
// Por qué hace falta esto: el registro NO borra solo las anotaciones caducadas
// —siguen escritas en la certificación hasta que alguien pide la cancelación—,
// así que `cargasQueSubsisten` las sumaba enteras al coste. Un embargo anterior
// de hace ocho años inflaba el coste puerta abierta con una carga fantasma y
// hacía descartar subastas que sí eran negocio. Es el reverso exacto de la deuda
// de comunidad: aquella hacía subir el coste real, esta lo hace bajar.
//
// 🚨 POR QUÉ NUNCA SE RESTA EN SILENCIO. La prórroga se anota AL MARGEN de la
// inscripción, que es justo lo que peor lee un escaneo. Si el lector se pierde
// la nota marginal, damos por caducado algo vivo — y ese error va en la
// dirección peligrosa: pujar de más creyendo que no se hereda nada. Por eso este
// módulo solo MARCA («posiblemente caducada»), calcula el escenario alternativo
// aparte y deja la pregunta para el juzgado. La cifra que manda sigue siendo la
// conservadora.
//
// Solo aplica a ANOTACIONES (embargo). Las hipotecas son inscripciones y van por
// el art. 82 LH, con otro plazo y otra mecánica: aquí se declaran «no aplica».
// ────────────────────────────────────────────────────────────────────────────

import type { Carga } from './cargas.ts'

/** Plazo del art. 86 LH: la anotación caduca a los 4 años de su fecha. */
export const ANIOS_CADUCIDAD_ANOTACION = 4

/**
 * Margen de seguridad en meses. Una anotación de hace 4 años y un mes se declara
 * caducada; una de hace 4 años justos, no — el OCR puede errar el año y no
 * conviene apurar el límite en la dirección que baja el coste.
 */
export const MESES_MARGEN = 6

/** Huellas de una prórroga en el texto del registro. Basta una para NO concluir. */
const RE_PRORROGA = /pr[oó]rrog|prorrogad|renovad[ao]\s+la\s+anotaci/i

export type EstadoCaducidad =
  /** No es una anotación preventiva: el art. 86 LH no le aplica. */
  | 'no_aplica'
  /** Anotación dentro de plazo. */
  | 'vigente'
  /** Pasado el plazo y sin rastro de prórroga: probablemente ya no existe. */
  | 'posible_caducada'
  /** Pasado el plazo PERO el registro menciona una prórroga: no se concluye. */
  | 'prorrogada'
  /** Sin fecha legible: no se puede calcular nada. */
  | 'sin_fecha'

export interface Caducidad {
  estado: EstadoCaducidad
  /** Años transcurridos desde la anotación. `null` si no hay fecha. */
  aniosDesde: number | null
  /** `true` solo si la fecha venía con día y mes; si no, se asumió fin de año. */
  fechaExacta: boolean
  /** Explicación legible. Siempre presente salvo en `no_aplica`. */
  nota: string | null
}

/**
 * Fecha registral tolerante: el lector devuelve el campo tal cual lo escribe el
 * registro, que rara vez es ISO («15 de agosto de 2020», «12/03/2015», «2009»).
 *
 * Cuando solo hay año se toma el **31 de diciembre**, no el 1 de enero: es la
 * lectura que da MENOS antigüedad y por tanto la que menos tiende a declarar una
 * carga caducada. Toda la ambigüedad se resuelve siempre hacia el lado caro.
 */
export function parsearFechaRegistral(texto: string | null | undefined): { fecha: Date; exacta: boolean } | null {
  const t = (texto ?? '').trim()
  if (!t) return null

  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (iso) return fechaValida(+iso[1], +iso[2], +iso[3], true)

  const dmy = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/.exec(t)
  if (dmy) return fechaValida(+dmy[3], +dmy[2], +dmy[1], true)

  const literal = /\b(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})\b/i.exec(t)
  if (literal) {
    const mes = MESES.indexOf(literal[2].toLowerCase())
    if (mes >= 0) return fechaValida(+literal[3], mes + 1, +literal[1], true)
  }

  // Último recurso: un año suelto plausible.
  const anio = /\b(19\d{2}|20\d{2})\b/.exec(t)
  if (anio) return fechaValida(+anio[1], 12, 31, false)

  return null
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function fechaValida(anio: number, mes: number, dia: number, exacta: boolean): { fecha: Date; exacta: boolean } | null {
  if (anio < 1900 || anio > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  return Number.isNaN(fecha.getTime()) ? null : { fecha, exacta }
}

/**
 * Estado de caducidad de UNA carga.
 *
 * `hoy` se pasa siempre desde fuera: el módulo es puro y determinista, y así los
 * tests no dependen de la fecha en que se ejecuten.
 */
export function estadoCaducidad(c: Carga, hoy: Date): Caducidad {
  // El art. 86 LH es de anotaciones preventivas. Una hipoteca es una
  // inscripción: no caduca por el transcurso de estos 4 años.
  if (c.tipo !== 'embargo') {
    return { estado: 'no_aplica', aniosDesde: null, fechaExacta: false, nota: null }
  }

  const parsed = parsearFechaRegistral(c.fecha)
  if (!parsed) {
    return {
      estado: 'sin_fecha',
      aniosDesde: null,
      fechaExacta: false,
      nota: 'Anotación de embargo sin fecha legible: no se puede comprobar si ha caducado (art. 86 LH). Se cuenta entera.',
    }
  }

  const aniosDesde = Math.round(((hoy.getTime() - parsed.fecha.getTime()) / 31_557_600_000) * 10) / 10
  const limite = ANIOS_CADUCIDAD_ANOTACION + MESES_MARGEN / 12

  if (aniosDesde < limite) {
    return {
      estado: 'vigente',
      aniosDesde,
      fechaExacta: parsed.exacta,
      nota: `Anotación de embargo de hace ${anios(aniosDesde)}: dentro del plazo de ${ANIOS_CADUCIDAD_ANOTACION} años del art. 86 LH.`,
    }
  }

  // Cualquier rastro de prórroga desactiva la conclusión: la prórroga es de otros
  // 4 años y puede reiterarse, así que sin la fecha de la ÚLTIMA no se sabe nada.
  if (RE_PRORROGA.test(c.literal ?? '')) {
    return {
      estado: 'prorrogada',
      aniosDesde,
      fechaExacta: parsed.exacta,
      nota:
        `La anotación de embargo es de hace ${anios(aniosDesde)} pero el registro menciona una PRÓRROGA: ` +
        'la prórroga es de 4 años más y puede reiterarse, así que se cuenta entera hasta conocer la fecha de la última.',
    }
  }

  return {
    estado: 'posible_caducada',
    aniosDesde,
    fechaExacta: parsed.exacta,
    nota:
      `Anotación de embargo de hace ${anios(aniosDesde)}${c.acreedor ? ` a favor de ${c.acreedor}` : ''}: ` +
      `pasados los ${ANIOS_CADUCIDAD_ANOTACION} años del art. 86 LH y sin constancia de prórroga, PODRÍA estar caducada ` +
      '(el registro no la borra solo, hay que pedir su cancelación). ' +
      (parsed.exacta ? '' : 'La fecha solo consta a nivel de año. ') +
      '⚠️ Las prórrogas se anotan AL MARGEN y son lo que peor se lee en un escaneo: NO se descuenta del coste, ' +
      'pídele al juzgado una nota simple actualizada antes de contar con ello.',
  }
}

export interface CaducidadCuadro {
  /** Cargas anteriores que, por fecha, podrían estar ya caducadas. */
  posiblesCaducadas: Carga[]
  /** Lo que dejarían de costar si se confirma que caducaron. `0` si ninguna. */
  ahorroPotencial: number
  /** `true` si alguna posible caducada no tiene importe legible (ahorro incompleto). */
  ahorroIncompleto: boolean
  notas: string[]
}

/**
 * Reparte las cargas SUBSISTENTES entre las que están firmes y las que podrían
 * haber caducado, sin decidir por el usuario.
 *
 * Nunca toca el importe conservador: quien llama decide si enseña el escenario
 * alternativo. Esa es toda la gracia — es información, no un descuento.
 */
export function caducidadDelCuadro(subsistentes: Carga[], hoy: Date): CaducidadCuadro {
  const posiblesCaducadas: Carga[] = []
  const notas: string[] = []
  let ahorroPotencial = 0
  let ahorroIncompleto = false

  for (const c of subsistentes) {
    const e = estadoCaducidad(c, hoy)
    if (e.estado === 'no_aplica') continue
    if (e.nota) notas.push(e.nota)
    if (e.estado !== 'posible_caducada') continue

    posiblesCaducadas.push(c)
    if (c.importe != null) ahorroPotencial += c.importe
    else ahorroIncompleto = true
  }

  return {
    posiblesCaducadas,
    ahorroPotencial: Math.round(ahorroPotencial * 100) / 100,
    ahorroIncompleto,
    notas,
  }
}

function anios(n: number): string {
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} años`
}
