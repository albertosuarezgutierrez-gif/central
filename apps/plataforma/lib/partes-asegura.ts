// Los PARTES DE SINIESTRO que abre el CLIENTE desde el portal
// (`apps/asegura-portal` → `seguros.portal_parte_siniestro`), leídos desde la
// pantalla de Alberto.
//
// Al otro lado del parte hay una persona esperando: lo mandó, cree que ya está
// hecho y no va a volver a llamar. Hasta hoy esos partes no los veía NADIE.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 LA REGLA QUE SOSTIENE ESTE FICHERO (la misma que la del portal, en
// `packages/module-seguros-portal/src/parte-siniestro.ts`): un parte ENVIADO no
// es un siniestro COMUNICADO a la compañía.
//
// La correduría media por el CLIENTE, no por el asegurador: que nos lo cuente a
// nosotros no es, jurídicamente, contárselo a la entidad. Por eso `comunicado`
// es la ÚNICA fuente de la frase «la compañía ya lo sabe» y NO se deduce de que
// el estado haya dejado de ser el inicial: `recibido` significa «lo hemos leído
// NOSOTROS», que es justo el estado que se confunde con estar comunicado. Hay un
// guardián en la raíz (`test/regression-portal-parte-siniestro.test.ts`) que
// caza ese atajo, y `test/regression-partes-asegura.test.ts` lo vigila aquí.
// ─────────────────────────────────────────────────────────────────────────────
//
// Dos partes, como en `siniestros-asegura.ts` y `correduria-puerto.ts`:
//
//   1. Lo PURO: leer los partes tal y como los manda asegura por su puerto y
//      leer sus respuestas. Sin red ni env, así que lo importa también el
//      client component y lo prueba `test/regression-partes-asegura.test.ts`.
//   2. La RED: las llamadas al puerto, solo desde las rutas API de plataforma.
//
// Esta app NO toca la BD de la correduría: habla con el puerto de
// `apps/asegura` (`/api/operador/partes`) con el secreto de operador.

/**
 * El ciclo de vida del parte, del lado de la correduría.
 *
 * - `enviado`             el cliente lo mandó; nadie lo ha mirado todavía.
 * - `recibido`            Alberto lo ha visto. Sigue SIN estar en la compañía.
 * - `abierto_en_compania` existe siniestro en la entidad (por eso el puerto
 *                         exige el `siniestroId`: la BD tiene además un CHECK).
 * - `descartado`          no procede (sin cobertura, consulta, duplicado).
 *
 * ⚠️ Se declara aquí porque `@central/module-seguros-portal` **no es
 * dependencia de esta app** (el portal es otra vertical y añadirla arrastraría
 * su árbol entero al build del panel). La copia no queda suelta: hay un
 * guardián en `test/regression-partes-asegura.test.ts` que compara esta lista
 * contra `PARTE_ESTADOS` del módulo y falla si divergen — que es el fallo de la
 * casa (alguien añade un estado en un sitio y la otra pantalla se queda muda).
 */
export const PARTE_ESTADOS = ['enviado', 'recibido', 'abierto_en_compania', 'descartado'] as const
export type ParteEstado = (typeof PARTE_ESTADOS)[number]

const ESTADOS = new Set<string>(PARTE_ESTADOS)

/** Quién manda el parte / quién figura como tomador. `id` = ficha de la cartera. */
export type PersonaParte = { id: string; nombre: string }

/**
 * Art. 16 LCS, tal y como lo cuenta asegura.
 *
 * 🚨 `fueraDePlazo` NO es pérdida de cobertura y ningún texto de pantalla puede
 * insinuarlo: el art. 16 solo permite a la compañía reclamar los daños que le
 * cause el retraso, y perder el derecho exige dolo o culpa grave. Avisar tarde
 * sigue siendo muchísimo mejor que no avisar.
 */
export type PlazoParte = {
  diasTranscurridos: number
  /** Días que quedan de los 7. Negativo cuando ya pasaron. */
  diasRestantes: number
  fueraDePlazo: boolean
}

