/**
 * Vencimientos (carril de LEADS) y seguimiento de oportunidades de la
 * correduría, leídos del puerto de asegura. Esta app no toca la BD de la
 * correduría: `lib` puro para interpretar (testeable con `node --test`) y un
 * reenvío fino para la red, solo desde rutas API (el secreto no sale de ahí).
 *
 * Tres estados, como el resto del puerto: una lista vacía con `ok` es «no hay
 * leads en la ventana»; `sin_configurar` y `error` son «no se ha podido mirar»
 * y la pantalla lo dice como tal, nunca como «no hay nada».
 *
 * Lo que decide QUÉ canal se puede usar con cada lead (LSSI 21.2) vive en
 * `@central/module-seguros` (`canalLead`) y lo calcula asegura; aquí solo se
 * lee y se rotula.
 */

export type VentanaLead = 'menos_30' | '30_60' | '60_90' | 'mas_90'
export type CanalLead = 'telefono_y_correo' | 'solo_telefono' | 'solo_correo' | 'sin_canal_permitido'
export type AccionPaso = 'esperar' | 'primer_contacto' | 'recordatorio' | 'llamada' | 'aparcar'
export type EstadoOportunidad = 'competencia' | 'en_negociacion' | 'pendiente_cliente' | 'ganada' | 'perdida'

export type LeadVencimiento = {
  oportunidadId: string
  estado: EstadoOportunidad
  clienteId: string
  cliente: string
  ramo: string
  aseguradora: string | null
  /** `null` = no consta: nunca se pinta 0,00€. */
  prima: number | null
  vencimientoEstimado: string
  dias: number
  ventana: VentanaLead
  telefono: string | null
  email: string | null
  intentos: number
  ultimoContactoEn: string | null
  respondioAntes: boolean
  /** `null` = asegura todavía no lo manda (versión anterior): el canal no se puede afirmar. */
  fueCliente: boolean | null
  canal: CanalLead | null
  puntuacion: number
  paso: { accion: AccionPaso; motivo: string; dentroDeDias: number }
}

export type LeadsVencimientos =
  | {
      estado: 'ok'
      leads: LeadVencimiento[]
      porVentana: Record<VentanaLead, number>
      /** `null` = asegura no lo cuenta todavía. */
      sinCanalPermitido: number | null
      ilegibles: number
      truncado: boolean
      /** Filas del puerto que no tenían la forma esperada: se cuentan, no se inventan. */
      descartadas: number
    }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

const VENTANAS: readonly VentanaLead[] = ['menos_30', '30_60', '60_90', 'mas_90']
const CANALES: readonly CanalLead[] = ['telefono_y_correo', 'solo_telefono', 'solo_correo', 'sin_canal_permitido']
const ACCIONES_PASO: readonly AccionPaso[] = ['esperar', 'primer_contacto', 'recordatorio', 'llamada', 'aparcar']
const ESTADOS: readonly EstadoOportunidad[] = ['competencia', 'en_negociacion', 'pendiente_cliente', 'ganada', 'perdida']

