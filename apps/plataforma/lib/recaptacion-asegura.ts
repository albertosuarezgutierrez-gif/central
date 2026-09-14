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

// ── Cola ─────────────────────────────────────────────────────────────────────

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
}

export type ContadoresRecaptacion = {
  totalCandidatos: number
  contactadosSemana: number
  conAperturaORespuestaSemana: number
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
  }
}

function leerContadores(v: unknown): ContadoresRecaptacion {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
  return {
    totalCandidatos: entero(o.totalCandidatos) ?? 0,
    contactadosSemana: entero(o.contactadosSemana) ?? 0,
    conAperturaORespuestaSemana: entero(o.conAperturaORespuestaSemana) ?? 0,
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

async function pedirCon(path: string, init: RequestInit): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
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
