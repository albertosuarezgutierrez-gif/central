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

/** Qué se sabe del envío de una compañía. Seis estados, y ninguno es «bien» por descarte. */
export type VeredictoEntidad =
  /** Manda dentro de su ritmo de siempre. */
  | 'ok'
  /** Lleva callada mucho más de lo que se ha callado nunca, o se ha perdido una renovación. */
  | 'silencio'
  /**
   * La compañía en conjunto manda, pero un TIPO de fichero suyo (SIN, por ejemplo) ha
   * enmudecido respecto a SU ritmo. No es «ha dejado de mandar» (eso es `silencio`) ni «ok».
   */
  | 'tipo_mudo'
  /** No hay muestra para saber cuál es su ritmo. NO es «va bien». */
  | 'sin_base'
  /** No ha mandado NUNCA ni un fichero. Ni silencio ni normalidad: nunca empezó. */
  | 'nunca'
  /** No se ha podido mirar. NO es «va bien». */
  | 'sin_datos'

/**
 * Ritmo de UN tipo de fichero CIMA (POL/REC/SIN/CEF) dentro de una compañía. Se mide igual
 * que el de la compañía: días distintos con fichero de ese tipo, mediana de los huecos.
 */
export type RitmoTipo = {
  /** `POL` | `REC` | `SIN` | `CEF` (cadena abierta: un tipo nuevo no rompe la lectura). */
  tipo: string
  /** Días desde su último fichero de ESE tipo. `null` = nunca mandó ninguno. */
  diasSinFichero: number | null
  /** Hueco típico (mediana) entre días con fichero de este tipo. `null` = sin huecos que medir. */
  huecoMediano: number | null
  /** Tamaño de la muestra del baremo. */
  huecosObservados: number
  /** Ficheros de este tipo en los 90 días ANTERIORES a su último fichero (no a hoy: estar mudo no lo hace «no habitual»). */
  ficheros90d: number
}

/** Un tipo de fichero que ha enmudecido dentro de una compañía que sí manda. */
export type TipoMudo = { tipo: string; dias: number; huecoMediano: number }

export type EntidadIngesta = {
  /** Código DGS de la entidad (`C0058`). */
  entidad: string
  /** Días desde su último fichero. `null` = nunca mandó ninguno. */
  diasSinFichero: number | null
  /** El mayor hueco entre dos ficheros suyos, en días. `null` = no calculable. */
  huecoMaximo: number | null
  /**
   * Hueco TÍPICO (mediana de los huecos entre días con fichero). Es el baremo del
   * ritmo: el máximo lo estropea un alta lenta.
   * OPCIONAL: una `asegura` anterior no lo manda (`undefined`) y entonces se cae al
   * baremo del máximo. `undefined` ≠ `null`; ambos caen al máximo, ninguno es 0.
   */
  huecoMediano?: number | null
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
  /** Pólizas vivas suyas que vencen en los próximos 30 días. Ausente/`null` = no comprobado. */
  vencen30d?: number | null
  /** Nombre común de la compañía (`companias_dgs.nombre_comun`). Ausente/`null` = no consta. */
  nombre?: string | null
  /** Pólizas EN VIGOR (`esCarteraEnVigor`; `vivas` es solo el origen). Ausente/`null` = no se contó. */
  enVigor?: number | null
  /** `max(created_at)` de sus ficheros SIN (ISO). Ausente/`null` = nunca mandó SIN o no se leyó. */
  ultimoSin?: string | null
  /** Nº de ficheros SIN de la compañía. Ausente/`null` = no se sabe. */
  sinN?: number | null
  /** `min(created_at)` de sus ficheros SIN (ISO). Ausente/`null` = no se sabe. */
  primerSin?: string | null
  /**
   * Ritmo por TIPO de fichero. OPCIONAL: una `asegura` anterior no lo manda (`undefined`) y
   * entonces solo se vigila la compañía entera, exactamente como antes. `undefined` ≠ `[]`
   * (se miró y no hay tipos): ninguno de los dos acusa a nadie.
   */
  porTipo?: RitmoTipo[]
}

export type SilencioEntidad = EntidadIngesta & {
  veredicto: VeredictoEntidad
  /** Por qué. Vacío cuando no hay nada que decir. */
  motivos: string[]
  /**
   * ANTES del vencimiento: pólizas vivas que vencen en ≤30 d de una compañía EN
   * SILENCIO (solo se informa con veredicto `silencio`). Ausente = no aplica o el puerto no manda `vencen30d`;
   * `null` = no se pudo contar. Nunca 0 por defecto.
   */
  renovacionesEnRiesgo?: number | null
  /** Tipos mudos (solo con veredicto `tipo_mudo`). Ausente = ninguno o no se mide. */
  tiposMudos?: TipoMudo[]
}

/** Ventana de «renovaciones en riesgo», en días. */
export const DIAS_RENOVACION_RIESGO = 30

/** Línea fija de acción del aviso de silencio. No envía nada a nadie. */
export const ACCION_SILENCIO =
  'Qué hacer: baja «Ficheros recibidos» del Portal CIMA filtrado por la compañía y compáralo; ' +
  'si CIMA no generó nada, el silencio es de la compañía'

