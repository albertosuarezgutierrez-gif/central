// El cliente del puerto de retarificación de asegura — **el único sitio de
// plataforma desde el que se gasta dinero en un tercero**.
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// Alberto trabaja SOLO en `apps/plataforma` → `/correduria`. Hasta el
// 03/09/2026, para retarificar una póliza, un enlace ↗ le sacaba a
// `apps/asegura` (otro dominio, otra sesión) y **le echaba al login**: medido en
// producción, `GET /cartera/poliza/9588dad8-… → 307 /login`. La correduría se
// unificó en una sola pantalla y esta es la mitad de plataforma: el lector del
// puerto que ya sirve `apps/asegura` en `/api/operador/codeoscopic/*`.
//
// Sigue el patrón de los diez lectores hermanos (`correduria-puerto.ts`,
// `ficha-asegura.ts`, `poliza-asegura.ts`…): `pedir()` con Bearer,
// `cache:'no-store'`, y **interpretadores PUROS** separados de la llamada, para
// que el cepo pueda probarlos sin red y sin gastar un céntimo.
//
// ─── Las dos diferencias con sus hermanos, y las dos importan ───────────────
//
// 1. **El timeout no son 8 s.** Los lectores leen la cartera de nuestra propia
//    base y 8 s sobran. Aquí, al otro lado, hay una llamada al vendor que
//    Codeoscopic documenta en **hasta 150 s**. Con 8 s la petición moriría
//    siempre por reloj mientras el cargo se produce igual: el peor de los dos
//    mundos. Por eso `TIMEOUT_COTIZAR_MS` va holgado y la ruta que lo llame
//    tiene que declarar su `maxDuration` acorde.
//
// 2. 🚨 **Un timeout NO es prueba de que no se haya gastado.** Si la petición
//    expira, la cotización puede haberse creado igualmente en el lado del
//    vendor y el cargo puede existir. Este módulo NUNCA dice «no se ha
//    gastado» por su cuenta: solo lo afirma cuando la respuesta de asegura lo
//    declara (`gastado: '0,00€'`, que solo ponen los cortes que suceden ANTES
//    del vendor). En cualquier otro caso —timeout, red, respuesta ilegible,
//    fallo del vendor— sale `gastoDesconocido: true` y la pantalla dice «no sé
//    si ha salido, míralo antes de repetir».
//    Y por lo mismo: **NO se reintenta automáticamente**. `POST /insurances` no
//    es idempotente; un reintento crea otro proyecto y otro cargo.

import { describirCausaAsegura, MOTIVOS_PUERTO, type MotivoPuerto } from './correduria-puerto.ts'

export type { MotivoPuerto }

/** Los catálogos son lecturas del vendor: no cuestan nada, pero tampoco tardan. */
const TIMEOUT_CATALOGO_MS = 15_000

/**
 * 🚨 Cotizar tarda **hasta 150 s** (límite documentado por Codeoscopic). Este
 * margen es a propósito mayor que el del vendor y menor que el `maxDuration`
 * de la ruta que lo invoca, para que el que corte sea este reloj —que sabe
 * redactar la duda— y no el de la plataforma, que corta en seco.
 */
export const TIMEOUT_COTIZAR_MS = 170_000

export type Opcion = { id: string; nombre: string }

// ─── Catálogos (GRATIS) ──────────────────────────────────────────────────────

/**
 * Tres estados, los del resto del puerto. `sin_configurar` NO es «no hay
 * opciones» y `error` NO se degrada a lista vacía: un desplegable vacío sobre
 * un fallo de red diría «esta marca no tiene modelos» (regla de `CLAUDE.md`).
 */
export type RespuestaCatalogo =
  | { estado: 'sin_configurar'; mensaje: string }
  | { estado: 'error'; motivo: MotivoPuerto; mensaje: string }
  | { estado: 'ok'; opciones: Opcion[] }

