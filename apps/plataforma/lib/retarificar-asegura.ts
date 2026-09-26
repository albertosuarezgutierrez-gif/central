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
// `PolizaCliente` y `CompaniaCatalogo` SÍ se importan (no se copian como `Precio`
// y compañía): viven en `@central/module-seguros`, que es el paquete compartido
// de verdad, y son el contrato de `defensaDeCartera()` — que es quien los va a
// consumir. Duplicarlos aquí sería crear una segunda definición del argumento de
// una función que ya se importa de ese mismo sitio.
import type { CompaniaCatalogo, PolizaCliente } from '@central/module-seguros'
import { cabecerasPuerto } from './puerto-actor.ts'

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
/**
 * En qué compañías está YA el cliente — lo que `defensaDeCartera()` de
 * `@central/module-seguros` necesita para marcar en la tabla de precios las
 * filas que no se pueden emitir.
 *
 * 🚨 **DOS estados y ninguno es `[]` vacío por error.** `ok` con `polizas: []`
 * significa «mirado: este cliente no tiene ninguna póliza NUESTRA», y con eso las
 * 24 filas salen `libre` = véndelo. `no_disponible` es «no se ha podido mirar», y
 * se convierte en `desconocida` («sin comprobar»). Plataforma y asegura se
 * despliegan por separado, así que un asegura viejo NO manda el campo: eso
 * también es `no_disponible`, jamás una lista vacía.
 */
export type CarteraCompanias =
  | {
      estado: 'ok'
      polizas: PolizaCliente[]
      catalogo: CompaniaCatalogo[]
      /** La póliza que se está retarificando; su compañía es `actual`, no `ocupada`. */
      polizaActualId: string | null
    }
  | { estado: 'no_disponible'; porque: string }

/**
 * Lo que se le pasa a `EntradaDefensa.polizas`: la lista **o `null`**.
 *
 * Existe para que quien consuma esto no tenga que acordarse de la regla. El
 * error que evita es de una sola letra: `c.estado === 'ok' ? c.polizas : []`
 * compila igual y convierte «no se ha podido mirar» en «no tiene ninguna».
 */
export function polizasParaDefensa(c: CarteraCompanias | null | undefined): PolizaCliente[] | null {
  return c != null && c.estado === 'ok' ? c.polizas : null
}

/** El catálogo, o `[]`. Aquí sí vale el vacío: sin catálogo el módulo cae al
 *  nombre y lo DECLARA (`coincidencia: 'nombre'`), no afirma que esté libre. */
export function catalogoParaDefensa(c: CarteraCompanias | null | undefined): CompaniaCatalogo[] {
  return c != null && c.estado === 'ok' ? c.catalogo : []
}

const SIN_CARTERA_COMPANIAS =
  'el puerto de asegura no ha mandado la cartera del cliente, así que NO consta que estas compañías ' +
  'estén libres — solo que no se han podido mirar. (Si acaba de desplegarse plataforma y asegura no, ' +
  'es que esta versión de asegura todavía no manda el campo.)'

/**
 * PURO: el bloque `carteraCompanias` del puerto → los dos estados.
 *
 * Cada póliza se valida fila a fila: una fila que no se entiende **no se
 * descarta en silencio** (eso restaría una compañía ocupada de la lista y la
 * dejaría `libre`) — la respuesta entera pasa a `no_disponible`.
 */
export function leerCarteraCompanias(v: unknown): CarteraCompanias {
  if (typeof v !== 'object' || v === null) {
    return { estado: 'no_disponible', porque: SIN_CARTERA_COMPANIAS }
  }
  const x = v as Record<string, unknown>
  if (x.estado === 'no_disponible') {
    return {
      estado: 'no_disponible',
      porque: cadenaONulo(x.porque) ?? 'asegura no ha podido leer la cartera de este cliente.',
    }
  }
  if (x.estado !== 'ok' || !Array.isArray(x.polizas) || !Array.isArray(x.catalogo)) {
    return { estado: 'no_disponible', porque: SIN_CARTERA_COMPANIAS }
  }

  const polizas: PolizaCliente[] = []
  for (const raw of x.polizas) {
    const p = leerPolizaCliente(raw)
    if (p === null) {
      return {
        estado: 'no_disponible',
        porque:
          'una de las pólizas del cliente ha llegado ilegible, así que la lista está incompleta y no se ' +
          'puede afirmar que ninguna compañía esté libre.',
      }
    }
    polizas.push(p)
  }

  const catalogo: CompaniaCatalogo[] = []
  for (const raw of x.catalogo) {
    const c = leerCompaniaCatalogo(raw)
    // Una fila del catálogo ilegible sí se salta: el catálogo solo AÑADE
    // capacidad de resolver nombres; sin una entrada el módulo cae al nombre
    // normalizado y lo declara, nunca afirma que la compañía esté libre.
    if (c !== null) catalogo.push(c)
  }

  return { estado: 'ok', polizas, catalogo, polizaActualId: cadenaONulo(x.polizaActualId) }
}

function leerPolizaCliente(v: unknown): PolizaCliente | null {
  if (typeof v !== 'object' || v === null) return null
  const x = v as Record<string, unknown>
  // `viva` tiene que venir como booleano: sin él no se puede saber si esa póliza
  // defiende, y suponer `true` bloquearía de más o `false` de menos.
  if (typeof x.viva !== 'boolean') return null
  return {
    id: cadenaONulo(x.id),
    codigoEntidadDgs: cadenaONulo(x.codigoEntidadDgs),
    aseguradora: cadenaONulo(x.aseguradora),
    estado: cadenaONulo(x.estado),
    viva: x.viva,
    ramo: cadenaONulo(x.ramo),
    numeroPoliza: cadenaONulo(x.numeroPoliza),
  }
}