export type ParteSiniestro = {
  id: string
  /**
   * 🚨 `null` = quien mandó el parte **no está vinculado a ninguna ficha de la
   * cartera**. No es «cliente desconocido» ni algo que se pueda esconder: es
   * trabajo pendiente (identificar a esa persona antes de poder abrir nada).
   */
  cliente: PersonaParte | null
  /**
   * Con valor = el parte va sobre una póliza cuyo TOMADOR es otro (alguien con
   * autorización para verla dio el parte). No es sospechoso: es a quién hay que
   * llamar y quién figura en el contrato.
   */
  titularDistinto: PersonaParte | null
  /** `null` = no llegó legible. La pantalla lo dice; no se pinta en blanco. */
  descripcion: string | null
  /** `YYYY-MM-DD`. `null` = no llegó (el portal la exige, pero aquí no se supone). */
  fechaHecho: string | null
  /** `HH:MM` o `null` = el cliente no la sabía. No se inventa. */
  horaAproximada: string | null
  lugar: string | null
  /**
   * 🚨 TRI-ESTADO, y los tres se pintan distinto:
   * `true` «con heridos» · `false` «sin heridos» · **`null` «no lo ha contestado»**.
   * Un `?? false` en cualquier punto de la cadena convierte una pregunta sin
   * responder en una afirmación que nadie hizo — y con heridos el parte se
   * tramita hoy, y sin ellos el lunes.
   */
  hayHeridos: boolean | null
  hayTerceros: boolean | null
  estado: ParteEstado
  /** 🚨 La ÚNICA fuente de «la compañía ya lo sabe». Ver la cabecera. */
  comunicado: boolean
  siniestroId: string | null
  polizaId: string | null
  polizaDeclaradaId: string | null
  /** ISO con hora. `null` = no llegó. */
  creadoEn: string | null
  /** `null` = asegura no lo calculó (o llegó con forma rara): «sin calcular», nunca 0 días. */
  plazo: PlazoParte | null
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

/** Entero finito o `null`. Un `null` del puerto se QUEDA en null. */
function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null
}

/**
 * 🚨 El tri-estado, en su única puerta.
 *
 * Solo un booleano de verdad es una respuesta. Cualquier otra cosa —campo
 * ausente, `null`, una cadena, un 0— es «no lo ha contestado», y se queda en
 * `null`. Nunca `false`: `false` es una afirmación («no había heridos») que
 * aquí no ha hecho nadie.
 */