function leerOpciones(v: unknown): Opcion[] | null {
  if (!Array.isArray(v)) return null
  const out: Opcion[] = []
  for (const o of v) {
    if (typeof o !== 'object' || o === null) return null
    const x = o as Record<string, unknown>
    if (typeof x.id !== 'string' && typeof x.id !== 'number') return null
    if (typeof x.nombre !== 'string') return null
    out.push({ id: String(x.id), nombre: x.nombre })
  }
  return out
}

/** PURO: la respuesta HTTP → los tres estados. Sin red, testeable. */
export function interpretarCatalogo(status: number, json: unknown): RespuestaCatalogo {
  if (status === 401 || status === 403) {
    return { estado: 'error', motivo: 'secreto_rechazado', mensaje: MOTIVOS_PUERTO.secreto_rechazado }
  }
  if (typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
  }
  const r = json as Record<string, unknown>

  if (r.estado === 'sin_configurar') {
    return {
      estado: 'sin_configurar',
      mensaje:
        typeof r.mensaje === 'string'
          ? r.mensaje
          : 'Codeoscopic no está configurado en central-asegura, así que no hay catálogos que enseñar.',
    }
  }
  if (r.estado === 'error') {
    // La `causa` la clasifica `lib/error-cartera.ts` de asegura; el diccionario
    // vive en `correduria-puerto.ts` y NO se duplica aquí.
    const detalle = describirCausaAsegura(typeof r.causa === 'string' ? r.causa : undefined)
    const suyo = typeof r.mensaje === 'string' ? r.mensaje : null
    return {
      estado: 'error',
      motivo: 'asegura_error',
      mensaje: [suyo, detalle].filter((s): s is string => s !== null && s !== '').join(' — ') || MOTIVOS_PUERTO.asegura_error,
    }
  }

  const opciones = r.estado === 'ok' ? leerOpciones(r.opciones) : null
  if (opciones === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
  }
  return { estado: 'ok', opciones }
}

// ─── Precalificación de la póliza (GRATIS) ───────────────────────────────────

/** Una versión vista en OTRA póliza de la misma matrícula. Es una PISTA para el
 *  corredor (texto libre del volcado), no un código Base7 del vendor. */
export type VersionCandidata = { version: string; procedencia: string }

/** Lo que la ficha sabe del coche. `marca`/`modelo` a `null` = la póliza no los
 *  trae; el objeto ENTERO a `null` = no se ha podido mirar. */
export type VehiculoConocido = {
  marca: string | null
  modelo: string | null
  versiones: VersionCandidata[]
}

/** El veredicto del tope de asegura. Mismos campos que su `contador.ts`. */
export type Veredicto =
  | { permitido: true; restantesHoy: number; restantesMes: number }
  | {
      permitido: false
      motivo: 'tope-diario' | 'tope-mensual'
      consumidas: number
      tope: number
      explicacion: string
    }

/**
 * El contador de gasto, ya en los tres estados que pinta la pantalla.
 *
 * `no_disponible` es «no se ha podido mirar» y **no se pinta como “quedan 0”**:
 * el tope de verdad lo sigue aplicando el embudo del otro lado (402 con
 * `gastado: '0,00€'`), así que no saberlo aquí no autoriza a bloquear el botón.
 */
export type ConsumoPuerto =
  | { estado: 'ok'; veredicto: Veredicto; gastadoMes: string }
  | { estado: 'error'; error: string }
  | { estado: 'no_disponible'; porque: string }

/**
 * Todo lo que hace falta para pintar la pantalla de retarificación de auto,
 * calculado en asegura —que es donde está la ficha— y servido por
 * `GET /api/operador/codeoscopic/precalificar`.
 *
 * 🚨 **`faltan: null` no es `faltan: []`.** `[]` significa «revisado y no falta
 * nada», que es lo que enciende el botón de 0,50€; `null` es «no se ha podido
 * precalificar». Colapsarlos con un `?? []` sería exactamente la mentira que
 * prohíbe `CLAUDE.md`. Lo mismo con `municipios` y con `vehiculo`.
 *
 * 🔒 **El código postal del tomador NO viene aquí, y es deliberado.** La
 * cotización no necesita el CP: necesita el *id de municipio del catálogo del
 * vendor*, que no es un dato personal. Asegura resuelve CP → municipios por
 * dentro y publica solo la lista; el CP se queda allí, igual que el DNI, el
 * IBAN y la dirección (`apps/asegura/CLAUDE.md`).
 */
