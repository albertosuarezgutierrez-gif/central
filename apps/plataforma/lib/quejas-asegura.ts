// El registro de QUEJAS Y RECLAMACIONES del Servicio de Atención al Cliente (SAC) de la
// correduría, leído y escrito desde la pantalla de Alberto.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 POR QUÉ ESTE FICHERO EXISTE: el portal y la web publican que el SAC contesta en UN MES
// desde que recibe la queja. Una queja que entra por correo o por teléfono y no se anota vence
// en silencio: nada falla y nadie se entera hasta que el cliente va a la DGSFP. Esta pantalla
// es donde se anota y donde se ve el reloj.
// ─────────────────────────────────────────────────────────────────────────────
//
// Dos partes, como en `supresiones-asegura.ts`:
//
//   1. Lo PURO: leer la cola y las respuestas de escritura tal como las manda asegura. Sin red
//      ni env, así que lo importa el client component y lo prueba
//      `test/regression-quejas-asegura.test.ts`.
//   2. La RED: las llamadas al puerto (`/api/operador/quejas`), solo desde las rutas API.
//
// La regla (plazo de un mes natural, estados, informe anual) vive en `@central/module-seguros`
// (`queja.ts`) y la aplica asegura; aquí solo se lee lo que asegura ya calculó.
import { cabecerasPuerto } from './puerto-actor.ts'

/**
 * ⚠️ Copias de las listas de `@central/module-seguros` (`queja.ts`), que NO es dependencia de
 * esta app. No quedan sueltas: `test/regression-quejas-asegura.test.ts` las compara con el
 * módulo y falla si divergen — si divergieran, el formulario ofrecería un valor que asegura
 * rechaza con 422, o la cola dejaría de pintar una queja con un estado nuevo.
 */
export const ESTADOS_QUEJA = [
  'recibida',
  'en_tramite',
  'resuelta_favorable',
  'resuelta_parcial',
  'resuelta_desfavorable',
  'desistida',
] as const
export type EstadoQueja = (typeof ESTADOS_QUEJA)[number]

export const ESTADOS_QUEJA_CERRADA: readonly EstadoQueja[] = [
  'resuelta_favorable',
  'resuelta_parcial',
  'resuelta_desfavorable',
  'desistida',
]
export const ESTADOS_QUEJA_RESUELTA: readonly EstadoQueja[] = [
  'resuelta_favorable',
  'resuelta_parcial',
  'resuelta_desfavorable',
]

export const CANALES_QUEJA = ['correo', 'telefono', 'presencial', 'carta', 'portal'] as const
export const MOTIVOS_QUEJA = [
  'siniestro',
  'cobro_recibo',
  'anulacion',
  'informacion',
  'atencion',
  'datos_personales',
  'otro',
] as const

export const ETIQUETA_ESTADO_QUEJA: Record<EstadoQueja, string> = {
  recibida: 'Recibida',
  en_tramite: 'En trámite',
  resuelta_favorable: 'Resuelta a favor del cliente',
  resuelta_parcial: 'Resuelta en parte',
  resuelta_desfavorable: 'Resuelta en contra',
  desistida: 'El cliente desiste',
}
export const ETIQUETA_MOTIVO_QUEJA: Record<(typeof MOTIVOS_QUEJA)[number], string> = {
  siniestro: 'Siniestro',
  cobro_recibo: 'Cobro o recibo',
  anulacion: 'Anulación o baja',
  informacion: 'Información recibida',
  atencion: 'Atención del corredor',
  datos_personales: 'Datos personales',
  otro: 'Otro',
}
export const ETIQUETA_CANAL_QUEJA: Record<(typeof CANALES_QUEJA)[number], string> = {
  correo: 'Correo electrónico',
  telefono: 'Teléfono',
  presencial: 'En persona',
  carta: 'Carta',
  portal: 'Portal del cliente',
}

export const PLAZOS_QUEJA = ['cerrada', 'en_plazo', 'urgente', 'vencida'] as const
export type PlazoQueja = (typeof PLAZOS_QUEJA)[number]

