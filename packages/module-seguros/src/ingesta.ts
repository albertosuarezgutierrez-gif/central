/**
 * Salud de la INGESTA de CIMA — el vigía de que los datos de las compañías
 * llegan de verdad.
 *
 * Contexto que justifica este módulo (medido el 01/09/2026): durante más de dos
 * meses se perdieron 23 recibos (7.721,71€ de prima) y 20 siniestros de
 * Occident, y el health-check de origen estuvo TODO ese tiempo en verde. No por
 * falta de vigilancia: su parte diario traía `cuarentenaTotal: 41` —y creciendo,
 * 39 → 40 → 41 en seis días— pero sus señales de alarma eran `ficherosError` y
 * `ficherosDeferred`, que valían cero. **Medía lo que no era.**
 *
 * De ahí las dos reglas de este helper:
 *
 * 1. **Se vigila lo que se pierde, no lo que se intenta.** La señal es el
 *    fichero que se queda en cuarentena, no si el cron se disparó.
 * 2. **No poder mirar NO es estar bien.** Si la lectura falla, el estado es
 *    `sin_datos` y se dice; jamás `ok`. Un vigía que se pone verde porque la
 *    consulta no devolvió nada es el fallo más caro que hay (regla global de
 *    `CLAUDE.md`).
 *
 * Todo aquí es puro: decide con números, sin BD ni red.
 */

/** Qué se sabe de la ingesta. Tres estados, nunca dos. */
export type EstadoIngesta =
  /** Se ha podido mirar y no hay nada atascado reciente. */
  | 'ok'
  /** Se ha podido mirar y SÍ se están perdiendo datos. */
  | 'degradada'
  /** No se ha podido mirar. NO es «está bien». */
  | 'sin_datos'

/** Un fichero que la ingesta no pudo procesar y dejó en cuarentena. */
export type FicheroEnCuarentena = {
  /** `POL` | `REC` | `SIN` | `CEF`. */
  tipo: string
  /** Código DGS de la entidad emisora (p. ej. `C0468`). */
  entidad: string
  /** Días transcurridos desde que se descargó. */
  dias: number
  /**
   * Clave de MEDIADOR bajo la que la compañía manda el fichero (2º campo del
   * nombre EIAC: `C0468_8-92361_REC_…`). Cada compañía asigna la suya y una
   * misma compañía puede mandar por VARIAS —Occident usa `8-92361`, `M00171` y
   * `306333`—, así que sin ella el reparto por entidad esconde de qué cartera
   * se está perdiendo el dato. `null`/ausente = no consta en el nombre, que NO
   * es lo mismo que «no tiene clave».
   */
  clave?: string | null
}

/**
 * Ventana de «esto es de ahora». Un fichero atascado hace meses ya no es una
 * noticia: es backlog conocido y se cuenta aparte. Lo que tiene que despertar a
 * alguien es que ENTRE algo nuevo.
 */
export const DIAS_CUARENTENA_RECIENTE = 7

export type EntradaSalud = {
  /** Ficheros en cuarentena. Lista vacía = comprobado que no hay. */
  cuarentena: FicheroEnCuarentena[] | null
  /** Pólizas distintas cuyos recibos/siniestros no encuentran dónde colgarse. */
  huerfanas?: number | null
  /** Prima de los recibos que no se han podido guardar, en euros. */
  primaPerdida?: number | null
  /** Días desde la última vez que se persistió algo, por tipo de objeto. */
  diasSinPersistir?: Record<string, number | null> | null
  /**
   * De las huérfanas, cuántas tienen YA su póliza en la cartera: llegaron antes
   * que ella y nadie las volvió a mirar. Se arreglan REPROCESANDO, sin
   * preguntar a nadie. Las demás son cartera que la compañía nunca mandó (CIMA
   * solo envía POL en altas y modificaciones) y exigen una carga inicial por
   * clave de mediador. Son dos averías distintas y no se pueden contar juntas.
   * `null` = no se ha podido distinguir.
   */
  huerfanasResolubles?: number | null
}

export type SaludIngesta = {
  estado: EstadoIngesta
  /** Total en cuarentena, del principio de los tiempos. */
  total: number
  /** Los que entraron dentro de la ventana reciente: esto es lo que alarma. */
  recientes: number
  /** Reparto por entidad, de más a menos. Señala a QUIÉN preguntar. */
  porEntidad: Array<{ entidad: string; n: number }>
  /**
   * Reparto por entidad + clave de mediador. Es el que dice QUÉ CARTERA se
   * está perdiendo: dos claves de la misma compañía pueden ir una perfecta y
   * la otra entera en cuarentena. Los ficheros sin clave legible no se
   * inventan una: se agrupan como `null` y se declaran.
   */
  porClave: Array<{ entidad: string; clave: string | null; n: number }>
  huerfanas: number | null
  /** Huérfanas cuya póliza YA está en la cartera (se arreglan reprocesando). */
  huerfanasResolubles: number | null
  primaPerdida: number | null
  /** Frases listas para el aviso. Vacío cuando no hay nada que decir. */
  motivos: string[]
}

/** Un valor de cajón (vacío, guiones, «desconocido») es ausencia, no dato. */
function claveDe(f: FicheroEnCuarentena): string | null {
  const v = (f.clave ?? '').trim()
  if (!v || v === '-' || /^(n\/a|desconocid[ao]|sin clave)$/i.test(v)) return null
  return v
}

