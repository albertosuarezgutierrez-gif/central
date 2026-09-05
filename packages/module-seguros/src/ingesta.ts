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
   * Las huérfanas UNA A UNA, para poder pedírselas a la compañía. `null` = no
   * se ha podido listar, que **no** es «no hay ninguna»: con `huerfanas > 0` y
   * esto a `null` el vigía dice que sabe cuántas son pero no cuáles.
   */
  huerfanasDetalle?: PolizaHuerfana[] | null
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
  /**
   * Las huérfanas repartidas por lo que hay que HACER con ellas, agrupadas por
   * clave de mediador. `null` = no se ha podido listar (nunca «no hay»).
   */
  huerfanasReparto: RepartoHuerfanas | null
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
      huerfanasReparto: null,
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
  // La lista CONCRETA, si el puerto la ha podido traer. `null` ≠ `[]`: sin ella
  // se sabe cuántas son pero no cuáles, y eso no se tapa con un recuento.
  const huerfanasReparto = repartirHuerfanas(
    Array.isArray(e.huerfanasDetalle) ? e.huerfanasDetalle : null,
  )

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
  // 🎯 Lo ACCIONABLE: qué pólizas concretas hay que pedirle a qué clave de
  // mediador. Sin esto el aviso describe la avería pero no deja hacer nada con
  // ella — no se le puede pedir a Occident una lista que no se tiene.
  if (huerfanasReparto !== null) {
    for (const g of huerfanasReparto.pedir) {
      motivos.push(
        `${etiquetaGrupo(g)}: ${g.n} póliza(s) que hay que pedirle a la compañía`,
      )
    }
    if (huerfanasReparto.totalRevisarFusion > 0) {
      motivos.push(
        `${huerfanasReparto.totalRevisarFusion} póliza(s) solo constan como fila fusionada (lápida): ` +
        'revisa la fusión antes de pedirlas',
      )
    }
  } else if (huerfanas !== null && huerfanas > 0) {
    // Saber cuántas y no cuáles es un estado propio, y se declara: si se
    // callara, el aviso parecería completo y no lo está.
    motivos.push('No se ha podido obtener la lista de esas pólizas: sé cuántas son, no cuáles pedir')
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
    huerfanasReparto,
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

// ── El recordatorio: por qué un aviso que se calla es un aviso roto ─────────
//
// 🚨 Medido el 05/09/2026, y es la segunda vuelta del MISMO fallo que este
// módulo vino a arreglar.
//
// El vigía de la ingesta suena cuando la firma del estado CAMBIA, para no
// repetirse cada mañana. Razonable — salvo cuando la avería se queda quieta:
// del 08/07 al 05/09 el atasco de siniestros de Occident no varió, la firma
// tampoco, y el Telegram **no volvió a sonar en 59 días**. El latido lo decía
// («SIN: 63 días sin guardar ni uno») pero eso vive en una pantalla que nadie
// abre a diario.
//
// O sea: la primera versión midió lo que no era (`ficherosError`, que valía
// cero) y esta se silenció sola. Las dos veces el resultado fue el mismo —una
// pérdida activa en verde— y las dos veces se descubrió mirando a mano.
//
// La regla: **silenciar la repetición NO es silenciar la avería.** Mientras
// siga abierta, vuelve a sonar cada `DIAS_RECORDATORIO_INGESTA`, y el mensaje
// dice cuánto lleva rota — que es justo el dato que convierte «otra vez esto»
// en «esto hay que arreglarlo hoy».

/** Cada cuánto vuelve a sonar una avería que sigue igual. Una semana: molesta
 *  lo justo para no ignorarse, y no tanto como para silenciarse a mano. */
export const DIAS_RECORDATORIO_INGESTA = 7

export type MotivoAviso = 'primera' | 'cambio' | 'recordatorio'

export type DecisionAviso =
  | { avisar: false }
  | { avisar: true; motivo: MotivoAviso; diasAbierta: number | null }

/**
 * ¿Hay que sonar hoy?
 *
 * - `primera`      — no consta que se haya avisado nunca. Suena siempre: perder
 *                    un aviso es peor que duplicarlo.
 * - `cambio`       — el estado ha cambiado (entró otro fichero, apareció otra
 *                    huérfana). Suena, y el mensaje lo dirá.
 * - `recordatorio` — sigue igual, pero lleva demasiado abierta.
 *
 * `ultimoAvisoEn = null` NO significa «hace poco»: significa **no lo sabemos**,
 * y ante eso se avisa. Es la regla de la casa aplicada a una alarma — un hueco
 * en el registro no puede convertirse en silencio.
 */
export function decidirAvisoIngesta(e: {
  firmaAnterior: string | null
  firmaActual: string
  ultimoAvisoEn: Date | null
  /** Desde cuándo consta abierta esta misma avería. `null` = no se sabe. */
  abiertaDesde?: Date | null
  hoy: Date
  diasRecordatorio?: number
}): DecisionAviso {
  const dias = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86_400_000)
  const abierta =
    e.abiertaDesde instanceof Date ? Math.max(0, dias(e.hoy, e.abiertaDesde)) : null

  if (e.firmaAnterior === null || e.ultimoAvisoEn === null) {
    return { avisar: true, motivo: 'primera', diasAbierta: abierta }
  }
  if (!e.firmaAnterior.startsWith(e.firmaActual)) {
    return { avisar: true, motivo: 'cambio', diasAbierta: abierta }
  }
  const tope = e.diasRecordatorio ?? DIAS_RECORDATORIO_INGESTA
  if (dias(e.hoy, e.ultimoAvisoEn) >= tope) {
    return { avisar: true, motivo: 'recordatorio', diasAbierta: abierta }
  }
  return { avisar: false }
}

