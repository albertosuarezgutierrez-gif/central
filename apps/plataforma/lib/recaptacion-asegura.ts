// La cola de recaptación de leads sin vencimiento (12/09/2026), leída del
// puerto de asegura (`/api/operador/recaptacion*`). Mismo patrón que
// `correduria-puerto.ts`: interpretación PURA (sin red, la prueba el client
// component) + las llamadas de red, que solo se invocan desde las rutas API.
//
// Ver docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md.

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

function booleano(v: unknown): boolean {
  return v === true
}

function origenLead(v: unknown): OrigenLeadRecaptacion {
  return v === 'vencimiento_antiguo' ? 'vencimiento_antiguo' : 'sin_vencimiento'
}

/** 1-12, o `null` si no es un mes válido (incluido cuando el origen es `sin_vencimiento`). */
function mes(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 12 ? v : null
}

// ── Cola ─────────────────────────────────────────────────────────────────────

/**
 * `sin_vencimiento` (Fase 1) = activa sin fecha a la que anclar el contacto.
 * `vencimiento_antiguo` (Fase 2, 20/09/2026) = venció hace años; el mes/día es
 * la pista de cuándo solía renovar. Un valor que el puerto no reconozca (o no
 * lo mande, versión vieja de asegura) cae a `sin_vencimiento`, el lado que ya
 * se trataba como "sin fecha a la que anclar" — nunca se inventa un mes.
 */
export type OrigenLeadRecaptacion = 'sin_vencimiento' | 'vencimiento_antiguo'

export type LeadRecaptacion = {
  clienteId: string
  polizaId: string
  cliente: string
  ramo: string
  ramoLegible: string
  aseguradoraAnterior: string | null
  numeroPoliza: string | null
  telefono: string | null
  email: string | null
  /** `null` = la compañía no informa la prima. NUNCA 0. */
  prima: number | null
  /** `true` = ya se contactó hace menos de 14 días; la pantalla ofrece "ver igualmente" para forzar. */
  enCooldown: boolean
  ultimoContactoEn: string | null
  origen: OrigenLeadRecaptacion
  /** Mes (1-12) del vencimiento antiguo. `null` cuando `origen==='sin_vencimiento'`. */
  mesVencimientoAntiguo: number | null
}

export type ContadoresRecaptacion = {
  totalCandidatos: number
  contactadosSemana: number
  conAperturaORespuestaSemana: number
  /** Acumulado total de emails (no solo la semana). `null` = no se pudo leer. */
  emailEnviadosTotal: number | null
  emailAbiertosTotal: number | null
}

/**
 * `causa` es la clasificación que hace `apps/asegura/lib/error-cartera.ts`
 * (credenciales/permisos/conexión/esquema/sin_correduria/otro) — mismo patrón
 * que `describirCausaAsegura()` de `correduria-puerto.ts`. `null` = asegura no
 * la mandó, NO "sin error": un `error` sin causa sigue siendo un error.
 */
export type Cola =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: 'secreto_rechazado' | 'asegura_error' | 'respuesta_ilegible' | 'red'; causa: string | null }
  | { estado: 'ok'; leads: LeadRecaptacion[]; contadores: ContadoresRecaptacion }

function leerLead(v: unknown): LeadRecaptacion | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const clienteId = cadena(o.clienteId)
  const polizaId = cadena(o.polizaId)
  const cliente = cadena(o.cliente)
  if (clienteId === null || polizaId === null || cliente === null) return null
  return {
    clienteId,
    polizaId,
    cliente,
    ramo: cadena(o.ramo) ?? 'otros',
    ramoLegible: cadena(o.ramoLegible) ?? 'sin ramo',
    aseguradoraAnterior: cadena(o.aseguradoraAnterior),
    numeroPoliza: cadena(o.numeroPoliza),
    telefono: cadena(o.telefono),
    email: cadena(o.email),
    prima: numero(o.prima),
    enCooldown: booleano(o.enCooldown),
    ultimoContactoEn: cadena(o.ultimoContactoEn),
    origen: origenLead(o.origen),
    mesVencimientoAntiguo: mes(o.mesVencimientoAntiguo),
  }
}