function objeto(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function uno<T extends string>(lista: readonly T[], v: unknown): T | null {
  return lista.find((x) => x === v) ?? null
}

export function interpretarLead(v: unknown): LeadVencimiento | null {
  const o = objeto(v)
  if (!o) return null
  const oportunidadId = texto(o.oportunidadId)
  const clienteId = texto(o.clienteId)
  const estado = uno(ESTADOS, o.estado)
  const venc = texto(o.vencimientoEstimado)
  const dias = numero(o.dias)
  const ventana = uno(VENTANAS, o.ventana)
  const p = objeto(o.siguientePaso)
  const accion = p ? uno(ACCIONES_PASO, p.accion) : null
  if (!oportunidadId || !clienteId || !estado || !venc || dias === null || !ventana || !p || !accion) return null
  return {
    oportunidadId,
    estado,
    clienteId,
    cliente: texto(o.cliente) ?? '(sin nombre)',
    ramo: texto(o.ramo) ?? 'otro',
    aseguradora: texto(o.aseguradora),
    prima: numero(o.prima),
    vencimientoEstimado: venc,
    dias,
    ventana,
    telefono: texto(o.telefono),
    email: texto(o.email),
    intentos: numero(o.intentos) ?? 0,
    ultimoContactoEn: texto(o.ultimoContactoEn),
    respondioAntes: o.respondioAntes === true,
    fueCliente: typeof o.fueCliente === 'boolean' ? o.fueCliente : null,
    canal: uno(CANALES, o.canal),
    puntuacion: numero(o.puntuacion) ?? 0,
    paso: { accion, motivo: texto(p.motivo) ?? '', dentroDeDias: numero(p.dentroDeDias) ?? 0 },
  }
}

export function interpretarLeads(status: number, json: unknown): LeadsVencimientos {
  const o = objeto(json)
  if (o?.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || !o || o.estado !== 'ok' || !Array.isArray(o.leads)) {
    return { estado: 'error', motivo: texto(o?.causa) ?? texto(o?.motivo) ?? `HTTP ${status}` }
  }
  const leads: LeadVencimiento[] = []
  let descartadas = 0
  for (const f of o.leads) {
    const l = interpretarLead(f)
    if (l) leads.push(l)
    else descartadas++
  }
  const pv = objeto(o.porVentana)
  const porVentana = { menos_30: 0, '30_60': 0, '60_90': 0, mas_90: 0 } as Record<VentanaLead, number>
  for (const v of VENTANAS) porVentana[v] = numero(pv?.[v]) ?? 0
  return {
    estado: 'ok',
    leads,
    porVentana,
    sinCanalPermitido: numero(o.sinCanalPermitido),
    ilegibles: numero(o.ilegibles) ?? 0,
    truncado: o.truncado === true,
    descartadas,
  }
}

// ─── Una oportunidad ─────────────────────────────────────────────────────────

export type Oportunidad = {
  id: string
  clienteId: string
  ramo: string | null
  estado: EstadoOportunidad
  fechaFinVigencia: string | null
  motivoPerdida: string | null
  competidor: string | null
  primaCompetidor: number | null
  aparcadaHasta: string | null
  cerradaAt: string | null
}
export type TareaSeguimiento = {
  id: string
  tipo: string
  prioridad: string
  estado: string
  observaciones: string
  fechaLimite: string | null
}
export type EntradaHistorial = { accion: string; estadoAntes: string | null; estadoDespues: string | null; actor: string; fecha: string }

export type LecturaOportunidad =
  | {
      estado: 'ok'
      oportunidad: Oportunidad
      /** `null` = asegura todavía no manda el contexto. */
      cliente: string | null
      aseguradora: string | null
      fueCliente: boolean | null
      tareas: TareaSeguimiento[]
      historial: EntradaHistorial[]
    }
  | { estado: 'no_encontrado' }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export function interpretarOportunidad(status: number, json: unknown): LecturaOportunidad {
  const o = objeto(json)
  if (status === 404 || o?.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (o?.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const op = objeto(o?.oportunidad)
  const id = texto(op?.id)
  const clienteId = texto(op?.clienteId)
  const estado = uno(ESTADOS, op?.estado)
  if (status !== 200 || o?.estado !== 'ok' || !op || !id || !clienteId || !estado) {
    return { estado: 'error', motivo: texto(o?.causa) ?? texto(o?.motivo) ?? `HTTP ${status}` }
  }
  const ctx = objeto(o?.contexto)
  const tareas: TareaSeguimiento[] = []
  for (const t of Array.isArray(o?.tareas) ? o.tareas : []) {
    const r = objeto(t)
    const tid = texto(r?.id)
    if (!r || !tid) continue
    tareas.push({
      id: tid,
      tipo: texto(r.tipo) ?? 'tarea',
      prioridad: texto(r.prioridad) ?? 'media',
      estado: texto(r.estado) ?? 'pendiente',
      observaciones: typeof r.observaciones === 'string' ? r.observaciones : '',
      fechaLimite: texto(r.fechaLimite),
    })
  }
  const historial: EntradaHistorial[] = []
  for (const h of Array.isArray(o?.historial) ? o.historial : []) {
    const r = objeto(h)
    const fecha = texto(r?.fecha)
    if (!r || !fecha) continue
    historial.push({
      accion: texto(r.accion) ?? '?',
      estadoAntes: texto(r.estadoAntes),
      estadoDespues: texto(r.estadoDespues),
      actor: texto(r.actor) ?? '—',
      fecha,
    })
  }
  return {
    estado: 'ok',
    oportunidad: {
      id,
      clienteId,
      ramo: texto(op.ramo),
      estado,
      fechaFinVigencia: texto(op.fechaFinVigencia),
      motivoPerdida: texto(op.motivoPerdida),
      competidor: texto(op.competidor),
      primaCompetidor: numero(op.primaCompetidor),
      aparcadaHasta: texto(op.aparcadaHasta),
      cerradaAt: texto(op.cerradaAt),
    },
    cliente: ctx ? texto(ctx.cliente) : null,
    aseguradora: ctx ? texto(ctx.aseguradora) : null,
    fueCliente: ctx && typeof ctx.fueCliente === 'boolean' ? ctx.fueCliente : null,
    tareas,
    historial,
  }
}

// ─── Rótulos ─────────────────────────────────────────────────────────────────

export const ROTULO_VENTANA: Record<VentanaLead, string> = {
  menos_30: '< 30 d',
  '30_60': '30–60 d',
  '60_90': '60–90 d',
  mas_90: '> 90 d',
}

/** `null` = no se sabe (asegura antigua): se dice, no se afirma «solo teléfono». */
export function rotuloCanal(c: CanalLead | null): string {
  switch (c) {
    case 'telefono_y_correo': return 'Teléfono y correo'
    case 'solo_telefono': return 'Solo teléfono'
    case 'solo_correo': return 'Solo correo'
    case 'sin_canal_permitido': return 'Sin canal permitido'
    default: return 'Canal sin comprobar'
  }
}

export const ROTULO_ESTADO: Record<EstadoOportunidad, string> = {
  competencia: 'Por contactar',
  en_negociacion: 'Interesado',
  pendiente_cliente: 'Propuesta enviada',
  ganada: 'Ganada',
  perdida: 'Perdida',
}

/** Los ocho motivos de `MOTIVOS_PERDIDA` (module-seguros), en castellano de pantalla. Mismo orden. */
export const MOTIVOS_PERDIDA_UI: readonly { valor: string; rotulo: string }[] = [
  { valor: 'precio', rotulo: 'Precio' },
  { valor: 'competidor', rotulo: 'Se va con otra compañía' },
  { valor: 'coberturas', rotulo: 'Coberturas' },
  { valor: 'cliente_desiste', rotulo: 'Ya no lo necesita' },
  { valor: 'sin_respuesta', rotulo: 'No responde' },
  { valor: 'no_contactable', rotulo: 'No se le puede contactar' },
  { valor: 'ya_asegurado', rotulo: 'Ya lo tiene asegurado' },
  { valor: 'otro', rotulo: 'Otro (explica cuál)' },
]

export const TIPOS_TAREA_UI: readonly { valor: string; rotulo: string }[] = [
  { valor: 'llamada', rotulo: 'Llamada' },
  { valor: 'email', rotulo: 'Correo' },
  { valor: 'whatsapp', rotulo: 'WhatsApp' },
  { valor: 'tarea', rotulo: 'Tarea' },
]

// ─── Red (solo desde rutas API de plataforma) ────────────────────────────────

export type Reenvio = { status: number; json: unknown }

async function llamar(path: string, init: RequestInit): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secret}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

export function leadsCompetenciaAsegura(dias: number): Promise<Reenvio> {
  return llamar(`/api/operador/leads-competencia?dias=${dias}`, { method: 'GET' })
}
export function oportunidadAsegura(id: string): Promise<Reenvio> {
  return llamar(`/api/operador/oportunidad?id=${encodeURIComponent(id)}`, { method: 'GET' })
}
export function accionOportunidadAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/oportunidad', { method: 'POST', body: JSON.stringify(body) })
}
export function crearTareaAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/oportunidad/tarea', { method: 'POST', body: JSON.stringify(body) })
}
export function cerrarTareaAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/oportunidad/tarea', { method: 'PATCH', body: JSON.stringify(body) })
}