export type Precalificacion = {
  /** `'auto'`, `'hogar'`… Tal cual lo dice la ficha. */
  ramo: string
  /** `false` = asegura no ha precalificado este ramo; `motivo` dice por qué. */
  precalificado: boolean
  motivo: string | null
  /** `null` = no se ha podido leer de la ficha (≠ «la póliza no dice el coche»). */
  vehiculo: VehiculoConocido | null
  /** `null` = no revisado · `[]` = revisado y no falta nada. */
  faltan: Reparo[] | null
  supuestos: Supuesto[]
  fechaMatriculacion: string | null
  notaMatricula: string | null
  /** `null` = no se pudo mirar el catálogo · `[]` = mirado y no hay (ver el motivo). */
  municipios: Opcion[] | null
  municipiosMotivo: string | null
  estadoCivil: Opcion | null
  estadoCivilMotivo: string | null
  consumo: ConsumoPuerto
  /** ¿Tiene el servidor de asegura `CODEOSCOPIC_SIMULACION` puesta?
   *  ⚠️ Es solo el rótulo previo: que un precio CONCRETO sea simulado lo decide
   *  el campo `simulado` de la respuesta de cotizar, nunca esto. */
  simulacion: boolean
}

export type RespuestaPrecalificacion =
  | { estado: 'sin_configurar'; mensaje: string }
  | { estado: 'error'; motivo: MotivoPuerto; mensaje: string }
  | { estado: 'ok'; pre: Precalificacion }

/** Los municipios/estado civil llegan como opciones; una lista ilegible es
 *  `null` («no se ha podido leer»), nunca `[]`. */
function leerOpcionesONulo(v: unknown): Opcion[] | null {
  return v === null || v === undefined ? null : leerOpciones(v)
}

function leerOpcion(v: unknown): Opcion | null {
  if (typeof v !== 'object' || v === null) return null
  const x = v as Record<string, unknown>
  if (typeof x.nombre !== 'string') return null
  if (typeof x.id !== 'string' && typeof x.id !== 'number') return null
  return { id: String(x.id), nombre: x.nombre }
}