// ── Las pólizas que CIMA cita y NO tenemos: qué pedir y a quién ─────────────
//
// 🚨 Medido el 05/09/2026. El vigía ya decía «20 póliza(s) con recibos o
// siniestros que no encuentran su póliza» y «3 de ellas ya están en la
// cartera»… pero **no decía CUÁLES**. Alberto no le puede pedir a Occident el
// volcado de una lista que no tiene, así que el aviso describía una pérdida
// activa sin dejar hacer nada con ella. Es la regla de la casa —un aviso que no
// llega a la pantalla donde está la persona no existe— aplicada al CONTENIDO:
// aquí llegaba, pero sin el dato con el que se actúa.
//
// Las dos acciones son distintas y no se pueden contar juntas:
//
//   • La póliza NO está en la cartera → **se le PIDE a la compañía**. CIMA solo
//     manda `POL` en altas y modificaciones, así que una póliza vieja que nunca
//     se movió no ha llegado nunca: falta la carga inicial de ESA clave de
//     mediador. Es un correo, y para escribirlo hace falta la lista de números.
//   • La póliza SÍ está → el recibo/siniestro llegó antes que ella y nadie lo
//     volvió a mirar: se arregla **REPROCESANDO** el fichero EIAC. 🚨 Y eso NO
//     se puede hacer desde central: aquí no se guarda el XML (`cima_ficheros`
//     solo tiene `xml_hash`, y el payload del evento solo lleva metadatos), así
//     que el fichero vive en la ingesta de origen. Prometer un botón de
//     reintento aquí sería prometer algo que no se puede cumplir.
//
// Colapsarlas manda a hacer el trabajo equivocado: preguntarle a la compañía
// por algo que ya está en la BD, o esperar un reproceso de algo que nunca llegó.

/**
 * Dónde está la póliza que CIMA cita. **Tres estados, nunca dos:** una fila
 * FUSIONADA (lápida) no es «la tenemos» —el recibo no puede colgar de ahí— pero
 * tampoco es «no la tenemos», y pedírsela a la compañía sería pedir dos veces
 * lo que ya está. Hoy son 0, y el hueco se declara antes de que aparezca.
 */
export type PolizaEnCartera = 'viva' | 'lapida' | 'ausente'

/**
 * Una póliza que CIMA nombra en un recibo o un siniestro que no se pudo guardar.
 *
 * 🚨 `idPolizaEntidad` es el **número de póliza de la compañía**: es lo que hay
 * que citar en el correo, y no es un dato personal. De aquí NO sale nada del
 * cliente (ni nombre, ni DNI, ni matrícula): para que Occident mande el volcado
 * de doce pólizas no hace falta decirle de quién son.
 */
export type PolizaHuerfana = {
  /** Código DGS de la compañía (p. ej. `C0468`). */
  entidad: string
  /**
   * Nombre común de la compañía, si consta en `companias_dgs`. `null` = no se
   * inventa: se cita el código y punto.
   */
  entidadNombre: string | null
  /** Clave de MEDIADOR bajo la que llegó (2º campo del nombre EIAC). */
  clave: string | null
  /** Número de póliza de la compañía. */
  idPolizaEntidad: string
  /** Recibos suyos que se quedaron sin colgar. */
  recibos: number
  /** Siniestros suyos que se quedaron sin colgar. */
  siniestros: number
  /** Prima de esos recibos, en euros. `null` = ninguno la traía. */
  prima: number | null
  /** Fecha (ISO, solo día) del último evento suyo. `null` = no consta. */
  ultimoEn: string | null
  enCartera: PolizaEnCartera
}

