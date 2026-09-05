// Las solicitudes del derecho de SUPRESIÓN (art. 17 RGPD) que abre el CLIENTE
// desde el portal (`apps/asegura-portal` → `seguros.portal_supresion`), leídas
// desde la pantalla de Alberto.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 POR QUÉ ESTE FICHERO EXISTE, y es la razón más cara de toda la pantalla:
// **hay un plazo legal de UN MES corriendo por debajo** (art. 12.3 RGPD) desde
// que la persona pulsa, no desde que alguien la mira. El portal ya registra la
// solicitud; sin esta pantalla se registraba, arrancaba el reloj y **no salía
// en ningún sitio que Alberto abriera**. Es la regla de la casa —un aviso en una
// pantalla que nadie abre es un aviso que no existe— aplicada donde el
// incumplimiento se produce solo, en silencio y sin que nada falle.
//
// 🚨 Y LO QUE ESTA PANTALLA NO ES: una cola de borrados. El art. 17.3.b y el
// 17.3.e excluyen la supresión cuando hace falta cumplir una obligación legal o
// defender reclamaciones, y una correduría tiene las dos. Lo que se contesta es
// QUÉ se suprime y QUÉ se conserva, con su base legal — y contestarlo sin texto
// escrito es justo lo que prohíbe el art. 12.4.
// ─────────────────────────────────────────────────────────────────────────────
//
// Dos partes, como en `partes-asegura.ts`:
//
//   1. Lo PURO: leer la cola tal y como la manda asegura y leer sus respuestas.
//      Sin red ni env, así que lo importa también el client component y lo
//      prueba `test/regression-supresiones-asegura.test.ts`.
//   2. La RED: las llamadas al puerto, solo desde las rutas API de plataforma.
//
// Esta app NO toca la BD de la correduría: habla con el puerto de `apps/asegura`
// (`/api/operador/supresiones`) con el secreto de operador.

/**
 * Los estados de una solicitud.
 *
 * ⚠️ Se declara aquí porque `@central/module-seguros-portal` **no es dependencia
 * de esta app** (arrastraría la vertical del portal al build del panel). La
 * copia no queda suelta: `test/regression-supresiones-asegura.test.ts` la
 * compara contra `ESTADOS_SUPRESION` del módulo y falla si divergen — que es el
 * fallo de la casa: alguien añade un estado en un sitio y la otra pantalla se
 * queda muda.
 */
export const SUPRESION_ESTADOS = [
  'recibida',
  'en_curso',
  'resuelta_total',
  'resuelta_parcial',
  'denegada',
  'retirada',
] as const
export type SupresionEstado = (typeof SUPRESION_ESTADOS)[number]

const ESTADOS = new Set<string>(SUPRESION_ESTADOS)

/**
 * En qué punto del plazo está. Lo calcula asegura (una sola fuente para el
 * reloj legal: dos cuentas del mismo plazo acaban dando plazos distintos de la
 * misma solicitud sin que ninguna pantalla falle).
 */
export const PLAZOS = ['resuelta', 'en_plazo', 'urgente', 'vencido'] as const
export type EstadoPlazo = (typeof PLAZOS)[number]

/** Lo que se le enseñó a la persona al pedirlo: qué se borra y qué no, y por qué. */
export type AlcanceSupresion = {
  que: string
  trato: 'suprimible' | 'conservado'
  motivo: string
}

export type Supresion = {
  id: string
  identidadId: string
  /** `null` NO es «no es cliente»: es «su acceso no está enlazado con ninguna ficha». */
  clienteId: string | null
  recibidaEn: string
  estado: SupresionEstado
  plazo: EstadoPlazo
  fechaLimite: string
  /** Negativo si ya venció. NO se colapsa a 0: «llevo diez días fuera» ≠ «se acaba hoy». */
  diasRestantes: number
  prorrogadaEn: string | null
  prorrogaMotivo: string | null
  resueltaEn: string | null
  respuesta: string | null
  resueltaPor: string | null
  motivo: string | null
  versionTextos: string
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null
}

/** Una fila del puerto. `null` = llegó con forma rara → se cuenta como ilegible, no se esconde. */
export function leerSupresion(fila: unknown): Supresion | null {
  if (typeof fila !== 'object' || fila === null) return null
  const o = fila as Record<string, unknown>
  const id = cadena(o.id)
  const identidadId = cadena(o.identidadId)
  const recibidaEn = cadena(o.recibidaEn)
  const fechaLimite = cadena(o.fechaLimite)
  const estado = cadena(o.estado)
  const plazo = cadena(o.plazo)
  const dias = entero(o.diasRestantes)
  if (!id || !identidadId || !recibidaEn || !fechaLimite || !estado || !plazo || dias === null) return null
  // Un estado o un plazo fuera del vocabulario es una fila que no entendemos.
  // NO se cae a un valor por defecto: caer a `recibida`/`en_plazo` la pintaría
  // como tranquila, que es exactamente el error que no se puede cometer aquí.
  if (!ESTADOS.has(estado)) return null
  if (!(PLAZOS as readonly string[]).includes(plazo)) return null
  return {
    id,
    identidadId,
    clienteId: cadena(o.clienteId),
    recibidaEn,
    estado: estado as SupresionEstado,
    plazo: plazo as EstadoPlazo,
    fechaLimite,
    diasRestantes: dias,
    prorrogadaEn: cadena(o.prorrogadaEn),
    prorrogaMotivo: cadena(o.prorrogaMotivo),
    resueltaEn: cadena(o.resueltaEn),
    respuesta: cadena(o.respuesta),
    resueltaPor: cadena(o.resueltaPor),
    motivo: cadena(o.motivo),
    versionTextos: cadena(o.versionTextos) ?? '',
  }
}