function leerContadores(v: unknown): ContadoresRecaptacion {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
  return {
    totalCandidatos: entero(o.totalCandidatos) ?? 0,
    contactadosSemana: entero(o.contactadosSemana) ?? 0,
    conAperturaORespuestaSemana: entero(o.conAperturaORespuestaSemana) ?? 0,
    emailEnviadosTotal: entero(o.emailEnviadosTotal),
    emailAbiertosTotal: entero(o.emailAbiertosTotal),
  }
}

export function interpretarCola(status: number, json: unknown): Cola {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado', causa: null }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible', causa: null }
  }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'error') return { estado: 'error', motivo: 'asegura_error', causa: cadena(r.causa) }
  if (r.estado !== 'ok' || !Array.isArray(r.leads)) {
    return { estado: 'error', motivo: 'respuesta_ilegible', causa: null }
  }
  const leads: LeadRecaptacion[] = []
  for (const fila of r.leads) {
    const l = leerLead(fila)
    if (l !== null) leads.push(l)
    // Una fila con forma rara se descarta en silencio, no invalida la cola
    // entera: es el mismo criterio que `interpretarPartes` con `ilegibles`,
    // pero aquí no hay dónde mostrar el contador (no cambia el trabajo de
    // Alberto: sigue viendo el resto de leads).
  }
  return { estado: 'ok', leads, contadores: leerContadores(r.contadores) }
}

// ── Agrupación por cliente ──────────────────────────────────────────────────
//
// El puerto da una fila por PÓLIZA: el mismo cliente con varios seguros
// (distintos ramos, o el mismo ramo repetido en el volcado) sale como varias
// filas con el mismo contacto. Alberto: «leads puede haber tenido varios
// seguros pero contacto es solo uno» — se agrupa por `clienteId` (la ficha,
// que YA es la identidad correcta: regla «por NIF/ficha, nunca por nombre»
// del CLAUDE.md — aquí no hay NIF en este feed, pero `clienteId` es la misma
// idea) para que el contacto (llamada/WhatsApp/email) sea uno por cliente, no
// uno por póliza. Dos `clienteId` distintos NUNCA se funden aquí, aunque
// compartan teléfono (podría ser un negocio con varios titulares).

export type GrupoLeadRecaptacion = {
  clienteId: string
  cliente: string
  telefono: string | null
  email: string | null
  polizas: LeadRecaptacion[]
  enCooldown: boolean
  ultimoContactoEn: string | null
  /** `true` si ALGUNA de sus pólizas es Fase 2 (vencimiento antiguo). */
  tieneVencimientoAntiguo: boolean
}

export function agruparLeadsPorCliente(leads: readonly LeadRecaptacion[]): GrupoLeadRecaptacion[] {
  const mapa = new Map<string, GrupoLeadRecaptacion>()
  for (const l of leads) {
    const existente = mapa.get(l.clienteId)
    if (existente) {
      existente.polizas.push(l)
      if (l.enCooldown) existente.enCooldown = true
      if (existente.telefono === null && l.telefono !== null) existente.telefono = l.telefono
      if (existente.email === null && l.email !== null) existente.email = l.email
      if (l.ultimoContactoEn !== null && (existente.ultimoContactoEn === null || l.ultimoContactoEn > existente.ultimoContactoEn)) {
        existente.ultimoContactoEn = l.ultimoContactoEn
      }
      if (l.origen === 'vencimiento_antiguo') existente.tieneVencimientoAntiguo = true
      continue
    }
    mapa.set(l.clienteId, {
      clienteId: l.clienteId,
      cliente: l.cliente,
      telefono: l.telefono,
      email: l.email,
      polizas: [l],
      enCooldown: l.enCooldown,
      ultimoContactoEn: l.ultimoContactoEn,
      tieneVencimientoAntiguo: l.origen === 'vencimiento_antiguo',
    })
  }
  return [...mapa.values()]
}

/** El motivo del puerto, en castellano de pantalla. */
export function textoMotivoCola(motivo: 'secreto_rechazado' | 'asegura_error' | 'respuesta_ilegible' | 'red', causa: string | null): string {
  switch (motivo) {
    case 'secreto_rechazado':
      return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).'
    case 'asegura_error':
      return causa
        ? `asegura respondió, pero no pudo leer la cartera (${causa}).`
        : 'asegura respondió, pero no pudo leer la cartera en central.'
    case 'respuesta_ilegible':
      return 'la respuesta de asegura no tenía la forma esperada.'
    case 'red':
      return 'no se pudo llegar a asegura (timeout, DNS o TLS).'
  }
}