/** Un lote de pólizas que se piden (o se arreglan) DE UNA VEZ: mismo destino. */
export type GrupoHuerfanas = {
  entidad: string
  entidadNombre: string | null
  clave: string | null
  /** Números de póliza, ya ordenados y sin repetir. */
  polizas: string[]
  n: number
  /** Suma de la prima de sus recibos. `null` = ninguna traía prima. */
  prima: number | null
  recibos: number
  siniestros: number
}

export type RepartoHuerfanas = {
  /** No están en la cartera: **se le piden a la compañía** (un correo). */
  pedir: GrupoHuerfanas[]
  /** Ya están: se arreglan **reprocesando** el fichero en la ingesta de origen. */
  reprocesar: GrupoHuerfanas[]
  /** Solo constan como lápida de una fusión: se mira la fusión, no se pide. */
  revisarFusion: GrupoHuerfanas[]
  totalPedir: number
  totalReprocesar: number
  totalRevisarFusion: number
}

/**
 * Cuántos números de póliza caben en el aviso de Telegram.
 *
 * Telegram corta el mensaje en 4.096 caracteres y `tgSend` no lo trocea: pasarse
 * no manda un mensaje largo, manda CERO. El resto del aviso (motivos, prima,
 * reparto por clave, antigüedad y recado) ronda los 900 caracteres, y un número
 * de póliza de estas compañías ocupa hasta 14 (`8-10.745.696-P`) más el
 * separador: 20 números son unos 350 caracteres, con más de 2.500 de margen.
 *
 * Y 20 es más que los 17 atascados hoy (05/09/2026), o sea que **el mensaje sale
 * completo y se puede reenviar tal cual a la compañía**, que es el propósito
 * entero. El tope solo muerde si la avería crece, y entonces lo dice.
 */
export const TOPE_POLIZAS_TELEGRAM = 20

/** Etiqueta de a quién se le pide: compañía + CLAVE DE MEDIADOR, nunca solo la
 *  compañía. Occident manda por tres claves y el atasco no está repartido
 *  igual: decir «Occident» manda a revisar una cartera que en parte va bien. */
function etiquetaGrupo(
  g: { entidad: string; entidadNombre: string | null; clave: string | null },
): string {
  const quien = g.entidadNombre ? `${g.entidadNombre} (${g.entidad})` : g.entidad
  return g.clave ? `${quien} / clave ${g.clave}` : `${quien} (clave no legible en el nombre)`
}

function normalizarClave(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  // Un valor de cajón es ausencia, no dato: agrupar por «desconocido» juntaría
  // carteras distintas bajo una clave inventada.
  if (!t || t === '-' || /^(n\/a|desconocid[ao]|sin clave)$/i.test(t)) return null
  return t
}

function agrupar(filas: PolizaHuerfana[]): GrupoHuerfanas[] {
  type Acc = GrupoHuerfanas & { vistas: Map<string, PolizaHuerfana> }
  const cuenta = new Map<string, Acc>()
  for (const f of filas) {
    const id = (f.idPolizaEntidad ?? '').trim()
    if (!id) continue // sin número no se puede pedir nada, y no se inventa uno
    const clave = normalizarClave(f.clave)
    const k = `${f.entidad} | ${clave ?? ''}`
    let g = cuenta.get(k)
    if (!g) {
      g = {
        entidad: f.entidad,
        entidadNombre: f.entidadNombre ?? null,
        clave,
        polizas: [],
        n: 0,
        prima: null,
        recibos: 0,
        siniestros: 0,
        vistas: new Map(),
      }
      cuenta.set(k, g)
    }
    // La misma póliza citada dos veces es UNA póliza que pedir, no dos.
    if (g.vistas.has(id)) continue
    g.vistas.set(id, f)
    g.recibos += f.recibos
    g.siniestros += f.siniestros
    // `null` + `null` sigue siendo `null`: «ningún recibo traía prima» no es 0 €.
    if (typeof f.prima === 'number' && Number.isFinite(f.prima)) {
      g.prima = (g.prima ?? 0) + f.prima
    }
  }
  const grupos = [...cuenta.values()].map(g => {
    const filasG = [...g.vistas.values()].sort((a, b) => {
      // Si el tope corta, que lo que se quede fuera sea de lo que menos consta:
      // primero la póliza de la que más nos están mandando, luego la de más
      // prima, y a igualdad el número (para que la lista sea reproducible).
      const ev = (x: PolizaHuerfana) => x.recibos + x.siniestros
      return ev(b) - ev(a) || (b.prima ?? 0) - (a.prima ?? 0)
        || a.idPolizaEntidad.localeCompare(b.idPolizaEntidad)
    })
    const { vistas: _vistas, ...limpio } = g
    return { ...limpio, polizas: filasG.map(x => x.idPolizaEntidad), n: filasG.length }
  })
  return grupos.sort(
    (a, b) => b.n - a.n || a.entidad.localeCompare(b.entidad)
      || (a.clave ?? '').localeCompare(b.clave ?? ''),
  )
}

