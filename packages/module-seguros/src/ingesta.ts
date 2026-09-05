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

import { motivosSilencio, type SilencioEntidad } from './silencio-entidad.ts'

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

/**
 * Algo que un proveedor NOS MANDÓ y no supimos aceptar.
 *
 * 🚨 Caso fundacional (04/09/2026): `apps/asegura/CLAUDE.md` afirmaba que el
 * webhook de Codeoscopic estaba «SIN ESTRENAR, no roto» y que «no se pierda
 * tiempo arreglando eso». Medido ese día en `operational_events`: **23
 * `codeoscopic_webhook_invalid_payload` en 24 h, uno cada 30 minutos**, desde
 * la misma IP, con `authPresente: true` y UA `Apache-HttpAsyncClient (Java)`.
 * O sea: su sistema mandando de verdad, autenticado, y nosotros tirándolo todo
 * por una diferencia de FORMA (`rootType: "array"` contra un validador que
 * espera un objeto).
 *
 * Y nadie se enteró en un día entero, porque este vigía miraba la cuarentena de
 * CIMA y las huérfanas — pero no la puerta por la que entra Codeoscopic. Es
 * literalmente la lección del módulo repetida en otra puerta: **se medía lo que
 * no era**.
 */
export type EntradaRechazada = {
  /** Nombre del evento, p. ej. `codeoscopic_webhook_invalid_payload`. */
  evento: string
  /** De dónde vino (`source` del evento). `null` = el evento no lo dice. */
  origen: string | null
  /** Cuántos en la ventana reciente. */
  n: number
  /** Horas desde el último. `null` = no se ha podido calcular. */
  horasDesdeUltimo: number | null
}

/** Un rechazo de hace un mes es historia; uno de hoy es una avería en curso. */
export const HORAS_RECHAZO_RECIENTE = 24

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
  /**
   * Lo que nos mandaron y rechazamos en la ventana reciente. **`[]` = se miró y
   * no hay ninguno; `null` = NO se ha podido mirar**, que no es lo mismo y por
   * eso no se colapsan.
   */
  rechazos?: EntradaRechazada[] | null
  /**
   * Veredicto por COMPAÑÍA sobre quién ha dejado de mandar. **`null` = no se ha
   * podido mirar**, y se declara como hueco; nunca se colapsa con «todas
   * mandan». Es la cuarta cara de la misma avería y la única que se dispara sin
   * que llegue nada: ver `silencio-entidad.ts`.
   */
  silencio?: SilencioEntidad[] | null
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
  /** Entradas rechazadas recientes. `null` = no comprobado, nunca «no hay». */
  rechazos: EntradaRechazada[] | null
  /** Quién ha dejado de mandar. `null` = no comprobado, nunca «nadie». */
  silencio: SilencioEntidad[] | null
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
      rechazos: null,
      silencio: null,
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

  // 🚨 La TERCERA cara: algo que sí llegó y no supimos aceptar. No deja fichero
  // en cuarentena ni huérfana, así que sin esto es invisible — y se repite cada
  // media hora, que es lo que lo hace caro.
  const rechazos = Array.isArray(e.rechazos) ? e.rechazos : null
  const rechazosRecientes = (rechazos ?? []).filter(
    r => r.horasDesdeUltimo !== null && r.horasDesdeUltimo <= HORAS_RECHAZO_RECIENTE && r.n > 0,
  )
  for (const r of rechazosRecientes) {
    motivos.push(
      `${r.n} envío(s) RECHAZADOS en ${HORAS_RECHAZO_RECIENTE} h por ${r.origen ?? 'origen no informado'}` +
      ` (${r.evento}): nos lo mandan y no lo aceptamos`,
    )
  }

  // 🚨 La CUARTA cara, y la única que no deja rastro: la compañía que
  // sencillamente deja de mandar. No hay cuarentena (nada llegó que atascar),
  // ni huérfana, ni rechazo — así que sin esto es invisible por diseño. Mapfre
  // estuvo 74 días callada con 64 pólizas vivas y este vigía en verde.
  const silencio = Array.isArray(e.silencio) ? e.silencio : e.silencio === null ? null : null
  if (silencio !== null) motivos.push(...motivosSilencio(silencio))
  else if (e.silencio === null) {
    motivos.push('No se ha podido comprobar si alguna compañía ha dejado de mandar.')
  }
  const mudas = (silencio ?? []).filter(x => x.veredicto === 'silencio')

  const hayPerdida =
    recientes > 0 ||
    (huerfanas !== null && huerfanas > 0) ||
    rechazosRecientes.length > 0 ||
    mudas.length > 0
  return {
    estado: hayPerdida ? 'degradada' : 'ok',
    silencio,
    total,
    recientes,
    porEntidad,
    porClave,
    huerfanas,
    huerfanasResolubles,
    primaPerdida,
    rechazos,
    motivos,
  }
}

/** Una línea para el latido/Telegram. Nunca dice «todo bien» sin haberlo mirado. */
export function detalleSalud(s: SaludIngesta): string {
  if (s.estado === 'sin_datos') return 'ingesta CIMA: no se ha podido comprobar'
  if (s.estado === 'ok') {
    // Si no se pudieron mirar los rechazos, el «sin novedades» habla SOLO de la
    // cuarentena y hay que decirlo: prometer calma sobre una puerta que no se ha
    // abierto es el fallo que este módulo existe para no repetir.
    const coletilla =
      (s.rechazos === null ? ' · envíos rechazados: sin comprobar' : '') +
      (s.silencio === null ? ' · silencio por compañía: sin comprobar' : '')
    return (s.total === 0
      ? 'ingesta CIMA: sin ficheros atascados'
      : `ingesta CIMA: sin novedades (${s.total} en backlog antiguo)`) + coletilla
  }
  return `ingesta CIMA DEGRADADA · ${s.motivos.join(' · ')}`
}