function leerCompaniaCatalogo(v: unknown): CompaniaCatalogo | null {
  if (typeof v !== 'object' || v === null) return null
  const x = v as Record<string, unknown>
  const codigoDgs = cadenaONulo(x.codigoDgs)
  const nombreComun = cadenaONulo(x.nombreComun)
  if (codigoDgs === null || nombreComun === null) return null
  // `nombreCima: null` es «no se ha visto ninguna póliza de CIMA de esa
  // compañía» (hoy, Generali y Reale), no «no tiene nombre»: se propaga.
  return { codigoDgs, nombreComun, nombreCima: cadenaONulo(x.nombreCima) }
}

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
  /**
   * Catálogo `/road-types` del vendor (12/09/2026). El Submit exige
   * `roadType.id` y no se puede añadir al proyecto después, así que se elige
   * ANTES de pagar. `null` = no se pudo leer el catálogo.
   */
  tiposVia: Opcion[] | null
  /** El tipo de vía emparejado desde la dirección de la ficha; `null` = elígelo a mano. */
  tipoVia: Opcion | null
  tipoViaMotivo: string | null
  consumo: ConsumoPuerto
  /**
   * En qué compañías está YA el cliente (defensa de cartera). Nunca falta y
   * nunca es `[]` por error: ver `CarteraCompanias`. Se consume con
   * `polizasParaDefensa()`/`catalogoParaDefensa()`, no leyendo `.polizas` a mano.
   */
  carteraCompanias: CarteraCompanias
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
      tiposVia: leerOpcionesONulo(r.tiposVia),
      tipoVia: leerOpcion(r.tipoVia),
      tipoViaMotivo: cadenaONulo(r.tipoViaMotivo),
      consumo: leerConsumo(r.consumo),
      // 🚨 `r.carteraCompanias` ausente (asegura sin desplegar todavía) cae en
      // `no_disponible`, NUNCA en una lista vacía: `[]` diría «este cliente no
      // está en ninguna compañía» y encendería las 24 filas como emitibles.
      carteraCompanias: leerCarteraCompanias(r.carteraCompanias),
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
  /**
   * 🔑 **El identificador del precio que da el vendor** (`"Q7601460"`, el
   * `mainQuote.id` de Codeoscopic), y la única clave ESTABLE que tiene una fila
   * de la tabla.
   *
   * Existe porque hasta el 21/09/2026 la tabla identificaba cada fila con
   * `` `${p.compania}-${p.producto}-${i}` `` —etiqueta + POSICIÓN en el array—, y
   * eso solo funciona mientras nadie reordene nada. En cuanto entran agrupación
   * por nivel de cobertura y filtros, el índice `i` apunta a otra fila: se pulsa
   * «Emitir» sobre un precio y el panel se abre sobre OTRO, sin que nada falle.
   * Es el mismo error que `CLAUDE.md` llama «agrupar por la etiqueta, no por la
   * identidad», aquí sobre una compra de verdad. `FilaPrecio.indice` de
   * `comparativa-precios.ts` sigue existiendo para conservar el orden original;
   * para SEÑALAR una fila se usa esto.
   *
   * 🚨 NO es `productId` (`product.id`, el producto del catálogo del vendor, que
   * en el fixture real es el número `10`). Son dos cosas distintas y confundirlas
   * ya costó un 400 real del ReRate (11/09/2026, proyecto 40681298).
   *
   * `undefined` = no se sabe: una cotización RECUPERADA de
   * `seguros.tarificacion_precios` todavía no lo trae (la tabla no tiene columna
   * para él). Nunca se rellena con la posición ni con un contador.
   */
  id?: string
  compania?: string | null
  producto?: string | null
  /** Prima total del periodo, en euros. `null` = la compañía no la dio; NO es 0. */
  primaEur?: number | null
  /**
   * Primer pago, en euros. Puede diferir de la prima cuando se fracciona.
   * `null` = el producto no lo declara; NO es «no hay entrada» ni 0.
   */
  entradaEur?: number | null
  /** Duración del periodo en meses (`termMonths`). `null` = no lo declara. */
  meses?: number | null
  /** Forma de pago (`paymentMethod.name`): domiciliación, tarjeta… `null` = no lo dice. */
  formaPago?: string | null
  /** Periodicidad (`paymentFrequency`): anual, semestral… `null` = no lo dice. */
  frecuenciaPago?: string | null
  firmeza?: string
  categoria?: string | null
  franquiciaEur?: number | null
  /** `expirationDate` de la cotización: hasta cuándo se puede emitir. `null`/ausente
   *  = el vendor no la ha dicho (suele venir solo tras confirmar el precio). */
  expiraEn?: string | null
  /** Opciones del producto ya legibles (`formattedOptions` del vendor). `null`/ausente =
   *  no las mandó (o cotización recuperada, que no las guarda); `[]` = ninguna. */
  opciones?: { etiqueta: string; valor: string }[] | null
  /** Oferta inicial que contiene este precio: con ella se leen sus coberturas gratis.
   *  `null`/ausente = ninguna oferta lo contiene, o cotización recuperada de BD. */
  ofertaId?: string | null
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
/** El proyecto que asegura manda reutilizar en vez de dejar pagar otro. */
export type ProyectoVigente = {
  projectId: string
  compania: string | null
  primaEur: number | null
  caducaEn: string | null
}