/**
 * Reparte las huérfanas por lo que hay que HACER con cada una.
 *
 * 🚨 `null` entra, `null` sale: no haber podido listarlas no es «no hay
 * ninguna». Un `[]` aquí significa «se miró y no hay», y la diferencia es la
 * que separa un vigía útil de uno que se pone verde solo.
 */
export function repartirHuerfanas(filas: PolizaHuerfana[] | null): RepartoHuerfanas | null {
  if (filas === null) return null
  const pedir = agrupar(filas.filter(f => f.enCartera === 'ausente'))
  const reprocesar = agrupar(filas.filter(f => f.enCartera === 'viva'))
  const revisarFusion = agrupar(filas.filter(f => f.enCartera === 'lapida'))
  const suma = (gs: GrupoHuerfanas[]) => gs.reduce((n, g) => n + g.n, 0)
  return {
    pedir,
    reprocesar,
    revisarFusion,
    totalPedir: suma(pedir),
    totalReprocesar: suma(reprocesar),
    totalRevisarFusion: suma(revisarFusion),
  }
}

/** Los números vienen de un XML de la compañía: se escapan antes de ir a HTML. */
function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * El bloque del Telegram, en HTML. Cadena vacía cuando no hay nada que decir.
 *
 * Dice QUÉ HACER, no cuántas hay: «pídele a Occident el volcado de estas 12
 * pólizas de la clave M00171» y la lista detrás, para poder copiarla al correo.
 * Si el tope corta, se dice cuántas faltan y **dónde están de verdad** — nunca
 * se manda a una pantalla que no existe.
 */
export function textoHuerfanas(
  r: RepartoHuerfanas | null,
  opciones: { tope?: number; donde?: string } = {},
): string {
  const donde = opciones.donde ?? 'el puerto <code>/api/operador/huerfanas</code> de asegura'
  if (r === null) {
    // Saber cuántas y no cuáles es un estado propio. Callarlo dejaría un aviso
    // con pinta de completo que no lo está.
    return '\n\n📄 <b>No he podido listar qué pólizas son.</b> Sé que faltan, no cuáles: ' +
      'sin la lista no se le puede pedir el volcado a nadie.'
  }
  const tope = opciones.tope ?? TOPE_POLIZAS_TELEGRAM
  const partes: string[] = []

  if (r.pedir.length > 0) {
    partes.push(
      `\n\n📄 <b>Hay que pedírselas a la compañía</b> (${r.totalPedir} póliza(s) que CIMA nombra y no tenemos):`,
    )
    // El presupuesto de números es GLOBAL: lo que importa es que el mensaje
    // salga, y Telegram no manda NADA si se pasa de 4.096 caracteres.
    let quedan = Math.max(0, tope)
    for (const g of r.pedir) {
      const muestra = g.polizas.slice(0, quedan)
      quedan -= muestra.length
      const resto = g.n - muestra.length
      const cola = resto > 0 ? ` … y ${resto} más (en ${donde})` : ''
      const lista = muestra.length > 0
        ? `: ${muestra.map(esc).join(' · ')}${cola}`
        : ` (no caben aquí: están en ${donde})`
      partes.push(
        `\n• Pídele a <b>${esc(etiquetaGrupo(g))}</b> el volcado de estas ${g.n} póliza(s)${lista}`,
      )
    }
  }

  if (r.totalReprocesar > 0) {
    // Acción DISTINTA y en otro sitio: mezclarla con las de arriba llevaría a
    // pedirle a la compañía algo que ya está en la BD.
    partes.push(
      `\n\n♻️ Otras <b>${r.totalReprocesar}</b> sí están en la cartera: llegaron antes que su póliza. ` +
      'Esas NO se piden — se arreglan reprocesando el fichero EIAC, y eso hay que hacerlo en la ' +
      'ingesta de origen: aquí no se guarda el XML, solo su hash.',
    )
  }

  if (r.totalRevisarFusion > 0) {
    partes.push(
      `\n\n⚠️ Y <b>${r.totalRevisarFusion}</b> solo constan como fila fusionada (lápida). ` +
      'Antes de pedirlas, mira la fusión: pedir lo que ya está es pedir dos veces.',
    )
  }

  return partes.join('')
}