function cadenaONulo(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function leerVehiculo(v: unknown): VehiculoConocido | null {
  if (typeof v !== 'object' || v === null) return null
  const x = v as Record<string, unknown>
  const versiones = Array.isArray(x.versiones)
    ? x.versiones.flatMap((e): VersionCandidata[] => {
        if (typeof e !== 'object' || e === null) return []
        const y = e as Record<string, unknown>
        return typeof y.version === 'string'
          ? [{ version: y.version, procedencia: typeof y.procedencia === 'string' ? y.procedencia : '' }]
          : []
      })
    : []
  return {
    marca: cadenaONulo(x.marca),
    modelo: cadenaONulo(x.modelo),
    versiones,
  }
}

/**
 * El libro de consumo tal y como lo devuelve `estadoConsumo()` de asegura
 * (`{ veredicto, gastadoMes, … }` o `{ error }`) → los tres estados de la
 * pantalla. Una respuesta que no se entiende es `no_disponible`, **no** un
 * veredicto permisivo ni un «quedan 0».
 */
export function leerConsumo(v: unknown): ConsumoPuerto {
  if (typeof v !== 'object' || v === null) {
    return { estado: 'no_disponible', porque: 'asegura no ha mandado el libro de consumo.' }
  }
  const x = v as Record<string, unknown>
  if (typeof x.error === 'string') return { estado: 'error', error: x.error }
  const ver = x.veredicto
  if (typeof ver === 'object' && ver !== null && typeof (ver as Record<string, unknown>).permitido === 'boolean') {
    return {
      estado: 'ok',
      veredicto: ver as Veredicto,
      gastadoMes: typeof x.gastadoMes === 'string' ? x.gastadoMes : '—',
    }
  }
  return {
    estado: 'no_disponible',
    porque: 'la respuesta de asegura no traía un veredicto de tope que se pueda leer.',
  }
}

/** PURO: la respuesta HTTP → los tres estados. Sin red, testeable. */
export function interpretarPrecalificacion(status: number, json: unknown): RespuestaPrecalificacion {
  if (status === 401 || status === 403) {
    return { estado: 'error', motivo: 'secreto_rechazado', mensaje: MOTIVOS_PUERTO.secreto_rechazado }
  }
  if (typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
  }
  const r = json as Record<string, unknown>

  if (r.estado === 'sin_configurar') {
    return {
      estado: 'sin_configurar',
      mensaje:
        cadenaONulo(r.mensaje) ??
        'Codeoscopic no está configurado en central-asegura, así que no se puede precalificar la póliza.',
    }
  }
  if (r.estado === 'error') {
    const detalle = describirCausaAsegura(typeof r.causa === 'string' ? r.causa : undefined)
    return {
      estado: 'error',
      motivo: 'asegura_error',
      mensaje:
        [cadenaONulo(r.mensaje), detalle].filter((s): s is string => s !== null && s !== '').join(' — ') ||
        MOTIVOS_PUERTO.asegura_error,
    }
  }
  if (r.estado !== 'ok' || typeof r.ramo !== 'string') {
    return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
  }

  return {
    estado: 'ok',
    pre: {
      ramo: r.ramo,
      precalificado: r.precalificado === true,
      motivo: cadenaONulo(r.motivo),
      vehiculo: leerVehiculo(r.vehiculo),
      // 🚨 `null` sobrevive: `[]` diría «revisado y no falta nada».
      faltan: Array.isArray(r.faltan) ? (r.faltan as Reparo[]) : null,
      supuestos: Array.isArray(r.supuestos) ? (r.supuestos as Supuesto[]) : [],
      fechaMatriculacion: cadenaONulo(r.fechaMatriculacion),
      notaMatricula: cadenaONulo(r.notaMatricula),
      municipios: leerOpcionesONulo(r.municipios),
      municipiosMotivo: cadenaONulo(r.municipiosMotivo),
      estadoCivil: leerOpcion(r.estadoCivil),
      estadoCivilMotivo: cadenaONulo(r.estadoCivilMotivo),
      consumo: leerConsumo(r.consumo),
      // Solo el booleano exacto enciende el rótulo de simulación: ante la duda,
      // esto CUESTA dinero.
      simulacion: r.simulacion === true,
    },
  }
}

/**
 * La precalificación de una póliza. **Gratis**: al otro lado es un `GET` que no
 * pasa por el embudo de pago y corre con el interruptor de tarificación
 * apagado, igual que los catálogos.
 *
 * Margen mayor que el de un catálogo suelto porque encadena tres consultas del
 * vendor (estados civiles, municipios del CP y fecha de matriculación) sobre la
 * lectura de la ficha — pero muy por debajo del de cotizar: aquí no hay ningún
 * cargo que pueda quedar en el aire, así que un corte por reloj es solo un
 * corte por reloj.
 */
export const TIMEOUT_PRECALIFICAR_MS = 25_000

export async function precalificacionAsegura(polizaId: string): Promise<RespuestaPrecalificacion> {
  try {
    const r = await pedir(
      `/api/operador/codeoscopic/precalificar?polizaId=${encodeURIComponent(polizaId)}`,
      { method: 'GET' },
      TIMEOUT_PRECALIFICAR_MS,
    )
    if (r === null) {
      return {
        estado: 'sin_configurar',
        mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).',
      }
    }
    return interpretarPrecalificacion(r.status, r.json)
  } catch (e) {
    // No se degrada a «la ficha no tiene datos»: es «no se ha podido mirar».
    return {
      estado: 'error',
      motivo: 'red',
      mensaje: `${MOTIVOS_PUERTO.red} (${e instanceof Error ? e.message : String(e)})`,
    }
  }
}