export type RespuestaRetarificar =
  | { estado: 'sin_configurar'; mensaje: string }
  /** 422 · faltan datos. Corta ANTES del vendor: no se ha gastado nada. */
  | { estado: 'faltan'; faltan: Reparo[] }
  /** 402 · el tope diario/mensual. No es un fallo: es el tope haciendo su trabajo. */
  | { estado: 'tope'; mensaje: string }
  /** 409 · el ramo no se retarifica todavía (hoy solo auto, moto y hogar). */
  | { estado: 'ramo'; mensaje: string }
  /**
   * 409 · ya hay un proyecto de Codeoscopic con oferta confirmada y sin caducar
   * para esta póliza (guardián de reutilización de asegura, PR #2790). NO es un
   * fallo: es el precio que ya está pagado, y se confirma con «Emitir», no
   * pidiendo otro. Solo `forzarNuevo: true` (el corredor ha DESCARTADO ese
   * precio a propósito) pasa por encima.
   */
  | { estado: 'proyecto_vigente'; mensaje: string; proyecto: ProyectoVigente }
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
      /** Proyecto del vendor (para leer coberturas por oferta). `null` = no vino. */
      projectId: string | null
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
      projectId: typeof r.projectId === 'string' || typeof r.projectId === 'number' ? String(r.projectId) : null,
    }
  }

  if (status === 422) {
    return { estado: 'faltan', faltan: Array.isArray(r.faltan) ? (r.faltan as Reparo[]) : [] }
  }
  if (status === 402) {
    return { estado: 'tope', mensaje: mensajeDe('Se ha alcanzado el tope de cotizaciones.') }
  }
  if (status === 409) {
    // Dos 409 distintos con el mismo código: el ramo que no se retarifica y el
    // proyecto vigente que hay que reutilizar. Los separa `proyectoExistente`,
    // que solo pone el guardián de reutilización.
    const pe = r.proyectoExistente
    if (typeof pe === 'object' && pe !== null && typeof (pe as Record<string, unknown>).projectId === 'string') {
      const x = pe as Record<string, unknown>
      return {
        estado: 'proyecto_vigente',
        mensaje: mensajeDe('Ya hay un precio vigente para esta póliza: no se pide otro.'),
        proyecto: {
          projectId: x.projectId as string,
          compania: typeof x.compania === 'string' ? x.compania : null,
          primaEur: typeof x.primaEur === 'number' ? x.primaEur : null,
          caducaEn: typeof x.caducaEn === 'string' ? x.caducaEn : null,
        },
      }
    }
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
    headers: { ...(init.headers ?? {}), ...(await cabecerasPuerto(secret)) },
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

/**
 * El MISMO catálogo, pero sin recortar: lo que el vendor manda de verdad.
 *
 * Tipos soportados (lista cerrada en asegura): `versiones`, `versiones-moto` y
 * `carnets-moto` (límites cc/kW del cruce carné × moto). El de `versiones` nació de una pregunta concreta:
 * si cada versión trae sus años de fabricación, la fecha de matriculación
 * (que sale gratis de la matrícula) podría ordenar o acotar el desplegable.
 * Hoy no se sabe, porque asegura se queda con `id` y `nombre` y tira el resto.
 *
 * **Gratis** (`GET` de catálogo, interruptor apagado). Devuelve el status y el
 * json del puerto TAL CUAL: es una medición, y reinterpretarla aquí sería
 * añadir una capa entre el dato y quien lo mira.
 */
export async function catalogoCrudoAsegura(
  params: Record<string, string>,
): Promise<{ status: number; json: unknown }> {
  const qs = new URLSearchParams({ ...params, crudo: '1' }).toString()
  try {
    const r = await pedir(`/api/operador/codeoscopic/catalogos?${qs}`, { method: 'GET' }, TIMEOUT_CATALOGO_MS)
    if (r === null) {
      return {
        status: 503,
        json: {
          estado: 'sin_configurar',
          mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).',
        },
      }
    }
    return r
  } catch (e) {
    // Un fallo de red NO se devuelve como un crudo vacío: eso se leería como
    // «el vendor no manda nada más», que es justo lo que se está midiendo.
    return {
      status: 502,
      json: {
        estado: 'error',
        motivo: 'red',
        mensaje: `${MOTIVOS_PUERTO.red} (${e instanceof Error ? e.message : String(e)})`,
      },
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
  /** Referencia catastral de 20 del piso: el riesgo lo consulta asegura, no lo pone plataforma. */
  referencia?: string
  /**
   * Pasa por encima del guardián de reutilización de asegura (409
   * `proyecto_vigente`). Solo `true` cuando el corredor ha DESCARTADO a
   * propósito el precio recuperado («Descartar y pedir precio de cero»): sin
   * ese gesto, pedir precio con un proyecto vigente se rechaza sin cobrar.
   */
  forzarNuevo?: boolean
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
          ...(p.referencia ? { referencia: p.referencia } : {}),
          // Solo viaja cuando es el booleano `true`: el puerto compara con `===`.
          ...(p.forzarNuevo === true ? { forzarNuevo: true } : {}),
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

// ─── Confirmar el precio con la compañía (ReRate) ────────────────────────────
//
// 🚨 Construido el 11/09/2026, SIN sandbox y sin fixture del fabricante para
// esta operación (a diferencia de retarificar, que sí tiene fixture real):
// `docs/CODEOSCOPIC-API-PORTAL.md` solo la describe en prosa. El coste NO está
// documentado (a diferencia de `POST /insurances`, que sí lo está en tres
// sitios): se trata igual de conservador que un gasto, con confirmación
// explícita y sin reintento automático.

export type RespuestaOferta =
  | { estado: 'sin_configurar'; mensaje: string }
  | { estado: 'error'; motivo: MotivoPuerto; mensaje: string }
  /**
   * 422 · la compañía pide datos que el proyecto no tiene y la ficha tampoco.
   * `faltan` son NUESTROS campos (ya traducidos por asegura), `sugeridos` lo
   * que asegura ha podido sacar de la ficha para prerrellenar, y
   * `noReconocidos` las líneas del vendor que asegura no supo mapear — se
   * enseñan enteras, porque son un hallazgo. No se ha gastado nada.
   */
  | {
      estado: 'faltan_vendor'
      faltan: Reparo[]
      sugeridos: Record<string, string>
      noReconocidos: string[]
      mensaje: string
    }
  /** 409 · el PATCH al proyecto «tuvo éxito» pero al releerlo el dato no está. Toca cotizar de cero. */
  | { estado: 'patch_no_aplicado'; mensaje: string }
  /**
   * 422 · el ReRate pide un campo de `product.options` (el formulario de la
   * compañía: vehículo/producto, no la persona) que el proyecto no trae.
   * DISTINTO de `faltan_vendor`: ahí se teclea un valor suelto; aquí se
   * ofrece el Product Form Library del vendor (`ProductFormWidget`) montado
   * sobre `quoteCrudo` — no hay una lista cerrada de campos ni se inventa su
   * id, es el formulario real de la compañía. `campos` es solo para mostrar
   * QUÉ pide (nombres tal cual los usa la compañía), no para rellenarlos.
   */
  | { estado: 'faltan_producto'; campos: string[]; quoteCrudo: unknown; mensaje: string }
  | {
      estado: 'ok'
      projectId: string
      offerId: string
      primaEur: number | null
      firmeza: string
      caducaEn: string | null
      avisos: string[]
      /** La cuenta de cargo que asegura YA conoce del cliente (enmascarada, con
       *  su origen), para enseñarla ANTES del Submit. `null` = no hay ninguna
       *  legible; `cuentaAviso` dice por qué (clave PII, CCC inválido, consulta caída). */
      cuenta: CuentaConocida | null
      cuentaAviso: AvisoCuenta | null
      /**
       * El `mainQuote` (o el objeto pelado) TAL CUAL lo devolvió Codeoscopic al
       * ReRate — sin parsear, sin reshaping. Lo necesita el widget de la
       * Product Form Library (`productForm.render(quote)`) para pintar el
       * formulario de consentimiento REAL de la compañía antes del Submit. Ver
       * `apps/asegura/lib/codeoscopic/emitir.ts::Oferta.quoteCrudo`.
       */
      quoteCrudo: unknown
    }

/** Por qué no hay cuenta utilizable, cuando asegura lo sabe. `no_comprobada`
 *  = la consulta falló: NO es «no tiene». */
export type AvisoCuenta = 'ilegible' | 'invalida' | 'no_comprobada'

export function leerAvisoCuenta(v: unknown): AvisoCuenta | null {
  if (typeof v !== 'object' || v === null) return null
  const a = (v as Record<string, unknown>).aviso
  return a === 'ilegible' || a === 'invalida' || a === 'no_comprobada' ? a : null
}

/** La cuenta de cargo tal como cruza el puerto: SIEMPRE enmascarada (`ES91…1332`),
 *  con su origen y la frase que lo explica. El IBAN entero no sale de asegura. */
export type CuentaConocida = { enmascarada: string; origen: string; descripcion: string | null }

function leerCuenta(v: unknown): CuentaConocida | null {
  if (typeof v !== 'object' || v === null) return null
  const x = v as Record<string, unknown>
  if (typeof x.enmascarada !== 'string' || x.enmascarada === '') return null
  return {
    enmascarada: x.enmascarada,
    origen: typeof x.origen === 'string' ? x.origen : 'ficha',
    descripcion: typeof x.descripcion === 'string' && x.descripcion !== '' ? x.descripcion : null,
  }
}

/** El ReRate re-tarifica con la compañía: asegura le da 150 s (fila 5). 170 cabe en el
 *  `maxDuration` de 180 de la página que lo invoca y deja que corte antes asegura. */
export const TIMEOUT_OFERTA_MS = 170_000

function leerOferta(
  v: unknown,
): { offerId: string; primaEur: number | null; firmeza: string; caducaEn: string | null; avisos: string[]; quoteCrudo: unknown } | null {
  if (typeof v !== 'object' || v === null) return null
  const x = v as Record<string, unknown>
  if (typeof x.offerId !== 'string') return null
  return {
    offerId: x.offerId,
    primaEur: typeof x.primaEur === 'number' ? x.primaEur : null,
    firmeza: typeof x.firmeza === 'string' ? x.firmeza : 'estimado',
    caducaEn: cadenaONulo(x.caducaEn),
    avisos: Array.isArray(x.avisos) ? x.avisos.filter((a): a is string => typeof a === 'string') : [],
    // `unknown` a propósito: es el `mainQuote` del vendor, tal cual — reshapearlo
    // aquí sería adivinar su forma. `null`/`undefined` del transporte se
    // normalizan a `null` para que el widget sepa distinguir «sin oferta» de
    // «vacío pero presente».
    quoteCrudo: x.quoteCrudo ?? null,
  }
}

/** PURO: la respuesta HTTP → los estados de la pantalla. Sin red, testeable. */
export function interpretarOferta(status: number, json: unknown): RespuestaOferta {
  const r = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (status === 401 || status === 403) {
    return { estado: 'error', motivo: 'secreto_rechazado', mensaje: MOTIVOS_PUERTO.secreto_rechazado }
  }
  if (status === 200 && r.estado === 'ok') {
    const oferta = leerOferta(r.oferta)
    if (!oferta || typeof r.projectId !== 'string') {
      return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
    }
    return {
      estado: 'ok',
      projectId: r.projectId,
      ...oferta,
      cuenta: leerCuenta(r.cuenta),
      cuentaAviso: leerAvisoCuenta(r.cuenta),
    }
  }
  if (r.estado === 'sin_configurar' || (status === 503 && r.causa === 'apagado')) {
    return {
      estado: 'sin_configurar',
      mensaje: cadenaONulo(r.mensaje) ?? 'La emisión real está apagada en central-asegura (CODEOSCOPIC_EMISION_ACTIVA).',
    }
  }
  if (status === 422 && r.estado === 'faltan_vendor') {
    const sugeridos: Record<string, string> = {}
    if (typeof r.sugeridos === 'object' && r.sugeridos !== null) {
      for (const [k, v] of Object.entries(r.sugeridos as Record<string, unknown>)) {
        if (typeof v === 'string') sugeridos[k] = v
      }
    }
    const faltan: Reparo[] = Array.isArray(r.faltan)
      ? r.faltan.flatMap((f): Reparo[] => {
          const x = (typeof f === 'object' && f !== null ? f : {}) as Record<string, unknown>
          return typeof x.campo === 'string' ? [{ campo: x.campo, motivo: cadenaONulo(x.motivo) ?? '' }] : []
        })
      : []
    return {
      estado: 'faltan_vendor',
      faltan,
      sugeridos,
      noReconocidos: Array.isArray(r.noReconocidos)
        ? r.noReconocidos.filter((s): s is string => typeof s === 'string')
        : [],
      mensaje: cadenaONulo(r.mensaje) ?? 'La compañía pide datos que faltan en el proyecto.',
    }
  }
  if (status === 422 && r.estado === 'faltan_producto') {
    return {
      estado: 'faltan_producto',
      campos: Array.isArray(r.campos) ? r.campos.filter((c): c is string => typeof c === 'string') : [],
      quoteCrudo: 'quoteCrudo' in r ? r.quoteCrudo ?? null : null,
      mensaje: cadenaONulo(r.mensaje) ?? 'La compañía pide un dato del formulario que el proyecto no tiene.',
    }
  }
  if (status === 409 && r.causa === 'patch_no_aplicado') {
    return {
      estado: 'patch_no_aplicado',
      mensaje:
        cadenaONulo(r.mensaje) ??
        'El proyecto de Codeoscopic no ha aceptado el dato: hay que pedir precio de cero (0,50€).',
    }
  }
  const detalle = describirCausaAsegura(typeof r.causa === 'string' ? r.causa : undefined)
  return {
    estado: 'error',
    motivo: status === 502 ? 'asegura_error' : 'asegura_error',
    mensaje: [cadenaONulo(r.mensaje), detalle].filter((s): s is string => !!s).join(' — ') || `error ${status}`,
  }
}

/**
 * `POST /api/operador/codeoscopic/oferta` — confirma con la compañía el
 * precio de `tarificacionId` (id de `seguros.tarificaciones`) para la
 * `compania`/`categoria` elegidas en pantalla. NO reintenta.
 */
export async function ofertaAsegura(p: {
  tarificacionId: string
  compania: string
  categoria: string
  /** Producto y prima de la fila pulsada: desempatan cuando la compañía da varios
   *  precios del mismo nivel (`encontrarPrecio` de asegura, 25/09/2026). */
  producto?: string
  primaEur?: number
  /** Fecha de efecto NUEVA (aaaa-mm-dd). Desde el 25/09/2026 viaja en el propio
   *  ReRate (`mainQuote.effectiveDate`, la vía documentada por el vendor). */
  fechaEfectoCorregida?: string
  /** Lo que el corredor teclea tras un `faltan_vendor` (campo nuestro → valor).
   *  Asegura lo escribe en el proyecto (PATCH, gratis) y vuelve a pedir el ReRate. */
  correcciones?: Record<string, string>
  /** Lo que el corredor ha guardado del Product Form Library del vendor tras
   *  un `faltan_producto` anterior (`ProductFormWidget::getProductOptions()`,
   *  reenviado TAL CUAL — ver `apps/asegura/.../oferta/route.ts`). */
  productOptions?: unknown[]
}): Promise<RespuestaOferta> {
  try {
    const r = await pedir(
      '/api/operador/codeoscopic/oferta',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...p, confirmado: true }),
      },
      TIMEOUT_OFERTA_MS,
    )
    if (r === null) {
      return {
        estado: 'sin_configurar',
        mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).',
      }
    }
    return interpretarOferta(r.status, r.json)
  } catch (e) {
    return {
      estado: 'error',
      motivo: 'red',
      mensaje: `${MOTIVOS_PUERTO.red} (${e instanceof Error ? e.message : String(e)}). ` +
        'No se sabe si la compañía ha confirmado el precio: mira el consumo antes de repetir.',
    }
  }
}

