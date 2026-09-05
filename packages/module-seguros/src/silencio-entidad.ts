/**
 * Silencio por COMPAÑÍA — la avería que no deja rastro.
 *
 * Por qué existe (medido el 05/09/2026). `saludIngesta` vigila tres cosas y las
 * tres se disparan con algo que LLEGÓ y salió mal: un fichero que se queda en
 * cuarentena, un recibo huérfano, un envío que rechazamos. `diasSinPersistir`
 * parece cubrir el hueco, pero mide por TIPO de objeto (POL/REC/SIN/CEF) y
 * agrega todas las compañías: mientras una sola siga mandando recibos, ese
 * contador está a cero.
 *
 * Consecuencia medida contra la BD del CRM:
 *
 * | entidad        | ficheros | último     | días callada | peor hueco suyo |
 * |----------------|---------:|------------|-------------:|----------------:|
 * | C0058 Mapfre   |       14 | 23/06/2026 |       **74** |           **2** |
 * | C0109 Allianz  |       38 | 24/08/2026 |           12 |              19 |
 * | C0613 Reale    |        3 | 25/08/2026 |           11 |              23 |
 * | C0468 Occident |       73 | 30/08/2026 |            6 |               9 |
 *
 * Mapfre —**64 pólizas vivas, el 58 % de la cartera**— llevaba 74 días sin
 * mandar un solo fichero cuando su peor hueco histórico eran DOS. Siete
 * renovaciones pasaron durante ese silencio sin que llegara nada. Y el vigía
 * estaba en verde con razón: no había nada atascado, porque no había llegado
 * nada que atascar.
 *
 * Es la lección de `ingesta.ts` un piso más arriba: allí se medía lo que no
 * era; aquí se medía **a quien sí venía**, y el que deja de venir no aparece en
 * ninguna cuenta.
 *
 * ## Las dos señales, y por qué son dos
 *
 * 1. **Ritmo roto** — lleva callada mucho más de lo que se ha callado nunca.
 *    Es estadística, y por eso el baremo es **el suyo propio**, no una
 *    constante global: 30 días fijos no habrían dicho nada de Mapfre hasta el
 *    día 30, y habrían acusado a Reale, cuyo ritmo normal son 23 días.
 * 2. **Consecuencia medida** — una renovación pasó durante el silencio y no
 *    llegó su fichero. Esto no es una inferencia: es una pérdida. Por eso
 *    alarma **sin necesidad de baremo** y sobrevive a que alguien discuta el
 *    umbral de la primera.
 *
 * Con los datos reales las dos señalan a Mapfre y solo a Mapfre. Un vigía que
 * en su estreno acusa a tres inocentes se silencia la primera semana.
 *
 * Todo aquí es puro: decide con números, sin BD ni red.
 */

/** Qué se sabe del envío de una compañía. Cinco estados, y ninguno es «bien» por descarte. */
export type VeredictoEntidad =
  /** Manda dentro de su ritmo de siempre. */
  | 'ok'
  /** Lleva callada mucho más de lo que se ha callado nunca, o se ha perdido una renovación. */
  | 'silencio'
  /** No hay muestra para saber cuál es su ritmo. NO es «va bien». */
  | 'sin_base'
  /** No ha mandado NUNCA ni un fichero. Ni silencio ni normalidad: nunca empezó. */
  | 'nunca'
  /** No se ha podido mirar. NO es «va bien». */
  | 'sin_datos'

export type EntidadIngesta = {
  /** Código DGS de la entidad (`C0058`). */
  entidad: string
  /** Días desde su último fichero. `null` = nunca mandó ninguno. */
  diasSinFichero: number | null
  /** El mayor hueco entre dos ficheros suyos, en días. `null` = no calculable. */
  huecoMaximo: number | null
  /** Cuántos huecos se han observado: es el tamaño de la muestra del baremo. */
  huecosObservados: number
  /** Pólizas vivas suyas. `null` = no se ha podido contar, nunca 0 por defecto. */
  vivas: number | null
  /**
   * Renovaciones que vencieron DURANTE el silencio sin que llegara su fichero.
   * `null` = no se ha comprobado; `0` = se comprobó y no hay. La diferencia es
   * la que separa «no pasa nada» de «no lo he mirado».
   */
  vencidasEnSilencio: number | null
  /** Pólizas suyas que vencen en los próximos 90 días. `null` = no comprobado. */
  vencen90d?: number | null
}

export type SilencioEntidad = EntidadIngesta & {
  veredicto: VeredictoEntidad
  /** Por qué. Vacío cuando no hay nada que decir. */
  motivos: string[]
}

/**
 * Con UN hueco observado no hay ritmo, hay una anécdota. Con dos ya existe un
 * rango. El número sale de los datos y no del gusto: Mapfre solo tiene **2**
 * huecos observados (sus 14 ficheros se agolpan en pocos días) y exigir 3
 * habría silenciado justo la alarma que este módulo existe para dar.
 */