// ─── Retarificar (CUESTA 0,50€ REALES) ───────────────────────────────────────

/** Un hueco que impide cotizar. `campo` es la clave del dato en el molde de
 *  asegura; aquí se tipa como `string` a propósito (ver la nota de duplicación
 *  al final de este fichero). */
export type Reparo = { campo: string; motivo: string }

/** Un valor que NO venía en la ficha y se ha dado por bueno para poder cotizar.
 *  Viaja CON el precio porque es su letra pequeña, no una nota de otra pestaña. */
export type Supuesto = {
  campo: string
  /** `null` cuando `oculto` es `true`: el valor existe, pero no sale de asegura. */
  valor: unknown
  porque: string
  /** `true` cuando el supuesto puede ABARATAR el precio respecto de la realidad. */
  optimista?: boolean
  /**
   * 🔒 `true` = el supuesto ES sobre un dato personal del tomador (su código
   * postal, típicamente), así que **el valor se ha quedado en asegura** y aquí
   * llega a `null`. Lo pone `sanearSupuestos()` al otro lado del puerto.
   * No es «no hay valor»: es «lo hay y no cruza». La pantalla lo dice así.
   */
  oculto?: boolean
}

/**
 * Un precio tal y como lo manda el puerto.
 *
 * 🚨 Los nombres son los de `lib/codeoscopic/respuesta.ts` de asegura y NO se
 * cambian por comodidad: la pantalla de asegura los escribió a mano como
 * `primaAnual`, el backend manda `primaEur`, y como todos los campos eran
 * opcionales el desajuste no dio ni un error de tipos — pintó «—» sobre primas
 * que existían (49,60€, 68,80€ y 84,80€ guardadas en
 * `seguros.tarificacion_precios`, medido el 03/09/2026). Un «no lo sé»
 * inventado encima de un dato que sí estaba.
 */
export type Precio = {
  compania?: string | null
  producto?: string | null
  /** Prima total del periodo, en euros. `null` = la compañía no la dio; NO es 0. */
  primaEur?: number | null
  firmeza?: string
  categoria?: string | null
  franquiciaEur?: number | null
  avisos?: string[]
}

export type Fallo = {
  compania?: string | null
  producto?: string | null
  motivo?: string | null
  tambienDioPrecio?: boolean
}

/**
 * Lo que se sabe del dinero después de intentar cotizar.
 *
 * 🚨 `gastoDesconocido` es el campo que impide la mentira barata. Solo es
 * `false` cuando asegura lo ha DECLARADO (`gastado: '0,00€'` en los cortes que
 * ocurren antes del vendor, o un 200 con su coste). En todo lo demás —timeout,
 * red caída, respuesta ilegible, fallo del vendor a media llamada— es `true`,
 * porque el cargo puede existir y nadie lo ha comprobado.
 */
export type RespuestaRetarificar =
  | { estado: 'sin_configurar'; mensaje: string }
  /** 422 · faltan datos. Corta ANTES del vendor: no se ha gastado nada. */
  | { estado: 'faltan'; faltan: Reparo[] }
  /** 402 · el tope diario/mensual. No es un fallo: es el tope haciendo su trabajo. */
  | { estado: 'tope'; mensaje: string }
  /** 409 · el ramo no se retarifica todavía (hoy solo auto y hogar). */
  | { estado: 'ramo'; mensaje: string }
  /** 404 · la póliza no es de esta correduría, o no existe. */
  | { estado: 'no_encontrada'; mensaje: string }
  | { estado: 'error'; motivo: MotivoPuerto; mensaje: string; gastoDesconocido: boolean }
  | {
      estado: 'ok'
      coste: string
      /** `null` = no se ha mirado el libro (simulación). NUNCA «quedan 0». */
      restantesHoy: number | null
      /** 🚨 El precio lo ha inventado central: no lo ha dado ninguna compañía. */
      simulado: boolean
      avisoSimulacion: string | null
      resumen: string
      precios: Precio[]
      fallos: Fallo[]
      supuestos: Supuesto[]
      /** Qué pasó con la COPIA en `seguros.tarificaciones`. El precio ya está
       *  pagado: quien lo pinte tiene que poder decir «no ha quedado copia». */
      guardado: unknown
    }