// ─── Product Form Library: el `dataCallback` del widget del vendor ──────────
//
// El widget (`AvantProductForm`, iframe de Codeoscopic) NO puede guardar el
// `access_token` OAuth2 en el navegador — reenvía sus propias sub-peticiones
// (catálogos, sub-formularios) a un `dataCallback` que nosotros implementamos.
// Aquí se relaya ESE `dataCallback` hasta `apps/asegura` (que tiene las
// credenciales de servidor), exactamente con el mismo patrón —y las mismas
// razones— que el resto de este fichero: el Bearer no baja al navegador.
//
// 🚨 Gratis (ver `lib/codeoscopic/product-form.ts` en asegura): no confirma
// nada con la compañía ni cotiza, así que no lleva `confirmado: true`.

export const TIMEOUT_PRODUCT_FORM_MS = 20_000

export type RespuestaProductForm =
  | { estado: 'sin_configurar'; mensaje: string }
  | { estado: 'error'; mensaje: string }
  /** La respuesta de Codeoscopic, tal cual — el widget interpreta su propia forma. */
  | { estado: 'ok'; respuesta: unknown }

/** PURO: la respuesta HTTP → los estados del `dataCallback`. Sin red, testeable. */
export function interpretarProductForm(status: number, json: unknown): RespuestaProductForm {
  const r = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (status === 200 && r.estado === 'ok') return { estado: 'ok', respuesta: r.respuesta ?? null }
  if (r.estado === 'sin_configurar' || status === 503) {
    return { estado: 'sin_configurar', mensaje: cadenaONulo(r.mensaje) ?? 'El puerto de Codeoscopic con asegura no está configurado.' }
  }
  return { estado: 'error', mensaje: cadenaONulo(r.mensaje) ?? `error ${status}` }
}

/**
 * `POST /api/operador/codeoscopic/product-form` — relay del `dataCallback`
 * del widget hacia el proxy gratis de asegura. `peticion` es la petición TAL
 * CUAL la pide el widget (`{method?, path, params?, body?}`): no se reshapea,
 * el vendor decide su propia forma dentro de `/product-form-requests`.
 */
export async function productFormAsegura(peticion: {
  method?: string
  path: string
  params?: unknown[]
  body?: Record<string, unknown>
}): Promise<RespuestaProductForm> {
  try {
    const r = await pedir(
      '/api/operador/codeoscopic/product-form',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(peticion),
      },
      TIMEOUT_PRODUCT_FORM_MS,
    )
    if (r === null) {
      return {
        estado: 'sin_configurar',
        mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).',
      }
    }
    return interpretarProductForm(r.status, r.json)
  } catch (e) {
    return { estado: 'error', mensaje: `${MOTIVOS_PUERTO.red} (${e instanceof Error ? e.message : String(e)})` }
  }
}

// ─── Emitir de verdad (Submit) ────────────────────────────────────────────────

export type RespuestaEmitir =
  | { estado: 'sin_configurar'; mensaje: string }
  /** 422 · la compañía pide datos antes de emitir. `faltan` lleva `'iban'` cuando
   *  exige cuenta bancaria (12/09/2026). `cuenta` es la que asegura YA conoce del
   *  cliente (enmascarada) y `confirmar` que no viajó porque nadie la confirmó:
   *  se confirma o se teclea otra — nunca se manda sola. */
  | {
      estado: 'faltan_campos'
      faltan: string[]
      campos: unknown
      mensaje: string | null
      cuenta: CuentaConocida | null
      cuentaAviso: AvisoCuenta | null
      confirmar: boolean
    }
  | { estado: 'en_vuelo'; mensaje: string }
  /** 409 · asegura no reenvía a ciegas (13/09/2026): o el proyecto YA cuenta una
   *  solicitud de emisión (`rastro` no vacío) o el último Submit acabó en 5xx /
   *  corte de red («quizá emitido», `ultimoError`). `crudo` es el proyecto tal
   *  cual lo devuelve el vendor (gratis) para mirarlo; `null` si no se pudo leer
   *  — que NO es «no hay póliza». */
  | {
      estado: 'reintento_sin_confirmar'
      mensaje: string
      ultimoError: string | null
      /** Lo que el portal de Codeoscopic manda hacer con ese código (500 → reportar
       *  a soporte; 502/503/504 → reintentar en unos minutos). `null` si no aplica. */
      consejo: string | null
      /** `policyApplications[]` del proyecto, la forma que documenta el portal:
       *  una `aprobada` con `numeroPoliza` es una póliza que YA existe en la
       *  compañía — se acuña (`acunarExistente`), no se reenvía. */
      solicitudes: SolicitudEmisionVista[]
      rastro: unknown[]
      proyectoLegible: boolean
      crudo: unknown
    }
  /** `quizaEmitido`: el Submit acabó en 5xx — Codeoscopic dejó de esperar a la
   *  compañía y NO se sabe si emitió. No es un rechazo. */
  | {
      estado: 'error'; motivo: MotivoPuerto; mensaje: string; crudo: unknown; quizaEmitido?: boolean; consejo?: string
      /** Lo que contestó asegura, para decidir si el fallo es un rechazo limpio o una duda.
       *  `quizaDeclarado` es el `quizaEmitido` de asegura tal cual (true/false), `null` si no lo mandó. */
      status?: number; causa?: string | null; quizaDeclarado?: boolean | null
    }
  | { estado: 'ok'; referenciaVendor: string | null; acunado: unknown; cuenta: CuentaConocida | null }
  | { estado: 'emitido_sin_acunar'; mensaje: string; referenciaVendor?: string | null }