// ── Escritura (whatsapp/email) ────────────────────────────────────────────────

export type EscrituraRecaptacion =
  | { estado: 'ok' }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'no_encontrado' }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export function interpretarEscrituraRecaptacion(status: number, json: unknown): EscrituraRecaptacion {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const motivo = cadena(o.motivo) ?? cadena(o.causa) ?? cadena(o.error)
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (status === 422 || o.estado === 'invalido') return { estado: 'invalido', motivo: motivo ?? 'datos_invalidos' }
  if (status === 200 && o.estado === 'ok') return { estado: 'ok' }
  return { estado: 'error', motivo: motivo ?? `HTTP ${status}` }
}

// ── Red (solo desde las rutas API de plataforma) ──────────────────────────────
//
// Mismo estilo que `urlAsegura()`/`pedir()` de `correduria-puerto.ts`: mismo
// env `ASEGURA_URL`/`ASEGURA_OPERADOR_SECRET`, `cache:'no-store'`, y
// `sin_configurar`/`red` como los dos huecos que no son "el puerto respondió
// con un error". Se generaliza a `pedirCon()` porque whatsapp/email son POST
// con cuerpo — el `pedir()` de `correduria-puerto.ts` es solo GET y añadirle
// método/body ahí habría que tocar ese fichero (y con él, todos sus usos
// existentes) para un caso que no necesitan.

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function pedirCon(path: string, init: RequestInit, timeoutMs: number = 8000): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

export async function colaRecaptacionAsegura(): Promise<Cola> {
  try {
    const r = await pedirCon('/api/operador/recaptacion', { method: 'GET' })
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarCola(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red', causa: null }
  }
}

export async function enviarWhatsappRecaptacionAsegura(body: {
  clienteId: string
  polizaId: string
  mensaje: string
  actor: string
}): Promise<EscrituraRecaptacion> {
  try {
    const r = await pedirCon('/api/operador/recaptacion/whatsapp', { method: 'POST', body: JSON.stringify(body) })
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarEscrituraRecaptacion(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

export async function enviarEmailRecaptacionAsegura(body: {
  clienteId: string
  polizaId: string
  email: string
  asunto: string
  texto: string
  actor: string
}): Promise<EscrituraRecaptacion> {
  try {
    const r = await pedirCon('/api/operador/recaptacion/email', { method: 'POST', body: JSON.stringify(body) })
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarEscrituraRecaptacion(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

// ── Envío en LOTE (cron diario) ───────────────────────────────────────────

export type LoteEmail =
  | { estado: 'ok'; candidatos: number; enviados: number; fallidos: number; detalleFallos: string[] }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export function interpretarLoteEmail(status: number, json: unknown): LoteEmail {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 200 && o.estado === 'ok') {
    return {
      estado: 'ok',
      candidatos: entero(o.candidatos) ?? 0,
      enviados: entero(o.enviados) ?? 0,
      fallidos: entero(o.fallidos) ?? 0,
      detalleFallos: Array.isArray(o.detalleFallos) ? o.detalleFallos.filter((x): x is string => typeof x === 'string') : [],
    }
  }
  const motivo = cadena(o.motivo) ?? cadena(o.causa) ?? cadena(o.error)
  return { estado: 'error', motivo: motivo ?? `HTTP ${status}` }
}

// Timeout largo a propósito: hasta ~25 envíos secuenciales por Resend, cada
// uno con su propio timeout interno de 15s en `enviarEmailResend` (asegura).
// Por encima del `maxDuration=120` de la ruta de asegura, para no cortar la
// petición antes de que la propia plataforma la corte por su cuenta.
const TIMEOUT_LOTE_MS = 130_000

export async function enviarLoteEmailRecaptacionAsegura(limite?: number): Promise<LoteEmail> {
  try {
    const r = await pedirCon('/api/operador/recaptacion/email-lote', { method: 'POST', body: JSON.stringify({ limite }) }, TIMEOUT_LOTE_MS)
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarLoteEmail(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}