/**
 * ¿Ha declarado asegura que NO se ha gastado nada?
 *
 * Solo dos señales valen, y las dos son afirmaciones EXPLÍCITAS del otro lado:
 *   - `gastado: '0,00€'`, que ponen `sinGasto()`/`paraPreparado()` de
 *     `apps/asegura/lib/retarificar-cartera.ts` en los cortes anteriores al vendor;
 *   - un 200, donde el coste real viene en `coste`.
 *
 * Todo lo demás es un «no lo sé», y un «no lo sé» sobre dinero se cuenta como
 * gasto posible. La duda SIEMPRE se resuelve hacia «esto puede haber costado».
 */
function gastoDeclaradoCero(status: number, json: unknown): boolean {
  if (status === 200) return false
  if (typeof json !== 'object' || json === null) return false
  const g = (json as Record<string, unknown>).gastado
  return typeof g === 'string' && g.replace(/\s/g, '') === '0,00€'
}

/** PURO: la respuesta HTTP → el estado que la pantalla pinta. Sin red. */
export function interpretarRetarificacion(status: number, json: unknown): RespuestaRetarificar {
  const r = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const cero = gastoDeclaradoCero(status, json)
  const mensajeDe = (porDefecto: string): string => {
    const m = typeof r.mensaje === 'string' ? r.mensaje : typeof r.error === 'string' ? r.error : null
    return m ?? porDefecto
  }

  if (status === 401 || status === 403) {
    // Nunca se llegó a llamar al vendor: asegura corta en la puerta.
    return { estado: 'error', motivo: 'secreto_rechazado', mensaje: MOTIVOS_PUERTO.secreto_rechazado, gastoDesconocido: false }
  }

  if (status === 200) {
    if (typeof json !== 'object' || json === null || r.ok !== true) {
      // 🚨 Un 200 que no se entiende es el caso MÁS caro: el cargo ya se ha
      // hecho al otro lado y aquí no se sabe leer la respuesta.
      return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible, gastoDesconocido: true }
    }
    // 🚨 Simulado se decide con la RESPUESTA, nunca con una prop de la pantalla,
    // y por DOS señales unidas con OR: el booleano del embudo y el `projectId`
    // negativo que la simulación acuña a propósito. El OR solo puede marcar de
    // más, nunca de menos — que es la dirección segura: rotular de real algo
    // simulado se arregla mirando; rotular de simulado un cargo real haría
    // creer que no se ha pagado.
    const projectId = Number(r.projectId)
    const simulado = r.simulado === true || (Number.isFinite(projectId) && projectId < 0)
    return {
      estado: 'ok',
      coste: typeof r.coste === 'string' ? r.coste : String(r.coste ?? '—'),
      restantesHoy: typeof r.restantesHoy === 'number' ? r.restantesHoy : null,
      simulado,
      avisoSimulacion: typeof r.avisoSimulacion === 'string' ? r.avisoSimulacion : null,
      resumen: typeof r.resumen === 'string' ? r.resumen : '',
      precios: Array.isArray(r.precios) ? (r.precios as Precio[]) : [],
      fallos: Array.isArray(r.fallos) ? (r.fallos as Fallo[]) : [],
      supuestos: Array.isArray(r.supuestos) ? (r.supuestos as Supuesto[]) : [],
      guardado: r.guardado ?? null,
    }
  }

  if (status === 422) {
    return { estado: 'faltan', faltan: Array.isArray(r.faltan) ? (r.faltan as Reparo[]) : [] }
  }
  if (status === 402) {
    return { estado: 'tope', mensaje: mensajeDe('Se ha alcanzado el tope de cotizaciones.') }
  }
  if (status === 409) {
    return { estado: 'ramo', mensaje: mensajeDe('Este ramo no se retarifica todavía.') }
  }
  if (status === 404) {
    return { estado: 'no_encontrada', mensaje: mensajeDe('La póliza no existe en la cartera de esta correduría.') }
  }
  if (status === 400 && r.causa === 'sin_confirmar') {
    // El cerrojo del dinero del otro lado. Si sale esto es un bug NUESTRO: la
    // pantalla no mandó `confirmado: true`. Se dice con su nombre y no se
    // disfraza de fallo del vendor.
    return {
      estado: 'error',
      motivo: 'respuesta_ilegible',
      mensaje:
        'asegura ha rechazado la petición por falta de confirmación explícita (`confirmado: true`). ' +
        'No se ha llamado a Codeoscopic. Es un fallo de esta pantalla, no del vendor.',
      gastoDesconocido: false,
    }
  }

  if (r.estado === 'sin_configurar' || (status === 503 && cero)) {
    return {
      estado: 'sin_configurar',
      mensaje: mensajeDe('Codeoscopic no está configurado en central-asegura: no se puede cotizar.'),
    }
  }

  // 502 (vendor) · 503 (resto) · cualquier otro. Aquí es donde la respuesta
  // honesta importa: el vendor puede haber creado el proyecto y facturado.
  const detalle = describirCausaAsegura(typeof r.causa === 'string' ? r.causa : undefined)
  return {
    estado: 'error',
    motivo: 'asegura_error',
    mensaje: [mensajeDe(`error ${status}`), detalle].filter((s): s is string => !!s).join(' — '),
    gastoDesconocido: !cero,
  }
}