export type SolicitudEmisionVista = {
  id: string | null
  creadaEn: string | null
  estadoId: string | null
  estadoNombre: string | null
  numeroPoliza: string | null
  veredicto: 'aprobada' | 'rechazada' | 'pendiente' | 'desconocido'
}

/** PURO. Una entrada que no tenga forma de solicitud se descarta; un veredicto
 *  que no se reconoce cae a `desconocido`, nunca a `aprobada`. */
export function leerSolicitudes(v: unknown): SolicitudEmisionVista[] {
  if (!Array.isArray(v)) return []
  const out: SolicitudEmisionVista[] = []
  for (const x of v) {
    if (typeof x !== 'object' || x === null) continue
    const o = x as Record<string, unknown>
    const veredicto = o.veredicto
    out.push({
      id: cadenaONulo(o.id),
      creadaEn: cadenaONulo(o.creadaEn),
      estadoId: cadenaONulo(o.estadoId),
      estadoNombre: cadenaONulo(o.estadoNombre),
      numeroPoliza: cadenaONulo(o.numeroPoliza),
      veredicto:
        veredicto === 'aprobada' || veredicto === 'rechazada' || veredicto === 'pendiente' ? veredicto : 'desconocido',
    })
  }
  return out
}

/** El Submit: asegura le da 150 s (fila 5). Si corta este reloj, el resultado se
 *  presenta como «puede haberse emitido», nunca como «no se ha emitido». */
export const TIMEOUT_EMITIR_MS = 170_000

/** PURO: la respuesta HTTP → los estados de la pantalla. Sin red, testeable. */
export function interpretarEmitir(status: number, json: unknown): RespuestaEmitir {
  const r = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (status === 401 || status === 403) {
    return { estado: 'error', motivo: 'secreto_rechazado', mensaje: MOTIVOS_PUERTO.secreto_rechazado, crudo: null }
  }
  if (status === 422 && r.causa === 'faltan_campos') {
    return {
      estado: 'faltan_campos',
      faltan: Array.isArray(r.faltan) ? r.faltan.filter((f): f is string => typeof f === 'string') : [],
      campos: r.campos ?? null,
      mensaje: cadenaONulo(r.mensaje),
      cuenta: leerCuenta(r.cuenta),
      cuentaAviso: leerAvisoCuenta(r.cuenta),
      confirmar: r.confirmar === true,
    }
  }
  if (status === 409 && r.causa === 'en-vuelo') {
    return { estado: 'en_vuelo', mensaje: cadenaONulo(r.mensaje) ?? 'Ya hay un envío de este proyecto en curso.' }
  }
  if (status === 409 && r.causa === 'reintento_sin_confirmar') {
    return {
      estado: 'reintento_sin_confirmar',
      mensaje:
        cadenaONulo(r.mensaje) ??
        'El último envío acabó sin respuesta clara del vendor: comprueba el proyecto antes de reintentar.',
      ultimoError: cadenaONulo(r.ultimoError),
      consejo: cadenaONulo(r.consejo),
      solicitudes: leerSolicitudes(r.solicitudes),
      rastro: Array.isArray(r.rastro) ? r.rastro : [],
      proyectoLegible: r.proyectoLegible === true,
      crudo: r.crudo ?? null,
    }
  }
  if (status === 200) {
    if (r.estado === 'emitido_sin_acunar') {
      return {
        estado: 'emitido_sin_acunar',
        mensaje: cadenaONulo(r.mensaje) ?? 'Codeoscopic aceptó la emisión pero no se pudo acuñar sola.',
        referenciaVendor: cadenaONulo(r.referenciaVendor),
      }
    }
    if (r.estado === 'ok') {
      return { estado: 'ok', referenciaVendor: cadenaONulo(r.referenciaVendor), acunado: r.acunado ?? null, cuenta: leerCuenta(r.cuenta) }
    }
    return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible, crudo: r }
  }
  if (r.estado === 'sin_configurar' || (status === 503 && r.causa === 'apagado')) {
    return {
      estado: 'sin_configurar',
      mensaje: cadenaONulo(r.mensaje) ?? 'La emisión real está apagada en central-asegura (CODEOSCOPIC_EMISION_ACTIVA).',
    }
  }
  const detalle = describirCausaAsegura(typeof r.causa === 'string' ? r.causa : undefined)
  return {
    estado: 'error',
    motivo: 'asegura_error',
    mensaje: [cadenaONulo(r.mensaje), detalle].filter((s): s is string => !!s).join(' — ') || `error ${status}`,
    crudo: r.crudo ?? null,
    ...(r.quizaEmitido === true ? { quizaEmitido: true } : {}),
    ...(cadenaONulo(r.consejo) ? { consejo: cadenaONulo(r.consejo)! } : {}),
    status,
    causa: typeof r.causa === 'string' ? r.causa : null,
    quizaDeclarado: typeof r.quizaEmitido === 'boolean' ? r.quizaEmitido : null,
  }
}

/**
 * `POST /api/operador/codeoscopic/emitir` — **el Submit real**. Exige que
 * `projectId` tenga ya una oferta confirmada (`ofertaAsegura()`). NO
 * reintenta: un fallo de red aquí no dice que no se haya emitido, exactamente
 * igual que retarificar.
 */
export async function emitirAsegura(p: {
  projectId: string
  campos: Record<string, unknown>
  actor?: string
  primaAnual?: number | null
  /** La máscara (`ES91…1332`) de la cuenta de la ficha que el corredor ha visto y
   *  aprobado. Sin ella asegura no manda la cuenta de la ficha: contesta
   *  `faltan_campos` con `confirmar: true`. Un IBAN tecleado en `campos.iban` manda. */
  cuentaConfirmada?: string | null
  /** El corredor ha mirado el proyecto tras un intento «quizá emitido» y no hay
   *  póliza: solo así asegura reenvía (409 `reintento_sin_confirmar` si falta). */
  reintentoConfirmado?: boolean
  /** El proyecto YA cuenta una solicitud APROBADA con nº de póliza: asegura la
   *  acuña en la cartera y NO manda ningún Submit. */
  acunarExistente?: boolean
  /** El corredor confirma que el tomador YA tiene familiares asegurados en
   *  Allianz (bonificación real de cartera). NUNCA se manda por defecto — ver
   *  `conProductoPorDefecto` en asegura, que es quien decide el valor final. */
  familiaEnAllianz?: boolean
}): Promise<RespuestaEmitir> {
  try {
    const r = await pedir(
      '/api/operador/codeoscopic/emitir',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: p.projectId,
          campos: p.campos,
          actor: p.actor ?? 'plataforma',
          primaAnual: p.primaAnual ?? null,
          confirmado: true,
          ...(p.cuentaConfirmada ? { cuentaConfirmada: p.cuentaConfirmada } : {}),
          ...(p.reintentoConfirmado === true ? { reintentoConfirmado: true } : {}),
          ...(p.acunarExistente === true ? { acunarExistente: true } : {}),
          ...(p.familiaEnAllianz === true ? { familiaEnAllianz: true } : {}),
        }),
      },
      TIMEOUT_EMITIR_MS,
    )
    if (r === null) {
      return {
        estado: 'sin_configurar',
        mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).',
      }
    }
    return interpretarEmitir(r.status, r.json)
  } catch (e) {
    return {
      estado: 'error',
      motivo: 'red',
      mensaje:
        `${MOTIVOS_PUERTO.red} (${e instanceof Error ? e.message : String(e)}). ` +
        'NO SE SABE si la póliza ha llegado a emitirse: antes de repetir, comprueba en Avant2 o pide ' +
        'a asegura el estado del proyecto — reintentar podría duplicar la emisión.',
      crudo: null,
    }
  }
}