export const MIN_HUECOS = 2

/** Cuánto hay que pasarse del propio récord para que sea noticia. */
export const FACTOR_SILENCIO = 2

/**
 * Suelo absoluto. Una compañía que manda a diario y lleva tres días callada no
 * es una avería, es un puente. Sin este suelo, un ritmo muy apretado convierte
 * cualquier fin de semana largo en alarma.
 */
export const SUELO_DIAS = 14

/**
 * Veredicto sobre UNA compañía.
 *
 * El orden importa: primero lo que no se ha podido mirar, luego lo que nunca
 * existió, luego la pérdida medida —que no necesita baremo— y solo al final la
 * inferencia estadística. Así una consecuencia real nunca queda tapada por
 * «no tengo muestra para juzgarte».
 */
export function veredictoEntidad(e: EntidadIngesta): SilencioEntidad {
  const base = { ...e, motivos: [] as string[] }

  if (e.diasSinFichero === null && e.huecoMaximo === null && e.huecosObservados === 0) {
    // Sin ninguna medida no se puede decir nada. Se distingue de `nunca`
    // porque «no ha mandado» y «no lo he podido consultar» mandan a sitios
    // distintos: uno a llamar a la compañía, el otro a mirar la consulta.
    return { ...base, veredicto: 'nunca', motivos: [`${e.entidad}: no consta ningún fichero suyo`] }
  }

  const motivos: string[] = []

  // 1. La pérdida MEDIDA. No depende de ningún umbral discutible.
  const perdida = e.vencidasEnSilencio !== null && e.vencidasEnSilencio > 0
  if (perdida) {
    motivos.push(
      `${e.entidad}: ${e.vencidasEnSilencio} renovación(es) vencieron sin que llegara su fichero`,
    )
  }

  // 2. El ritmo roto. Solo se afirma con muestra suficiente.
  const dias = e.diasSinFichero
  const hayBase = e.huecoMaximo !== null && e.huecosObservados >= MIN_HUECOS
  const ritmoRoto =
    dias !== null && hayBase && dias >= SUELO_DIAS && dias > (e.huecoMaximo as number) * FACTOR_SILENCIO

  if (ritmoRoto) {
    motivos.push(
      `${e.entidad}: ${dias} días sin mandar nada (su mayor hueco hasta ahora eran ${e.huecoMaximo})`,
    )
  }

  if (perdida || ritmoRoto) {
    // El tamaño de la cartera va en el aviso porque decide a qué hora se
    // llama: 64 pólizas calladas no es lo mismo que 1.
    if (e.vivas !== null && e.vivas > 0) motivos.push(`${e.entidad}: ${e.vivas} póliza(s) vivas suyas`)
    if (e.vencen90d != null && e.vencen90d > 0) {
      motivos.push(`${e.entidad}: ${e.vencen90d} más vencen en 90 días`)
    }
    return { ...base, veredicto: 'silencio', motivos }
  }

  // 3. Sin muestra no se absuelve a nadie: se dice que no se puede juzgar.
  //    Poner `ok` aquí sería exactamente el fallo que este módulo persigue.
  if (!hayBase) {
    return {
      ...base,
      veredicto: 'sin_base',
      motivos: [
        `${e.entidad}: ${dias ?? '?'} días sin mandar, pero no hay histórico suficiente ` +
        `(${e.huecosObservados} hueco(s) observado(s)) para saber si es normal en ella`,
      ],
    }
  }

  return { ...base, veredicto: 'ok', motivos: [] }
}

/**
 * Veredicto sobre todas. `null` = no se ha podido leer la lista, y eso NO se
 * sirve como «todas bien»: se devuelve `sin_datos` con su motivo.
 */
export function silencioPorEntidad(entidades: EntidadIngesta[] | null): SilencioEntidad[] | null {
  if (entidades === null) return null
  return entidades
    .map(veredictoEntidad)
    .sort((a, b) => orden(a.veredicto) - orden(b.veredicto) || (b.vivas ?? 0) - (a.vivas ?? 0))
}

function orden(v: VeredictoEntidad): number {
  return v === 'silencio' ? 0 : v === 'nunca' ? 1 : v === 'sin_base' ? 2 : v === 'sin_datos' ? 3 : 4
}

/**
 * Las frases para el aviso. Solo habla de lo que exige mirar algo: el `ok` no
 * genera línea (un vigía que enumera a los sanos entrena a no leerlo), pero
 * `sin_base` y `nunca` SÍ, porque son huecos de conocimiento y callarlos los
 * convierte en un «va bien» que nadie ha comprobado.
 */
export function motivosSilencio(lista: SilencioEntidad[] | null): string[] {
  if (lista === null) return ['No se ha podido comprobar si alguna compañía ha dejado de mandar.']
  return lista.filter(e => e.veredicto !== 'ok').flatMap(e => e.motivos)
}