export type Queja = {
  id: string
  clienteId: string | null
  clienteNombre: string | null
  polizaId: string | null
  numeroPoliza: string | null
  reclamante: string
  canal: string
  motivo: string
  /** `null` con `detalleIlegible` = la clave no lo abre; NO es «sin detalle». */
  detalle: string | null
  detalleIlegible: boolean
  recibidaEl: string
  plazoEl: string
  estado: EstadoQueja
  /** `null` = asegura no pudo calcularlo (fecha rara). No se supone «en plazo». */
  plazo: PlazoQueja | null
  /** Negativo si ya venció; `null` en las cerradas. NO se colapsa a 0. */
  diasRestantes: number | null
  respuesta: string | null
  resueltaEl: string | null
  creadaPor: string
}

export type InformeSac = {
  año: number
  total: number
  abiertas: number
  cerradasEnPlazo: number
  cerradasFueraDePlazo: number
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null
}

/** Una fila del puerto. `null` = llegó con forma rara → se cuenta como ilegible, no se tira. */
export function leerQueja(fila: unknown): Queja | null {
  if (typeof fila !== 'object' || fila === null) return null
  const o = fila as Record<string, unknown>
  const id = cadena(o.id)
  const reclamante = cadena(o.reclamante)
  const recibidaEl = cadena(o.recibidaEl)
  const plazoEl = cadena(o.plazoEl)
  const estado = cadena(o.estado)
  if (!id || !reclamante || !recibidaEl || !plazoEl || !estado) return null
  // Un estado fuera del vocabulario es una fila que no entendemos: NO cae a «recibida».
  if (!(ESTADOS_QUEJA as readonly string[]).includes(estado)) return null
  const plazo = cadena(o.plazo)
  return {
    id,
    clienteId: cadena(o.clienteId),
    clienteNombre: cadena(o.clienteNombre),
    polizaId: cadena(o.polizaId),
    numeroPoliza: cadena(o.numeroPoliza),
    reclamante,
    canal: cadena(o.canal) ?? '',
    motivo: cadena(o.motivo) ?? '',
    detalle: cadena(o.detalle),
    detalleIlegible: o.detalleIlegible === true,
    recibidaEl,
    plazoEl,
    estado: estado as EstadoQueja,
    // Un plazo desconocido queda en null («no se sabe»), nunca en «en_plazo».
    plazo: plazo && (PLAZOS_QUEJA as readonly string[]).includes(plazo) ? (plazo as PlazoQueja) : null,
    diasRestantes: entero(o.diasRestantes),
    respuesta: cadena(o.respuesta),
    resueltaEl: cadena(o.resueltaEl),
    creadaPor: cadena(o.creadaPor) ?? '',
  }
}

function leerInforme(v: unknown): InformeSac | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const año = entero(o['año'])
  const total = entero(o.total)
  const abiertas = entero(o.abiertas)
  const enPlazo = entero(o.cerradasEnPlazo)
  const fuera = entero(o.cerradasFueraDePlazo)
  if (año === null || total === null || abiertas === null || enPlazo === null || fuera === null) return null
  return { año, total, abiertas, cerradasEnPlazo: enPlazo, cerradasFueraDePlazo: fuera }
}

/**
 * La lectura de `GET /api/operador/quejas`.
 *
 * 🚨 Ningún fallo acaba en un `ok` con la cola vacía: «no se ha podido mirar» y «no hay quejas»
 * son cosas distintas, y la segunda es la que deja un plazo corriendo sin que nadie lo vea.
 */
export type RespuestaQuejas =
  | {
      estado: 'ok'
      quejas: Queja[]
      /** Filas con forma rara. Se declaran; no se esconden. */
      ilegibles: number
      /** `null` = asegura no mandó el informe con forma legible. */
      informe: InformeSac | null
    }
  | { estado: 'sin_configurar' }
  | { estado: 'no_desplegado' }
  | { estado: 'error'; motivo: string }

export function interpretarColaQuejas(status: number, json: unknown): RespuestaQuejas {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  // 404 en un GET = la versión desplegada de asegura aún no sirve la ruta.
  if (status === 404) return { estado: 'no_desplegado' }
  if (status === 200 && o.estado === 'ok') {
    if (!Array.isArray(o.quejas)) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const quejas: Queja[] = []
    let ilegibles = 0
    for (const fila of o.quejas) {
      const q = leerQueja(fila)
      if (q === null) ilegibles++
      else quejas.push(q)
    }
    return { estado: 'ok', quejas, ilegibles, informe: leerInforme(o.informe) }
  }
  return {
    estado: 'error',
    motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? (status === 200 ? 'respuesta_ilegible' : `HTTP ${status}`),
  }
}