// ─── Retomar una cotización YA guardada (GRATIS, sin volver a pagar) ─────────
//
// 🚨 Construido el 11/09/2026: sin esto, recargar la pantalla de retarificar
// borra el formulario Y esconde que ya existe un precio pagado — así que
// pulsar «Pedir precio» otra vez para poder llegar a Emitir crea una
// cotización NUEVA (otro cargo de 0,50€) en vez de reutilizar la de hace un
// minuto. Esto solo LEE lo que ya está en `seguros.tarificaciones`: no
// confirma nada con la compañía (eso sigue siendo el ReRate de `ofertaAsegura`).

/** Lo que el corredor tecleó a mano la vez anterior, recuperado de la
 *  cotización guardada — para poder prellenar el formulario sin adivinar. */
export type FormularioGuardado = {
  codigoVehiculo: string | null
  fechaMatriculacion: string | null
  garaje: string | null
  estadoCivilId: string | null
  municipioId: number | null
  /** Id del catálogo de tipos de vía que viajó en la dirección del tomador. */
  tipoViaId: string | null
  /** Mismas claves que `CAMPOS_A_MANO` de la pantalla (dni, nombre,
   *  apellido1, telefono, fechaNacimiento, fechaCarnet, nombreVia, numeroVia, email). */
  correcciones: Record<string, string>
}

export type TarificacionGuardadaAuto = {
  cotizacionId: string
  projectId: string
  creadaEn: string
  /** `effectiveDate` con la que se cotizó; null si asegura no la trae. */
  fechaEfecto: string | null
  /** Fecha de efecto ya pasada (lo decide asegura, en hora de Madrid): el
   *  proyecto está muerto y la pantalla no debe ofrecer su precio. */
  caducada: boolean
  precios: Precio[]
  /**
   * 🚨 **`null` = «no se guardaron», que NO es «ningún producto falló».**
   *
   * Los `fallos` de una cotización son los productos que NO dieron precio, con
   * el motivo que dio la compañía — y ahí viven frases como «La matrícula ya
   * está asegurada en la compañía», que es la defensa de cartera dicha por la
   * propia compañía: gratis, y más fiable que nuestro emparejamiento por DGS.
   *
   * Hoy `seguros.tarificaciones` no tiene columna para ellos (SQL pendiente de
   * aplicar en `apps/asegura/prisma/sql/2026-09-21_tarificacion_identidad_y_fallos.sql`),
   * así que al recuperar una cotización esto llega `null`. Pintarlo como `[]`
   * sería afirmar «revisado: ninguna compañía rechazó» sobre algo que nadie ha
   * mirado — y, peor, esconder el único aviso que dice que una compañía ya tiene
   * a este cliente.
   */
  fallos: Fallo[] | null
  formulario: FormularioGuardado
}

export type RespuestaTarificacionGuardada =
  | { estado: 'sin_configurar'; mensaje: string }
  | { estado: 'error'; motivo: MotivoPuerto; mensaje: string }
  /** No es un fallo: esta póliza todavía no tiene ninguna cotización real guardada. */
  | { estado: 'ninguna' }
  | { estado: 'ok'; guardada: TarificacionGuardadaAuto }

/** Gratis y solo lectura: no hay llamada al vendor detrás. */
const TIMEOUT_TARIFICACION_GUARDADA_MS = 15_000

function leerFormularioGuardado(v: unknown): FormularioGuardado | null {
  if (typeof v !== 'object' || v === null) return null
  const x = v as Record<string, unknown>
  const correcciones: Record<string, string> = {}
  if (typeof x.correcciones === 'object' && x.correcciones !== null) {
    for (const [k, val] of Object.entries(x.correcciones as Record<string, unknown>)) {
      if (typeof val === 'string' && val.trim() !== '') correcciones[k] = val
    }
  }
  return {
    codigoVehiculo: cadenaONulo(x.codigoVehiculo),
    fechaMatriculacion: cadenaONulo(x.fechaMatriculacion),
    garaje: cadenaONulo(x.garaje),
    estadoCivilId: cadenaONulo(x.estadoCivilId),
    municipioId: typeof x.municipioId === 'number' ? x.municipioId : null,
    tipoViaId: cadenaONulo(x.tipoViaId),
    correcciones,
  }
}

/**
 * Un campo OPCIONAL del precio, con sus TRES estados sin colapsar:
 *   - la clave no viene       → `undefined` = «asegura no lo manda» (columna que
 *     todavía no existe, o un despliegue más viejo del otro lado).
 *   - la clave viene          → se parsea, y `null` = «el producto no lo declara».
 *
 * Colapsar el primero en el segundo diría «esta compañía no dice la forma de
 * pago» sobre un dato que nadie ha guardado nunca.
 */
function opcionalPrecio<T>(v: unknown, leer: (x: unknown) => T | null): T | null | undefined {
  return v === undefined ? undefined : leer(v)
}

function leerPreciosGuardados(v: unknown): Precio[] | null {
  if (!Array.isArray(v)) return null
  return v.map((raw): Precio => {
    const x = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const numeroONulo = (n: unknown): number | null => (typeof n === 'number' ? n : null)
    return {
      // 🔑 Hoy `seguros.tarificacion_precios` NO guarda el id del vendor, así que
      // en una cotización recuperada esto será `undefined` = «no se sabe». Lo que
      // NO se hace es rellenarlo con la posición: sería una clave que parece
      // estable y no lo es, que es justo lo que se está arreglando.
      ...(typeof x.id === 'string' && x.id.trim() !== '' ? { id: x.id.trim() } : {}),
      compania: cadenaONulo(x.compania),
      producto: cadenaONulo(x.producto),
      categoria: cadenaONulo(x.categoria),
      primaEur: numeroONulo(x.primaEur),
      entradaEur: opcionalPrecio(x.entradaEur, numeroONulo),
      meses: opcionalPrecio(x.meses, numeroONulo),
      formaPago: opcionalPrecio(x.formaPago, cadenaONulo),
      frecuenciaPago: opcionalPrecio(x.frecuenciaPago, cadenaONulo),
      franquiciaEur: numeroONulo(x.franquiciaEur),
      firmeza: typeof x.firmeza === 'string' ? x.firmeza : 'estimado',
      avisos: Array.isArray(x.avisos) ? x.avisos.filter((a): a is string => typeof a === 'string') : [],
    }
  })
}

/** PURO: la respuesta HTTP → los estados de la pantalla. Sin red, testeable. */
export function interpretarTarificacionGuardada(status: number, json: unknown): RespuestaTarificacionGuardada {
  const r = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (status === 401 || status === 403) {
    return { estado: 'error', motivo: 'secreto_rechazado', mensaje: MOTIVOS_PUERTO.secreto_rechazado }
  }
  if (status === 200 && r.estado === 'ninguna') return { estado: 'ninguna' }
  if (status === 200 && r.estado === 'ok') {
    const formulario = leerFormularioGuardado(r.formulario)
    const precios = leerPreciosGuardados(r.precios)
    if (!formulario || !precios || typeof r.cotizacionId !== 'string' || typeof r.projectId !== 'string') {
      return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
    }
    return {
      estado: 'ok',
      guardada: {
        cotizacionId: r.cotizacionId,
        projectId: r.projectId,
        creadaEn: cadenaONulo(r.creadaEn) ?? '',
        fechaEfecto: cadenaONulo(r.fechaEfecto),
        caducada: r.caducada === true,
        precios,
        // 🚨 Solo un array cuenta como «esto es lo que falló». La ausencia del
        // campo —que es lo que manda asegura hoy— es `null` = «no se guardaron».
        fallos: Array.isArray(r.fallos) ? (r.fallos as Fallo[]) : null,
        formulario,
      },
    }
  }
  if (r.estado === 'sin_configurar') {
    return {
      estado: 'sin_configurar',
      mensaje: cadenaONulo(r.mensaje) ?? 'Codeoscopic no está configurado en central-asegura.',
    }
  }
  const detalle = describirCausaAsegura(typeof r.causa === 'string' ? r.causa : undefined)
  return {
    estado: 'error',
    motivo: 'asegura_error',
    mensaje: [cadenaONulo(r.mensaje), detalle].filter((s): s is string => !!s).join(' — ') || `error ${status}`,
  }
}

