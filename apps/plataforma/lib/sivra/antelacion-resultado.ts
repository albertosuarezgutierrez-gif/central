// lib/sivra/antelacion-resultado.ts — el VEREDICTO de la palanca de anticipación: ¿interesa o no?
//
// Lógica PURA (sin BD ni red): el endpoint /api/sivra/pricing/antelacion aporta los agregados y aquí
// solo se decide qué se puede AFIRMAR con ellos.
//
// 🚨 EL CONTRAFACTUAL NO EXISTE, Y ESO MANDA EN TODO LO DEMÁS. No se puede saber si la reserva que
// pagó el premio se habría hecho igual sin él: el huésped que no reservó no deja fila. Por eso el
// veredicto NUNCA sale de la cuenta que se cae sola del lado bueno («hemos cobrado X€ de más, luego
// interesa»): esa cuenta da a favor SIEMPRE, porque compara el precio cobrado consigo mismo dividido
// por el factor y la ocupación es la misma en las dos ramas por construcción. Es la trampa de contar
// solo el lado que se puede medir.
//
// Lo que sí se puede medir son DOS cosas, y el veredicto exige que las dos vayan en el mismo sentido:
//   1. **Lo cobrado de más** en las noches con premio que acabaron vendidas (suponiendo —y hay que
//      decirlo— que esas reservas se habrían hecho igual).
//   2. **Lo que pudo costar**: la ocupación de esas mismas noches contra la del MISMO MES en años
//      anteriores. Si el premio estuviera espantando reservas, ahí es donde aparece.
// La referencia es imperfecta (un año no es igual que otro) y por eso viaja hasta la UI en vez de
// esconderse dentro de un número: sin referencia utilizable el veredicto es `sin_referencia`, no
// `a_favor`.
//
// TRES ESTADOS, no dos, en todos los recuentos:
//   · `pendientes`  → noches con premio que aún no han pasado: no se sabe, y NO son noches vacías.
//   · `sinDato`     → noches pasadas de las que no consta si se vendieron (no hay snapshot).
//   · `resueltas`   → noches pasadas con dato: las únicas sobre las que se afirma algo.
// Contar las pendientes como vacías es la forma más fácil de matar una palanca que funciona: al
// principio TODAS las noches con premio están en el futuro.

/** Noches resueltas mínimas para emitir un veredicto. Por debajo se dice «todavía no se sabe». */
export const MIN_RESUELTAS = 20

/** Caída de ocupación (en puntos) que se considera señal de que el premio está costando reservas. */
export const CAIDA_OCUPACION_PP = 5

export type AntelacionInput = {
  /** noches DISTINTAS que llevaron premio (pasadas y futuras) */
  nochesConPremio: number
  /** premio medio de esas noches, en tanto por uno (0.18 = +18%) */
  premioMedio: number
  /** noches con premio que aún no han llegado: no se sabe */
  pendientes: number
  /** noches con premio ya pasadas Y con dato de si se vendieron */
  resueltas: number
  /** de las resueltas, las que se vendieron */
  vendidas: number
  /** noches pasadas sin dato de venta (snapshot ausente): hueco declarado, no vacías */
  sinDato: number
  /** € cobrados de más en las vendidas (precio publicado − precio sin premio) */
  extraEur: number
  /** ocupación de los MISMOS MESES en años anteriores, en tanto por uno (null = sin referencia) */
  ocupacionReferencia: number | null
}

export type AntelacionVeredicto = {
  estado: 'apagada' | 'pendiente' | 'sin_referencia' | 'a_favor' | 'en_contra' | 'neutro'
  titular: string
  detalle: string
  /** ocupación medida de las noches con premio (null = nada resuelto todavía) */
  ocupacion: number | null
  /** diferencia en puntos contra la referencia (null = sin referencia o sin resueltas) */
  deltaOcupacionPp: number | null
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const pp = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 10) / 10} pp`

export function evaluarAntelacion(i: AntelacionInput): AntelacionVeredicto {
  if (i.nochesConPremio === 0) {
    return {
      estado: 'apagada',
      titular: 'La palanca no ha premiado ninguna noche todavía',
      detalle:
        'O está apagada (`antelacion_k = 0`) o ninguna fecha está lo bastante lejos de la antelación ' +
        'mediana de su mes. No es un resultado: es que aún no ha actuado.',
      ocupacion: null,
      deltaOcupacionPp: null,
    }
  }

  const base = `${i.nochesConPremio} noches con premio (${pct(i.premioMedio)} de media)`

  if (i.resueltas < MIN_RESUELTAS) {
    return {
      estado: 'pendiente',
      titular: `Todavía no se puede juzgar: ${i.resueltas} de ${MIN_RESUELTAS} noches resueltas`,
      detalle:
        `${base}. ${i.pendientes} siguen en el futuro` +
        (i.sinDato > 0 ? ` y de ${i.sinDato} no consta si se vendieron` : '') +
        '. Una noche que aún no ha llegado NO es una noche vacía: hasta que pasen, lo cobrado de más ' +
        `(${Math.round(i.extraEur)}€) es un apunte, no un resultado.`,
      ocupacion: null,
      deltaOcupacionPp: null,
    }
  }

  const ocupacion = i.vendidas / i.resueltas

  if (i.ocupacionReferencia == null) {
    return {
      estado: 'sin_referencia',
      titular: `${Math.round(i.extraEur)}€ cobrados de más, pero sin con qué compararlo`,
      detalle:
        `${base}, ${pct(ocupacion)} de ocupación en las ${i.resueltas} resueltas. No hay ocupación de ` +
        'los mismos meses en años anteriores con la que contrastar, así que no se puede saber si el ' +
        'premio ha costado reservas. Lo cobrado de más asume que esas reservas se habrían hecho igual.',
      ocupacion,
      deltaOcupacionPp: null,
    }
  }

  const delta = (ocupacion - i.ocupacionReferencia) * 100
  const cola =
    `${base}. Ocupación de las noches premiadas ${pct(ocupacion)} contra ${pct(i.ocupacionReferencia)} ` +
    `de los mismos meses en años anteriores (${pp(delta)}). El extra asume que las reservas que ` +
    'entraron se habrían hecho igual sin premio; la ocupación es lo que delataría lo contrario.'

  if (delta <= -CAIDA_OCUPACION_PP) {
    return {
      estado: 'en_contra',
      titular: `La ocupación cae ${pp(delta)}: el premio puede estar costando reservas`,
      detalle: cola,
      ocupacion,
      deltaOcupacionPp: delta,
    }
  }
  if (i.extraEur > 0) {
    return {
      estado: 'a_favor',
      titular: `${Math.round(i.extraEur)}€ de más sin perder ocupación (${pp(delta)})`,
      detalle: cola,
      ocupacion,
      deltaOcupacionPp: delta,
    }
  }
  return {
    estado: 'neutro',
    titular: 'La palanca no ha movido el resultado',
    detalle: cola,
    ocupacion,
    deltaOcupacionPp: delta,
  }
}