export function triestado(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

function persona(v: unknown): PersonaParte | null {
  if (typeof v !== 'object' || v === null) return null
  const p = v as Record<string, unknown>
  const id = cadena(p.id)
  if (id === null) return null
  // Sin nombre se pinta el hueco, pero el enlace a la ficha SÍ existe: el id es
  // lo que permite trabajar el parte, y perderlo por un nombre vacío sería
  // tirar el dato útil.
  return { id, nombre: cadena(p.nombre) ?? 'sin nombre en la ficha' }
}

function plazo(v: unknown): PlazoParte | null {
  if (typeof v !== 'object' || v === null) return null
  const p = v as Record<string, unknown>
  const transcurridos = entero(p.diasTranscurridos)
  const restantes = entero(p.diasRestantes)
  // Los dos o ninguno: medio plazo es un plazo inventado. Y `fueraDePlazo` se
  // exige booleano — un campo ausente NO se lee como «está en plazo».
  if (transcurridos === null || restantes === null || typeof p.fueraDePlazo !== 'boolean') return null
  return { diasTranscurridos: transcurridos, diasRestantes: restantes, fueraDePlazo: p.fueraDePlazo }
}

/**
 * Una fila del puerto → `ParteSiniestro`, o `null` si no tiene forma de parte.
 *
 * Se exige `id` y un `estado` CONOCIDO: el estado decide qué se pinta y qué
 * botones se ofrecen, así que un estado que no se entiende no puede caer al
 * inicial por descarte (aparecería como «sin atender» algo que quizá ya está
 * abierto en la compañía). Las filas así se CUENTAN aparte, no se tragan.
 */
export function leerParte(v: unknown): ParteSiniestro | null {
  if (typeof v !== 'object' || v === null) return null
  const p = v as Record<string, unknown>
  const id = cadena(p.id)
  if (id === null) return null
  const estado = cadena(p.estado)
  if (estado === null || !ESTADOS.has(estado)) return null
  return {
    id,
    cliente: persona(p.cliente),
    titularDistinto: persona(p.titularDistinto),
    descripcion: cadena(p.descripcion),
    fechaHecho: cadena(p.fechaHecho),
    horaAproximada: cadena(p.horaAproximada),
    lugar: cadena(p.lugar),
    hayHeridos: triestado(p.hayHeridos),
    hayTerceros: triestado(p.hayTerceros),
    estado: estado as ParteEstado,
    // Conservador a propósito: si el campo no llega, NO se afirma que la
    // compañía lo sepa. El error caro es el contrario — decir «comunicado» de
    // algo que no lo está deja al cliente sin siniestro y sin saberlo.
    comunicado: p.comunicado === true,
    siniestroId: cadena(p.siniestroId),
    polizaId: cadena(p.polizaId),
    polizaDeclaradaId: cadena(p.polizaDeclaradaId),
    creadoEn: cadena(p.creadoEn),
    plazo: plazo(p.plazo),
  }
}

/** Los partes que nadie ha mirado todavía. Es lo que pinta la bandeja. */
export function partesSinAtender(partes: readonly ParteSiniestro[]): ParteSiniestro[] {
  return partes.filter((p) => p.estado === 'enviado')
}

/**
 * Orden de trabajo: primero el que lleva más tiempo esperando.
 *
 * Un parte sin plazo calculable NO se pone el primero (no se sabe que sea
 * urgente) ni desaparece: va al final y la pantalla dice que su plazo no se ha
 * podido calcular.
 */
export function ordenarPorEspera(partes: readonly ParteSiniestro[]): ParteSiniestro[] {
  return [...partes].sort((a, b) => {
    const da = a.plazo?.diasTranscurridos
    const db = b.plazo?.diasTranscurridos
    if (da === undefined && db === undefined) return 0
    if (da === undefined) return 1
    if (db === undefined) return -1
    return db - da
  })
}

// ─── Respuestas ──────────────────────────────────────────────────────────────

/**
 * La lectura de `GET /api/operador/partes`.
 *
 * 🚨 Ningún fallo puede acabar en un `ok` con la lista vacía: «no se ha podido
 * mirar» y «no hay partes» son cosas distintas, y colapsarlas deja a una
 * persona esperando mientras la pantalla dice que no hay nada que hacer.
 *
 * - `ok`             se leyó la lista. `ilegibles` = filas que llegaron con
 *                    forma rara: se declaran, no se esconden.
 * - `sin_configurar` falta `ASEGURA_OPERADOR_SECRET` en este proyecto.
 * - `no_encontrado`  asegura respondió 404: la versión desplegada todavía no
 *                    sirve esta ruta. Tampoco es «no hay partes».
 * - `error`          no se pudo leer, con su motivo.
 */
export type RespuestaPartes =
  | { estado: 'ok'; partes: ParteSiniestro[]; ilegibles: number }
  | { estado: 'sin_configurar' }
  | { estado: 'no_encontrado' }
  | { estado: 'error'; motivo: string }

export function interpretarPartes(status: number, json: unknown): RespuestaPartes {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (status === 200) {
    if (o.estado === 'error') {
      return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? 'asegura_error' }
    }
    // Un 200 sin lista NO es una lista vacía: es una respuesta que no se
    // entiende, y decir «no hay partes» sobre ella sería inventarse el dato.
    if (!Array.isArray(o.partes)) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const partes: ParteSiniestro[] = []
    let ilegibles = 0
    for (const fila of o.partes) {
      const p = leerParte(fila)
      if (p === null) ilegibles++
      else partes.push(p)
    }
    return { estado: 'ok', partes, ilegibles }
  }
  return {
    estado: 'error',
    motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}`,
  }
}

/**
 * La lectura de `PATCH /api/operador/partes`.
 *
 * `invalido` y `conflicto` son «no se hizo, y por esto»; `error` es «no se pudo
 * hacer». Se separan porque mandan a hacer cosas distintas: al primero se le
 * completa el dato que falta, al segundo se recarga (alguien ya lo movió) y al
 * tercero se mira el puerto.
 *
 * En `ok`, `parte: null` = asegura no devolvió la fila actualizada. No es un
 * fallo: la pantalla recarga del servidor igualmente.
 */
export type RespuestaEscrituraParte =
  | { estado: 'ok'; parte: ParteSiniestro | null }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'conflicto'; motivo: string }
  | { estado: 'no_encontrado' }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export function interpretarEscrituraParte(status: number, json: unknown): RespuestaEscrituraParte {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const motivo = cadena(o.error) ?? cadena(o.motivo) ?? cadena(o.causa)
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (status === 409) return { estado: 'conflicto', motivo: motivo ?? 'transicion_invalida' }
  if (status === 400 || status === 422) return { estado: 'invalido', motivo: motivo ?? 'datos_invalidos' }
  if (status === 200 && o.estado !== 'error') return { estado: 'ok', parte: leerParte(o.parte) }
  return { estado: 'error', motivo: motivo ?? `HTTP ${status}` }
}

/** El motivo del puerto, en castellano de pantalla. Los que ya son frase se dejan. */
export function textoMotivoParte(motivo: string): string {
  switch (motivo) {
    case 'secreto_rechazado':
      return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).'
    case 'respuesta_ilegible':
      return 'la respuesta de asegura no tenía la forma esperada.'
    case 'asegura_error':
      return 'asegura respondió, pero no pudo leer los partes en su base de datos.'
    case 'red':
      return 'no se pudo llegar a asegura (timeout, DNS o TLS).'
    case 'siniestro_requerido':
      return 'para abrirlo en la compañía hace falta el número de siniestro que ha dado la entidad.'
    case 'motivo_requerido':
      return 'un descarte sin motivo no lo puede revisar nadie después: escribe por qué no procede.'
    case 'transicion_invalida':
      return 'ese cambio ya no es posible sobre este parte (alguien lo movió antes). Recarga la página.'
    case 'datos_invalidos':
      return 'asegura no ha aceptado los datos del cambio.'
    default:
      return motivo
  }
}

// ─── Red (solo desde las rutas API de plataforma) ────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

function cabeceras(): Record<string, string> | null {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  return secret ? { Authorization: `Bearer ${secret}` } : null
}

export type Reenvio = { status: number; json: unknown }

async function llamar(path: string, init: RequestInit): Promise<Reenvio> {
  const h = cabeceras()
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}${path}`, {
      ...init,
      headers: { ...h, ...(init.body ? { 'content-type': 'application/json' } : {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

/** `GET /api/operador/partes?estado=&clienteId=&limite=` — la bandeja. */
export function partesAsegura(filtros: { estado?: string; clienteId?: string; limite?: number } = {}): Promise<Reenvio> {
  const q = new URLSearchParams()
  if (filtros.estado) q.set('estado', filtros.estado)
  if (filtros.clienteId) q.set('clienteId', filtros.clienteId)
  if (filtros.limite !== undefined) q.set('limite', String(filtros.limite))
  const cola = q.toString()
  return llamar(`/api/operador/partes${cola ? `?${cola}` : ''}`, { method: 'GET' })
}

/** `PATCH` — `{ id, estado, siniestroId?, motivoDescarte?, actor }`. */
export function actualizarParteAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/partes', { method: 'PATCH', body: JSON.stringify(body) })
}