/**
 * `GET /api/operador/codeoscopic/tarificacion` — la última cotización real
 * guardada de esta póliza. **Gratis.** `estado: 'ninguna'` no es un fallo.
 */
export async function tarificacionGuardadaAsegura(polizaId: string): Promise<RespuestaTarificacionGuardada> {
  try {
    const r = await pedir(
      `/api/operador/codeoscopic/tarificacion?polizaId=${encodeURIComponent(polizaId)}`,
      { method: 'GET' },
      TIMEOUT_TARIFICACION_GUARDADA_MS,
    )
    if (r === null) {
      return {
        estado: 'sin_configurar',
        mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).',
      }
    }
    return interpretarTarificacionGuardada(r.status, r.json)
  } catch (e) {
    // No se degrada a «ninguna»: un fallo de red no es «no hay cotización».
    return {
      estado: 'error',
      motivo: 'red',
      mensaje: `${MOTIVOS_PUERTO.red} (${e instanceof Error ? e.message : String(e)})`,
    }
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

// ─── Capitales recomendados de HOGAR (`POST /home/recommend-limits`) ─────────
//
// 🚨 Se trata como una llamada que puede costar: el portal no la documenta como
// facturable, pero devuelve un capital por compañía y [Probable] tarifica por
// dentro. asegura la mete en el libro de consumo (motivo `limites_hogar`, tope
// propio) y detrás del interruptor de tarificar. Aquí: confirmación explícita,
// un solo intento, y un fallo de red se dice como «no se sabe si ha costado».

/** Un capital recomendado. Cada extremo `null` = el vendor no lo trae (nunca 0). */
export type RangoCapital = { media: number | null; minimo: number | null; maximo: number | null }

export type RespuestaLimitesHogar =
  | { estado: 'sin_configurar'; mensaje: string }
  | { estado: 'faltan'; faltan: Reparo[]; mensaje: string }
  | { estado: 'tope'; mensaje: string }
  | { estado: 'error'; mensaje: string; gastoDesconocido: boolean }
  | {
      estado: 'ok'
      continente: RangoCapital | null
      contenido: RangoCapital | null
      /** Con el coste a 0 en asegura dice «sin confirmar», no «0,00€». */
      coste: string
      restantesHoy: number | null
    }

function rangoCapital(v: unknown): RangoCapital | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null)
  const r = { media: n(o.media), minimo: n(o.minimo), maximo: n(o.maximo) }
  return r.media === null && r.minimo === null && r.maximo === null ? null : r
}

/** Puro: la respuesta del puerto → lo que pinta la pantalla. */
export function interpretarLimitesHogar(status: number, json: unknown): RespuestaLimitesHogar {
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
  const mensaje = typeof o.mensaje === 'string' ? o.mensaje : typeof o.error === 'string' ? o.error : `HTTP ${status}`
  if (status === 200 && o.estado === 'ok') {
    return {
      estado: 'ok',
      continente: rangoCapital(o.continente),
      contenido: rangoCapital(o.contenido),
      coste: typeof o.coste === 'string' ? o.coste : 'coste sin confirmar',
      restantesHoy: typeof o.restantesHoy === 'number' ? o.restantesHoy : null,
    }
  }
  if (Array.isArray(o.faltan)) {
    const faltan = o.faltan.filter(
      (f): f is Reparo => typeof f === 'object' && f !== null && typeof (f as Reparo).campo === 'string',
    )
    return { estado: 'faltan', faltan, mensaje }
  }
  if (status === 429 || o.estado === 'tope') return { estado: 'tope', mensaje }
  if (status === 503 && o.estado === 'sin_configurar') return { estado: 'sin_configurar', mensaje }
  // Solo `gastado: '0,00€'` autoriza a decir que no ha costado; sin él, no se sabe.
  return { estado: 'error', mensaje, gastoDesconocido: o.gastado !== '0,00€' }
}

export async function limitesHogarAsegura(p: {
  polizaId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  referencia?: string
  solicitadoPor?: string
}): Promise<RespuestaLimitesHogar> {
  try {
    const r = await pedir(
      '/api/operador/codeoscopic/limites-hogar',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          polizaId: p.polizaId,
          confirmado: true,
          solicitadoPor: p.solicitadoPor ?? 'plataforma',
          ...(p.resueltos ? { resueltos: p.resueltos } : {}),
          ...(p.correcciones ? { correcciones: p.correcciones } : {}),
          ...(p.referencia ? { referencia: p.referencia } : {}),
        }),
      },
      TIMEOUT_COTIZAR_MS,
    )
    if (r === null) {
      return {
        estado: 'sin_configurar',
        mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET). No se ha llamado a Codeoscopic.',
      }
    }
    return interpretarLimitesHogar(r.status, r.json)
  } catch (e) {
    const expirado = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return {
      estado: 'error',
      mensaje:
        (expirado ? `Codeoscopic no ha respondido en ${Math.round(TIMEOUT_COTIZAR_MS / 1000)} s` : `No se ha podido llegar a asegura (${e instanceof Error ? e.message : String(e)})`) +
        ' — no se sabe si la recomendación ha salido ni si ha costado. Míralo en el consumo antes de volver a pulsar.',
      gastoDesconocido: true,
    }
  }
}


// ─── Coberturas de una oferta confirmada (GRATIS, lectura) ──────────────────

export type CoberturaOferta = { nombre: string; incluida: boolean | null; texto: string | null }
export type RespuestaCoberturas =
  | { estado: 'ok'; coberturas: CoberturaOferta[] }
  | { estado: 'error'; mensaje: string }

/** Lee la respuesta del puerto. Pura: se testea sin red. `incluida` ausente es `null`
 *  («ver el texto»), nunca `false`. */
export function interpretarCoberturas(status: number, json: unknown): RespuestaCoberturas {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.coberturas)) {
    const m = typeof o.mensaje === 'string' ? o.mensaje : typeof o.error === 'string' ? o.error : `HTTP ${status}`
    return { estado: 'error', mensaje: `No se han podido leer las coberturas (${m}).` }
  }
  const coberturas: CoberturaOferta[] = []
  for (const c of o.coberturas as unknown[]) {
    const x = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
    if (typeof x.nombre !== 'string' || x.nombre.trim() === '') continue
    coberturas.push({
      nombre: x.nombre,
      incluida: typeof x.incluida === 'boolean' ? x.incluida : null,
      texto: typeof x.texto === 'string' && x.texto.trim() !== '' ? x.texto : null,
    })
  }
  return { estado: 'ok', coberturas }
}

/** `GET /api/operador/codeoscopic/coberturas` — gratis, no cotiza ni confirma nada. */
export async function coberturasAsegura(projectId: string, offerId: string): Promise<RespuestaCoberturas> {
  const qs = new URLSearchParams({ projectId, offerId }).toString()
  try {
    const r = await pedir(`/api/operador/codeoscopic/coberturas?${qs}`, { method: 'GET' }, TIMEOUT_CATALOGO_MS)
    if (r === null) {
      return { estado: 'error', mensaje: 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).' }
    }
    return interpretarCoberturas(r.status, r.json)
  } catch (e) {
    return { estado: 'error', mensaje: `No se han podido leer las coberturas (${e instanceof Error ? e.message : String(e)}).` }
  }
}

// ─── Importar un proyecto hecho a mano en Avant2 (fila 13, 26/09/2026) ──────
//
// `GET/POST /api/operador/codeoscopic/importar` de asegura. La vista previa es
// gratis (una lectura del vendor); el enlace tampoco gasta: no hay ReRate ni
// Submit, deja la oferta como aceptada y la emisión sigue por `emitirAsegura`.