function repartoClave(
  cuarentena: FicheroEnCuarentena[],
): Array<{ entidad: string; clave: string | null; n: number }> {
  const cuenta = new Map<string, { entidad: string; clave: string | null; n: number }>()
  for (const f of cuarentena) {
    const clave = claveDe(f)
    const k = `${f.entidad}\u0000${clave ?? ''}`
    const previo = cuenta.get(k)
    if (previo) previo.n += 1
    else cuenta.set(k, { entidad: f.entidad, clave, n: 1 })
  }
  return [...cuenta.values()].sort(
    (a, b) => b.n - a.n || a.entidad.localeCompare(b.entidad) || (a.clave ?? '').localeCompare(b.clave ?? ''),
  )
}

function reparto(cuarentena: FicheroEnCuarentena[]): Array<{ entidad: string; n: number }> {
  const cuenta = new Map<string, number>()
  for (const f of cuarentena) cuenta.set(f.entidad, (cuenta.get(f.entidad) ?? 0) + 1)
  return [...cuenta.entries()]
    .map(([entidad, n]) => ({ entidad, n }))
    .sort((a, b) => b.n - a.n || a.entidad.localeCompare(b.entidad))
}

/**
 * Veredicto sobre la ingesta.
 *
 * `degradada` exige una señal MEDIDA de pérdida: un fichero atascado en la
 * ventana reciente, o pólizas huérfanas. El backlog viejo por sí solo no
 * alarma (se informa, pero no despierta a nadie a las 8 de la mañana) — un
 * vigía que grita todos los días por lo mismo se acaba silenciando, y entonces
 * no avisa el día que importa.
 */
export function saludIngesta(
  e: EntradaSalud,
  diasRecientes: number = DIAS_CUARENTENA_RECIENTE,
): SaludIngesta {
  if (e.cuarentena === null) {
    return {
      estado: 'sin_datos',
      total: 0,
      recientes: 0,
      porEntidad: [],
      porClave: [],
      huerfanas: null,
      huerfanasResolubles: null,
      primaPerdida: null,
      motivos: ['No se ha podido leer el estado de la ingesta. Esto NO significa que vaya bien.'],
    }
  }

  const total = e.cuarentena.length
  const recientes = e.cuarentena.filter(f => f.dias <= diasRecientes).length
  const huerfanas = typeof e.huerfanas === 'number' ? e.huerfanas : null
  const primaPerdida = typeof e.primaPerdida === 'number' ? e.primaPerdida : null
  const porEntidad = reparto(e.cuarentena)
  const porClave = repartoClave(e.cuarentena)
  const huerfanasResolubles =
    typeof e.huerfanasResolubles === 'number' ? e.huerfanasResolubles : null

  const motivos: string[] = []
  if (recientes > 0) {
    // Se señala la CLAVE, no solo la entidad: «Occident» no dice nada cuando
    // Occident manda por tres claves y solo una está atascada.
    const culpable = repartoClave(e.cuarentena.filter(f => f.dias <= diasRecientes))[0]
    const quien = culpable
      ? `${culpable.entidad}${culpable.clave ? ` / clave ${culpable.clave}` : ' (clave no legible en el nombre)'}: ${culpable.n}`
      : null
    motivos.push(
      `${recientes} fichero(s) sin procesar en los últimos ${diasRecientes} días` +
      (quien ? ` (sobre todo ${quien})` : ''),
    )
  }
  if (huerfanas !== null && huerfanas > 0) {
    motivos.push(`${huerfanas} póliza(s) con recibos o siniestros que no encuentran su póliza en la cartera`)
    // Las dos averías se cuentan por separado o el aviso manda al sitio
    // equivocado: una se arregla en casa, la otra pidiendo la cartera.
    if (huerfanasResolubles !== null && huerfanasResolubles > 0) {
      motivos.push(
        `${huerfanasResolubles} de ellas YA están en la cartera (llegaron antes que su póliza): se arreglan reprocesando`,
      )
    }
    if (huerfanasResolubles !== null && huerfanas > huerfanasResolubles) {
      motivos.push(
        `${huerfanas - huerfanasResolubles} no están en la cartera: falta la carga inicial de esa clave de mediador`,
      )
    }
  }
  if (total > recientes) {
    motivos.push(`${total - recientes} más arrastrados de antes (backlog ya conocido)`)
  }

  // Un tipo de objeto que lleva mucho sin persistir nada es la otra cara del
  // mismo fallo: no hay fichero en cuarentena porque ni siquiera llegó.
  for (const [tipo, dias] of Object.entries(e.diasSinPersistir ?? {})) {
    if (dias !== null && dias > 30) motivos.push(`${tipo}: ${dias} días sin guardar ni uno`)
  }

  const hayPerdida = recientes > 0 || (huerfanas !== null && huerfanas > 0)
  return {
    estado: hayPerdida ? 'degradada' : 'ok',
    total,
    recientes,
    porEntidad,
    porClave,
    huerfanas,
    huerfanasResolubles,
    primaPerdida,
    motivos,
  }
}

/** Una línea para el latido/Telegram. Nunca dice «todo bien» sin haberlo mirado. */
export function detalleSalud(s: SaludIngesta): string {
  if (s.estado === 'sin_datos') return 'ingesta CIMA: no se ha podido comprobar'
  if (s.estado === 'ok') {
    return s.total === 0
      ? 'ingesta CIMA: sin ficheros atascados'
      : `ingesta CIMA: sin novedades (${s.total} en backlog antiguo)`
  }
  return `ingesta CIMA DEGRADADA · ${s.motivos.join(' · ')}`
}