/**
 * Lo que se responde cuando la petición NO llegó a completarse (timeout, DNS,
 * TLS, socket cortado).
 *
 * 🚨 **Nunca dice «no se ha gastado».** El vendor puede haber recibido la
 * llamada y haber creado el proyecto: lo único cierto es que aquí no se sabe.
 */
export function porFalloDeRed(e: unknown): RespuestaRetarificar {
  const expirado = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
  const causa = e instanceof Error ? e.message : String(e)
  return {
    estado: 'error',
    motivo: 'red',
    mensaje:
      (expirado
        ? `La cotización no ha respondido en ${Math.round(TIMEOUT_COTIZAR_MS / 1000)} s`
        : `No se ha podido llegar a asegura (${causa})`) +
      ' — NO se sabe si la cotización ha salido ni si se han cobrado los 0,50€. ' +
      'Míralo en el consumo antes de volver a pulsar: repetir crearía otro proyecto y otro cargo.',
    gastoDesconocido: true,
  }
}

// ─── Llamadas ────────────────────────────────────────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function pedir(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${secret}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

/**
 * Un catálogo del vendor (marcas, modelos, motores, versiones, garajes,
 * estados civiles, municipios…). **Gratis**: son `GET` de consulta y al otro
 * lado se resuelven con el interruptor de tarificación APAGADO, porque elegir
 * marca y modelo tiene que poder hacerse antes de que nadie decida pagar.
 */
export async function catalogoAsegura(params: Record<string, string>): Promise<RespuestaCatalogo> {
  const qs = new URLSearchParams(params).toString()
  try {
    const r = await pedir(`/api/operador/codeoscopic/catalogos?${qs}`, { method: 'GET' }, TIMEOUT_CATALOGO_MS)
    if (r === null) {
      return {
        estado: 'sin_configurar',
        mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).',
      }
    }
    return interpretarCatalogo(r.status, r.json)
  } catch (e) {
    // Un catálogo que no se puede leer NO se degrada a lista vacía.
    return {
      estado: 'error',
      motivo: 'red',
      mensaje: `${MOTIVOS_PUERTO.red} (${e instanceof Error ? e.message : String(e)})`,
    }
  }
}