export type OfertaImportable = {
  quoteId: string
  compania: string | null
  producto: string | null
  modalidad: string | null
  categoria: string | null
  primaEur: number | null
  primerReciboEur: number | null
  pago: string | null
  efecto: string | null
  caduca: string | null
}

export type VistaImportacion =
  | { estado: 'sin_configurar'; mensaje: string }
  | { estado: 'error'; mensaje: string }
  | {
      estado: 'ok'
      projectId: string
      /** `sin_dato` = no se ha podido comprobar, que NO es «coincide». */
      tomador: 'coincide' | 'distinto' | 'sin_dato'
      /** Matrícula del proyecto contra la de la póliza, con los mismos tres estados. */
      vehiculo: 'coincide' | 'distinto' | 'sin_dato'
      bloqueos: string[]
      ofertas: OfertaImportable[]
      /** Precios del proyecto que no se pueden emitir desde aquí (sin confirmar en Avant2, caducados…). */
      otras: number
      /** El tomador TAL CUAL va en el proyecto (documento ya enmascarado). `null` = asegura no lo
       *  manda (versión anterior): no se puede construir el resumen de la emisión por Telegram. */
      titular: TitularProyecto | null
      matricula: string | null
      /** Cuenta que mandaría `/emitir` si se confirma. `cuentaInformada: false` = asegura no la
       *  manda (versión anterior), que NO es «no hay cuenta». */
      cuenta: CuentaConocida | null
      cuentaAviso: AvisoCuenta | null
      cuentaInformada: boolean
      /** La calle que irá a la compañía. `ficha` = el proyecto la trae a medias y `/emitir` la completa
       *  entera desde la ficha; `falta` = tampoco la ficha la tiene completa. `null` = asegura no lo manda. */
      direccion: DireccionEmision | null
    }

export type DireccionEmision =
  | { origen: 'proyecto'; texto: string | null }
  | { origen: 'ficha'; texto: string }
  | { origen: 'falta'; faltan: string[] }

function leerDireccionEmision(v: unknown): DireccionEmision | null {
  if (typeof v !== 'object' || v === null) return null
  const x = v as Record<string, unknown>
  if (x.origen === 'proyecto') return { origen: 'proyecto', texto: cadenaONulo(x.texto) }
  if (x.origen === 'ficha' && typeof x.texto === 'string' && x.texto.trim()) return { origen: 'ficha', texto: x.texto }
  if (x.origen === 'falta') {
    return { origen: 'falta', faltan: Array.isArray(x.faltan) ? x.faltan.filter((f): f is string => typeof f === 'string') : [] }
  }
  return null
}

export type TitularProyecto = { nombre: string | null; documento: string | null; direccion: string | null; codigoPostal: string | null }

function leerTitular(v: unknown): TitularProyecto | null {
  if (typeof v !== 'object' || v === null) return null
  const x = v as Record<string, unknown>
  return {
    nombre: cadenaONulo(x.nombre),
    documento: cadenaONulo(x.documento),
    direccion: cadenaONulo(x.direccion),
    codigoPostal: cadenaONulo(x.codigoPostal),
  }
}

export type RespuestaImportar = RespuestaOferta | (Extract<RespuestaOferta, { estado: 'ok' }> & { compania: string; categoria: string })

const TIMEOUT_IMPORTAR_MS = 20_000
const SIN_PUERTO = 'El puerto con asegura no está configurado en plataforma (falta ASEGURA_OPERADOR_SECRET).'

function leerOfertaImportable(v: unknown): OfertaImportable | null {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
  if (typeof o.quoteId !== 'string') return null
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  return {
    quoteId: o.quoteId,
    compania: cadenaONulo(o.compania),
    producto: cadenaONulo(o.producto),
    modalidad: cadenaONulo(o.modalidad),
    categoria: cadenaONulo(o.categoria),
    primaEur: n(o.primaEur),
    primerReciboEur: n(o.primerReciboEur),
    pago: cadenaONulo(o.pago),
    efecto: cadenaONulo(o.efecto),
    caduca: cadenaONulo(o.caduca),
  }
}

export function interpretarVistaImportacion(status: number, json: unknown): VistaImportacion {
  const r = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (status === 401 || status === 403) return { estado: 'error', mensaje: MOTIVOS_PUERTO.secreto_rechazado }
  if (status === 503 && r.causa === 'apagado') {
    return { estado: 'sin_configurar', mensaje: cadenaONulo(r.mensaje) ?? 'La emisión está apagada en asegura.' }
  }
  if (status !== 200 || r.estado !== 'ok' || typeof r.projectId !== 'string') {
    return { estado: 'error', mensaje: cadenaONulo(r.mensaje) ?? cadenaONulo(r.error) ?? `error ${status}` }
  }
  const tres = (v: unknown) => (v === 'coincide' || v === 'distinto' ? v : 'sin_dato')
  return {
    estado: 'ok',
    projectId: r.projectId,
    tomador: tres(r.tomador),
    vehiculo: tres(r.vehiculo),
    bloqueos: Array.isArray(r.bloqueos) ? r.bloqueos.filter((b): b is string => typeof b === 'string') : [],
    ofertas: Array.isArray(r.ofertas) ? r.ofertas.flatMap((o) => leerOfertaImportable(o) ?? []) : [],
    otras: typeof r.otras === 'number' ? r.otras : 0,
    titular: leerTitular(r.titular),
    matricula: cadenaONulo(r.matricula),
    cuenta: leerCuenta(r.cuenta),
    cuentaAviso: leerAvisoCuenta(r.cuenta),
    cuentaInformada: 'cuenta' in r,
    direccion: leerDireccionEmision(r.direccion),
  }
}

export async function vistaImportacionAsegura(projectId: string, polizaId: string): Promise<VistaImportacion> {
  const qs = new URLSearchParams({ projectId, polizaId }).toString()
  try {
    const r = await pedir(`/api/operador/codeoscopic/importar?${qs}`, { method: 'GET' }, TIMEOUT_IMPORTAR_MS)
    if (r === null) return { estado: 'sin_configurar', mensaje: SIN_PUERTO }
    return interpretarVistaImportacion(r.status, r.json)
  } catch (e) {
    return { estado: 'error', mensaje: `${MOTIVOS_PUERTO.red} (${e instanceof Error ? e.message : String(e)})` }
  }
}

export function interpretarImportacion(status: number, json: unknown): RespuestaImportar {
  const base = interpretarOferta(status, json)
  if (base.estado !== 'ok') {
    // Un 4xx del import es una regla de negocio (tomador distinto, precio caducado, ya
    // enlazado…): su `mensaje` viaja tal cual, sin la coletilla de «mira los logs».
    const r = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
    const mensaje = cadenaONulo(r.mensaje)
    if (base.estado === 'error' && status >= 400 && status < 500 && status !== 401 && status !== 403 && mensaje) {
      return { estado: 'error', motivo: 'asegura_error', mensaje }
    }
    return base
  }
  const r = json as Record<string, unknown>
  const compania = cadenaONulo(r.compania)
  const categoria = cadenaONulo(r.categoria)
  if (!compania || !categoria) {
    return { estado: 'error', motivo: 'respuesta_ilegible', mensaje: MOTIVOS_PUERTO.respuesta_ilegible }
  }
  return { ...base, compania, categoria }
}

export async function importarProyectoAsegura(p: { projectId: string; polizaId: string; quoteId: string }): Promise<RespuestaImportar> {
  try {
    const r = await pedir(
      '/api/operador/codeoscopic/importar',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...p, confirmado: true }) },
      TIMEOUT_IMPORTAR_MS,
    )
    if (r === null) return { estado: 'sin_configurar', mensaje: SIN_PUERTO }
    return interpretarImportacion(r.status, r.json)
  } catch (e) {
    return { estado: 'error', motivo: 'red', mensaje: `${MOTIVOS_PUERTO.red} (${e instanceof Error ? e.message : String(e)})` }
  }
}