/**
 * Umbral de silencio en días: `max(SUELO_DIAS, FACTOR × hueco típico)`. Usa la
 * mediana si la hay y, si no (puerto viejo), el máximo. `null` = sin base.
 */
export function umbralSilencio(e: Pick<EntidadIngesta, 'huecoMaximo' | 'huecoMediano' | 'huecosObservados'>): number | null {
  if (e.huecosObservados < MIN_HUECOS) return null
  const ref = typeof e.huecoMediano === 'number' ? e.huecoMediano : e.huecoMaximo
  if (ref === null || ref === undefined) return null
  return Math.max(SUELO_DIAS, ref * FACTOR_SILENCIO)
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
function veredictoCompania(e: EntidadIngesta): SilencioEntidad {
  const base = { ...e, motivos: [] as string[] }

  if (e.diasSinFichero === null && e.huecoMaximo === null && e.huecosObservados === 0) {
    // Sin ninguna medida no se puede decir nada. Se distingue de `nunca`
    // porque «no ha mandado» y «no lo he podido consultar» mandan a sitios
    // distintos: uno a llamar a la compañía, el otro a mirar la consulta.
    return { ...base, veredicto: 'nunca', motivos: [`${e.entidad}: no consta ningún fichero suyo`] }
  }

  const motivos: string[] = []

  // 1. La pérdida MEDIDA, pero SOLO como respaldo del ritmo. Una póliza que
  //    vence sin fichero posterior es una renovación que no ha llegado (ya se
  //    avisa aparte en «renovaciones sin llegar»), NO una compañía muda: si su
  //    último fichero es reciente (< SUELO_DIAS), Mapfre sí manda.
  //    Cuenta como silencio solo cuando ya hay ≥ SUELO_DIAS sin fichero Y la
  //    vía de ritmo no puede decidir por falta de histórico (estado
  //    conservador). Con histórico decide el ritmo, y solo el ritmo.
  const dias = e.diasSinFichero
  const hayBase = e.huecoMaximo !== null && e.huecosObservados >= MIN_HUECOS
  const perdida =
    e.vencidasEnSilencio !== null && e.vencidasEnSilencio > 0 &&
    !hayBase && (dias === null || dias >= SUELO_DIAS)
  if (perdida) {
    motivos.push(
      `${e.entidad}: ${e.vencidasEnSilencio} renovación(es) vencieron sin que llegara su fichero`,
    )
  }

  // 2. El ritmo roto. Solo se afirma con muestra suficiente.
  //    Baremo por hueco TÍPICO (mediana): el máximo lo fija a menudo el alta
  //    y dejaba mudas a compañías con ritmo corto.
  const umbral = umbralSilencio(e)
  const usaMediana = typeof e.huecoMediano === 'number'
  const ritmoRoto = dias !== null && hayBase && umbral !== null && dias >= SUELO_DIAS && dias > FACTOR_SILENCIO * (usaMediana ? (e.huecoMediano as number) : (e.huecoMaximo as number))

  if (ritmoRoto) {
    motivos.push(
      usaMediana
        ? `${e.entidad}: ${dias} días sin mandar nada (su hueco habitual son ${e.huecoMediano}; el mayor, ${e.huecoMaximo})`
        : `${e.entidad}: ${dias} días sin mandar nada (su mayor hueco hasta ahora eran ${e.huecoMaximo})`,
    )
  }

  if (perdida || ritmoRoto) {
    // El tamaño de la cartera va en el aviso porque decide a qué hora se
    // llama: 64 pólizas calladas no es lo mismo que 1.
    if (e.vivas !== null && e.vivas > 0) motivos.push(`${e.entidad}: ${e.vivas} póliza(s) vivas suyas`)
    if (e.vencen90d != null && e.vencen90d > 0) {
      motivos.push(`${e.entidad}: ${e.vencen90d} más vencen en 90 días`)
    }
    // ANTES del vencimiento: renovaciones que caen en ≤30 d con la compañía muda.
    const riesgo = e.vencen30d === undefined ? undefined : e.vencen30d === null ? null : e.vencen30d
    if (riesgo != null && riesgo > 0) {
      motivos.push(
        `${e.nombre ?? e.entidad}: ${riesgo} ${riesgo === 1 ? 'póliza vence' : 'pólizas vencen'} en ≤${DIAS_RENOVACION_RIESGO} d` +
        ` y lleva ${dias ?? '?'} d sin mandar`,
      )
    }
    return { ...base, veredicto: 'silencio', motivos, ...(riesgo === undefined ? {} : { renovacionesEnRiesgo: riesgo }) }
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

/** Una muestra mínima para que un tipo cuente como «habitual» (un CEF trimestral no lo es). */
export const MIN_FICHEROS_90D_TIPO = 3

const NOMBRE_TIPO: Record<string, { plural: string; mudo: string }> = {
  POL: { plural: 'pólizas', mudo: 'mudas' },
  REC: { plural: 'recibos', mudo: 'mudos' },
  SIN: { plural: 'siniestros', mudo: 'mudos' },
  CEF: { plural: 'liquidaciones', mudo: 'mudas' },
}

/** «siniestros (SIN)»; un tipo desconocido se nombra tal cual. */
function nombreTipo(t: string): string {
  const n = NOMBRE_TIPO[t]
  return n ? `${n.plural} (${t})` : t
}

/** Línea corta de pantalla: «Siniestros mudos desde hace 25 d». */
export function lineaTipoMudo(t: TipoMudo): string {
  const n = NOMBRE_TIPO[t.tipo]
  const base = n ? `${n.plural.charAt(0).toUpperCase()}${n.plural.slice(1)} ${n.mudo}` : `${t.tipo} mudo`
  return `${base} desde hace ${t.dias} d`
}

/**
 * Tipos de fichero que han enmudecido DENTRO de una compañía que en conjunto sí manda.
 *
 * Caso real (20/10/2026): Occident manda POL/REC (último 18/10) pero ningún SIN desde el 25/09
 * (antes ~26 en 90 d); Allianz, SIN último el 27/09. El vigía por compañía no lo ve porque
 * mientras llegue un recibo la compañía «manda». Cada tipo se mide contra SU ritmo.
 *
 * Reglas: muestra del baremo (`MIN_HUECOS`), tipo habitual (`ficheros90d ≥ 3`: un CEF trimestral
 * sin muestra no cuenta), suelo de días y `dias > FACTOR × mediana`. Y SOLO si la compañía no
 * está en silencio entero: si lo está, ya avisa ese motivo y no se duplica. `porTipo` ausente
 * ⇒ `[]` (no se mide, no se acusa). `huecoMediano` null ⇒ sin baremo ⇒ no acusa.
 */
export function tiposMudos(e: EntidadIngesta): TipoMudo[] {
  if (!Array.isArray(e.porTipo) || e.porTipo.length === 0) return []
  if (veredictoCompania(e).veredicto === 'silencio') return []
  const out: TipoMudo[] = []
  for (const t of e.porTipo) {
    if (t.diasSinFichero === null || t.huecoMediano === null) continue
    if (t.huecosObservados < MIN_HUECOS || t.ficheros90d < MIN_FICHEROS_90D_TIPO) continue
    if (t.diasSinFichero >= SUELO_DIAS && t.diasSinFichero > FACTOR_SILENCIO * t.huecoMediano) {
      out.push({ tipo: t.tipo, dias: t.diasSinFichero, huecoMediano: t.huecoMediano })
    }
  }
  return out.sort((a, b) => b.dias - a.dias || a.tipo.localeCompare(b.tipo))
}

/**
 * Veredicto sobre UNA compañía: el de siempre, y `tipo_mudo` cuando está `ok` por compañía pero
 * un tipo suyo ha enmudecido. Solo se degrada desde `ok`: `silencio` ya es más grave y
 * `sin_base`/`nunca`/`sin_datos` son huecos de conocimiento que no se pisan.
 */
export function veredictoEntidad(e: EntidadIngesta): SilencioEntidad {
  const r = veredictoCompania(e)
  if (r.veredicto !== 'ok') return r
  const mudos = tiposMudos(e)
  if (mudos.length === 0) return r
  const quien = e.nombre ?? e.entidad
  const vivos = (e.porTipo ?? [])
    .filter(t => t.diasSinFichero !== null && !mudos.some(m => m.tipo === t.tipo))
    .map(t => NOMBRE_TIPO[t.tipo]?.plural ?? t.tipo)
  const motivos = mudos.map(m =>
    `${quien}: no manda ${nombreTipo(m.tipo)} desde hace ${m.dias} d` +
    (vivos.length > 0 ? `, aunque sí ${vivos.join('/')}` : '') +
    ` (su ritmo habitual: cada ${m.huecoMediano} d)`,
  )
  return { ...r, veredicto: 'tipo_mudo', motivos, tiposMudos: mudos }
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
  return v === 'silencio' ? 0 : v === 'tipo_mudo' ? 1 : v === 'nunca' ? 2 : v === 'sin_base' ? 3 : v === 'sin_datos' ? 4 : 5
}

/**
 * Las frases para el aviso. Solo habla de lo que exige mirar algo: el `ok` no
 * genera línea (un vigía que enumera a los sanos entrena a no leerlo), pero
 * `sin_base` y `nunca` SÍ, porque son huecos de conocimiento y callarlos los
 * convierte en un «va bien» que nadie ha comprobado.
 */
export function motivosSilencio(lista: SilencioEntidad[] | null): string[] {
  if (lista === null) return ['No se ha podido comprobar si alguna compañía ha dejado de mandar.']
  const m = lista.filter(e => e.veredicto !== 'ok').flatMap(e => e.motivos)
  // Una sola línea de acción por aviso, no una por compañía.
  if (lista.some(e => e.veredicto === 'silencio' || e.veredicto === 'tipo_mudo')) m.push(ACCION_SILENCIO)
  return m
}