/** La lectura de `POST` (alta) o `PATCH` (cambio de estado) de `/api/operador/quejas`. */
export type RespuestaEscrituraQueja =
  | { estado: 'ok'; queja: Queja | null }
  | { estado: 'invalida'; motivos: string[] }
  | { estado: 'no_encontrada'; motivo: string | null }
  | { estado: 'no_permitida'; motivo: string }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export function interpretarEscrituraQueja(status: number, json: unknown): RespuestaEscrituraQueja {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if ((status === 200 || status === 201) && (o.estado === 'creada' || o.estado === 'hecho')) {
    return { estado: 'ok', queja: leerQueja(o.queja) }
  }
  if (status === 422 || o.estado === 'invalida') {
    const lista = Array.isArray(o.motivos) ? o.motivos.filter((m): m is string => typeof m === 'string') : []
    const uno = cadena(o.motivo) ?? cadena(o.error)
    return { estado: 'invalida', motivos: lista.length ? lista : [uno ?? 'Datos no válidos.'] }
  }
  if (status === 409 || o.estado === 'no_permitida') {
    return { estado: 'no_permitida', motivo: cadena(o.motivo) ?? 'La queja cambió mientras tanto; recarga.' }
  }
  if (status === 404 || o.estado === 'no_encontrada') return { estado: 'no_encontrada', motivo: cadena(o.motivo) }
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

/** Las que tienen el reloj corriendo. Una con plazo `null` también: no se sabe, así que cuenta. */
export function quejasAbiertas(lista: readonly Queja[]): Queja[] {
  return lista.filter((q) => !ESTADOS_QUEJA_CERRADA.includes(q.estado))
}

/** El ÚNICO número que autoriza a decir «hay un plazo incumplido». */
export function quejasVencidas(lista: readonly Queja[]): Queja[] {
  return quejasAbiertas(lista).filter((q) => q.plazo === 'vencida')
}

/**
 * Lo que sube al contador de «Hoy»: abiertas + ilegibles. `null` si no se ha podido leer —un 0
 * ahí diría «no hay nadie esperando respuesta»—.
 */
export function contadorQuejas(r: RespuestaQuejas): number | null {
  if (r.estado !== 'ok') return null
  return quejasAbiertas(r.quejas).length + r.ilegibles
}

/** Motivo del puerto → castellano de pantalla. */
export function textoMotivoQueja(motivo: string): string {
  switch (motivo) {
    case 'secreto_rechazado':
      return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos)'
    case 'respuesta_ilegible':
      return 'la respuesta de asegura no tenía la forma esperada'
    case 'red':
      return 'no se pudo llegar a asegura (timeout, DNS o TLS)'
    case 'credenciales':
      return 'asegura no puede entrar en su base de datos (contraseña del rol)'
    case 'permisos':
      return 'el rol de asegura no tiene permiso sobre la tabla de quejas'
    case 'conexion':
      return 'asegura no llega a su base de datos'
    case 'esquema':
      return 'falta la tabla de quejas en la base de datos'
    default:
      return motivo
  }
}

// ─── Red (solo desde las rutas API de plataforma) ────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export type Reenvio = { status: number; json: unknown }

async function llamar(path: string, init: RequestInit): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}${path}`, {
      ...init,
      headers: { ...(await cabecerasPuerto(secret)), ...(init.body ? { 'content-type': 'application/json' } : {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

/** `GET /api/operador/quejas[?todas=1]` — la cola, ordenada por el reloj. */
export function quejasAsegura(todas = false): Promise<Reenvio> {
  return llamar(`/api/operador/quejas${todas ? '?todas=1' : ''}`, { method: 'GET' })
}

/** `POST /api/operador/quejas` — registrar una queja recibida. */
export function registrarQuejaAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/quejas', { method: 'POST', body: JSON.stringify(body) })
}

/** `PATCH /api/operador/quejas` — pasar a trámite, resolver o desistir. */
export function cambiarQuejaAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/quejas', { method: 'PATCH', body: JSON.stringify(body) })
}