function leerAlcance(fila: unknown): AlcanceSupresion | null {
  if (typeof fila !== 'object' || fila === null) return null
  const o = fila as Record<string, unknown>
  const que = cadena(o.que)
  const motivo = cadena(o.motivo)
  const trato = cadena(o.trato)
  if (!que || !motivo || (trato !== 'suprimible' && trato !== 'conservado')) return null
  return { que, trato, motivo }
}

/**
 * La lectura de `GET /api/operador/supresiones`.
 *
 * 🚨 Ningún fallo puede acabar en un `ok` con la cola vacía: «no se ha podido
 * mirar» y «no hay solicitudes» son cosas distintas, y colapsarlas deja un plazo
 * legal corriendo mientras la pantalla dice que no hay nada que hacer.
 */
export type RespuestaSupresiones =
  | {
      estado: 'ok'
      solicitudes: Supresion[]
      /** Filas con forma rara. Se declaran; no se esconden. */
      ilegibles: number
      alcance: AlcanceSupresion[]
    }
  | { estado: 'sin_configurar' }
  /** asegura respondió 404: la versión desplegada aún no sirve esta ruta. Tampoco es «no hay». */
  | { estado: 'no_encontrado' }
  | { estado: 'error'; motivo: string }

export function interpretarSupresiones(status: number, json: unknown): RespuestaSupresiones {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (status === 200) {
    if (o.estado === 'error') {
      return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? 'asegura_error' }
    }
    // Un 200 sin lista NO es una cola vacía: es una respuesta que no se
    // entiende, y decir «no hay solicitudes» sobre ella sería inventarse el dato.
    if (!Array.isArray(o.solicitudes)) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const solicitudes: Supresion[] = []
    let ilegibles = 0
    for (const fila of o.solicitudes) {
      const s = leerSupresion(fila)
      if (s === null) ilegibles++
      else solicitudes.push(s)
    }
    const alcance = Array.isArray(o.alcance)
      ? o.alcance.map(leerAlcance).filter((a): a is AlcanceSupresion => a !== null)
      : []
    return { estado: 'ok', solicitudes, ilegibles, alcance }
  }
  return {
    estado: 'error',
    motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}`,
  }
}

/**
 * La lectura de `POST /api/operador/supresiones`.
 *
 * `invalido` es «no se hizo, y por esto» (falta la respuesta escrita, falta el
 * motivo de la prórroga); `error` es «no se pudo hacer». Se separan porque
 * mandan a hacer cosas distintas: al primero se le completa lo que falta, al
 * segundo se mira el puerto.
 */
export type RespuestaEscrituraSupresion =
  | { estado: 'ok'; solicitud: Supresion | null }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'no_encontrado' }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export function interpretarEscrituraSupresion(status: number, json: unknown): RespuestaEscrituraSupresion {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const motivo = cadena(o.error) ?? cadena(o.motivo) ?? cadena(o.causa)
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (status === 400 || status === 422) return { estado: 'invalido', motivo: motivo ?? 'datos_invalidos' }
  if (status === 200 && o.estado !== 'error') return { estado: 'ok', solicitud: leerSupresion(o.solicitud) }
  return { estado: 'error', motivo: motivo ?? `HTTP ${status}` }
}

/**
 * Las que todavía tienen el reloj corriendo. Es lo que cuenta como trabajo
 * pendiente: `resuelta` incluye denegada y retirada — las tres son «ya
 * contestada», aunque la respuesta fuera que no.
 */
export function pendientes(lista: readonly Supresion[]): Supresion[] {
  return lista.filter((s) => s.plazo !== 'resuelta')
}

/**
 * 🚨 El ÚNICO número que autoriza a decir «hay un plazo incumplido». Va aparte
 * del total a propósito: un contador que sume vencidas y en plazo esconde la
 * única cifra por la que responde Alberto ante la AEPD.
 */
export function vencidas(lista: readonly Supresion[]): Supresion[] {
  return lista.filter((s) => s.plazo === 'vencido')
}

/** Motivo del puerto → castellano de pantalla. Los que ya son frase se dejan. */
export function textoMotivoSupresion(motivo: string): string {
  switch (motivo) {
    case 'secreto_rechazado':
      return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).'
    case 'respuesta_ilegible':
      return 'la respuesta de asegura no tenía la forma esperada.'
    case 'asegura_error':
      return 'asegura respondió, pero no pudo leer las solicitudes en su base de datos.'
    case 'red':
      return 'no se pudo llegar a asegura (timeout, DNS o TLS).'
    case 'sin_respuesta':
      return 'una solicitud no se puede dar por contestada sin decir QUÉ se le contestó: el art. 12.4 obliga a motivar la negativa, aunque sea parcial.'
    case 'sin_motivo_prorroga':
      return 'una prórroga hay que avisarla explicando por qué: prorrogar en silencio incumple igual que no contestar.'
    case 'ya_resuelta':
      return 'esa solicitud ya estaba contestada (alguien la movió antes). Recarga la página.'
    case 'datos_invalidos':
      return 'asegura no ha aceptado los datos.'
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

/** `GET /api/operador/supresiones[?todas=1]` — la cola, ordenada por el reloj. */
export function supresionesAsegura(todas = false): Promise<Reenvio> {
  return llamar(`/api/operador/supresiones${todas ? '?todas=1' : ''}`, { method: 'GET' })
}

/** `POST /api/operador/supresiones` — contestarla o prorrogarla. */
export function resolverSupresionAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/supresiones', { method: 'POST', body: JSON.stringify(body) })
}