export type PeticionRetarificar = {
  polizaId: string
  /** Quién responde de este cargo. Va al libro de consumo de asegura. */
  solicitadoPor?: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  catastro?: Record<string, unknown> | null
}

/**
 * 🚨 **LA LLAMADA QUE CUESTA 0,50€ REALES.** La única de plataforma que gasta
 * dinero de Alberto en un tercero.
 *
 * `confirmado: true` va SIEMPRE y es el booleano exacto: es el cerrojo que
 * exige el puerto (`apps/asegura/app/api/operador/codeoscopic/retarificar`),
 * y sin él la respuesta es un 400 `sin_confirmar` y el botón no haría nada.
 * Se manda desde aquí —no desde el navegador— porque el navegador no tiene el
 * Bearer y porque así solo hay un sitio donde comprobarlo. Lo vigila
 * `test/regression-retarificar-plataforma.test.ts`.
 *
 * 🚫 **No reintenta.** `POST /insurances` no es idempotente: un reintento
 * automático crearía otro proyecto y otro cargo. Si esto falla por red, la
 * respuesta lo dice y la decisión de repetir es de una persona que antes ha
 * mirado el consumo.
 */
export async function retarificarAsegura(p: PeticionRetarificar): Promise<RespuestaRetarificar> {
  try {
    const r = await pedir(
      '/api/operador/codeoscopic/retarificar',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          polizaId: p.polizaId,
          // 🚨 El booleano exacto. No `'true'`, no `1`: el puerto compara con `===`.
          confirmado: true,
          solicitadoPor: p.solicitadoPor ?? 'plataforma',
          ...(p.resueltos ? { resueltos: p.resueltos } : {}),
          ...(p.correcciones ? { correcciones: p.correcciones } : {}),
          ...(p.catastro ? { catastro: p.catastro } : {}),
        }),
      },
      TIMEOUT_COTIZAR_MS,
    )
    if (r === null) {
      // Sin secreto no se ha llamado a nadie: esto sí se puede afirmar.
      return {
        estado: 'sin_configurar',
        mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET). No se ha llamado a Codeoscopic.',
      }
    }
    return interpretarRetarificacion(r.status, r.json)
  } catch (e) {
    return porFalloDeRed(e)
  }
}

// ─── Nota sobre los tipos duplicados ─────────────────────────────────────────
//
// `Opcion`, `Reparo`, `Supuesto`, `Precio` y `Fallo` existen también en
// `apps/asegura/lib/codeoscopic/*`. **Están duplicados a propósito y no es un
// descuido:** `apps/plataforma` y `apps/asegura` son dos apps separadas con su
// propio `tsconfig`, su propio despliegue y su propia base; se comunican por el
// puerto HTTP y por nada más. Importar de la otra las acoplaría en tiempo de
// compilación y rompería el aislamiento que justifica que sean dos proyectos
// Vercel distintos — además de que el `Typecheck · plataforma` del CI no puede
// resolver `@/lib/...` de asegura.
//
// Lo que SÍ se comparte de verdad vive en `packages/@central/module-seguros`
// (de ahí sale `Retarificabilidad`, que usan las dos). Estos cinco no están ahí
// porque son la forma de la respuesta de UN vendor concreto, y subirlos al
// paquete común metería Codeoscopic dentro del módulo de seguros.
//
// El precio de la duplicación es el desajuste silencioso —justo el que dejó
// `primaAnual` pintando «—» sobre primas reales— y por eso el nombre de cada
// campo se copia del backend LITERALMENTE, con su comentario, y el cepo
// `test/regression-retarificar-plataforma.test.ts` prohíbe que plataforma
// importe de asegura en vez de mantener esta copia.
