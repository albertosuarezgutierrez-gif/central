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

import {
  MOTIVOS_PERDIDA,
  TIPOS_TAREA,
  type CanalLead,
  type EstadoOportunidad,
  type MotivoPerdida,
  type PasoLead,
  type TipoTarea,
  type VentanaLead,
} from '@central/module-seguros'

export type { CanalLead, EstadoOportunidad, VentanaLead }
export type AccionPaso = PasoLead['accion']

export type LeadVencimiento = {
  oportunidadId: string
  estado: EstadoOportunidad
  clienteId: string
  /** `null` = la ficha no tiene nombre legible: se dice, no se inventa. */
  cliente: string | null
  ramo: string | null
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
const ACCIONES_PASO: readonly AccionPaso[] = ['esperar', 'primer_contacto', 'recordatorio', 'llamada', 'aparcar', 'tarea']
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
  const dentroDeDias = p ? numero(p.dentroDeDias) : null
  const intentos = numero(o.intentos)
  const puntuacion = numero(o.puntuacion)
  // Lo que asegura calcula siempre es obligatorio: si falta, la fila está rota
  // y se cuenta como descartada. Un 0 inventado pintaría «0 de 3 intentos» o
  // una prioridad falsa sobre un lead del que no se sabe nada.
  if (!oportunidadId || !clienteId || !estado || !venc || dias === null || !ventana || !p || !accion) return null
  if (dentroDeDias === null || intentos === null || puntuacion === null) return null
  return {
    oportunidadId,
    estado,
    clienteId,
    cliente: texto(o.cliente),
    ramo: texto(o.ramo),
    aseguradora: texto(o.aseguradora),
    prima: numero(o.prima),
    vencimientoEstimado: venc,
    dias,
    ventana,
    telefono: texto(o.telefono),
    email: texto(o.email),
    intentos,
    ultimoContactoEn: texto(o.ultimoContactoEn),
    respondioAntes: o.respondioAntes === true,
    fueCliente: typeof o.fueCliente === 'boolean' ? o.fueCliente : null,
    canal: uno(CANALES, o.canal),
    puntuacion,
    paso: { accion, motivo: texto(p.motivo) ?? '', dentroDeDias },
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
  estado: 'pendiente' | 'cerrada'
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
      /** Tareas del puerto sin la forma esperada: se cuentan, no se pintan como «pendiente». */
      tareasDescartadas: number
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
  let tareasDescartadas = 0
  for (const t of Array.isArray(o?.tareas) ? o.tareas : []) {
    const r = objeto(t)
    const tid = texto(r?.id)
    const tipo = texto(r?.tipo)
    const prioridad = texto(r?.prioridad)
    const est = r?.estado === 'pendiente' || r?.estado === 'cerrada' ? r.estado : null
    // Sin estado no se sabe si está hecha: suponer «pendiente» la pintaría como trabajo por hacer.
    if (!r || !tid || !tipo || !prioridad || !est) { tareasDescartadas++; continue }
    tareas.push({
      id: tid,
      tipo,
      prioridad,
      estado: est,
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
    tareasDescartadas,
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

const ROTULO_MOTIVO: Record<MotivoPerdida, string> = {
  precio: 'Precio',
  competidor: 'Se va con otra compañía',
  coberturas: 'Coberturas',
  cliente_desiste: 'Ya no lo necesita',
  sin_respuesta: 'No responde',
  no_contactable: 'No se le puede contactar',
  ya_asegurado: 'Ya lo tiene asegurado',
  otro: 'Otro (explica cuál)',
}
/** Los motivos del módulo, en su orden: un motivo nuevo sin rótulo no compila. */
export const MOTIVOS_PERDIDA_UI: readonly { valor: MotivoPerdida; rotulo: string }[] =
  MOTIVOS_PERDIDA.map((valor) => ({ valor, rotulo: ROTULO_MOTIVO[valor] }))

const ROTULO_TIPO_TAREA: Record<TipoTarea, string> = { llamada: 'Llamada', email: 'Correo', whatsapp: 'WhatsApp', tarea: 'Tarea' }
export const TIPOS_TAREA_UI: readonly { valor: TipoTarea; rotulo: string }[] =
  TIPOS_TAREA.map((valor) => ({ valor, rotulo: ROTULO_TIPO_TAREA[valor] }))

/**
 * Prima tecleada en formato español. Solo se aceptan formas sin ambigüedad:
 * «1.200» es mil doscientos, nunca 1,2; «1200», «1.200,50», «412,5» y «412.50»
 * también. Lo que no encaja es `'invalido'`, no un número plausible.
 */
export function parsearPrima(t: string): number | null | 'invalido' {
  const s = t.trim().replace(/\s*€$/, '')
  if (s === '') return null
  let n: number
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'))
  else if (/^\d+(,\d{1,2})?$/.test(s)) n = Number(s.replace(',', '.'))
  else if (/^\d+\.\d{1,2}$/.test(s)) n = Number(s)
  else return 'invalido'
  return n > 0 && n < 1_000_000 ? n : 'invalido'
}

// ─── Tareas de hoy (cockpit «Hoy») ──────────────────────────────────────────

export type TareaDeHoy = {
  id: string
  tipo: string
  prioridad: string
  observaciones: string
  fechaLimite: string
  oportunidadId: string
  clienteId: string
  cliente: string | null
  ramo: string | null
}

export type TareasDeHoy =
  | { estado: 'ok'; tareas: TareaDeHoy[]; truncado: boolean; descartadas: number }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export function interpretarTareasHoy(status: number, json: unknown): TareasDeHoy {
  const o = objeto(json)
  if (o?.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || !o || o.estado !== 'ok' || !Array.isArray(o.tareas)) {
    return { estado: 'error', motivo: texto(o?.causa) ?? texto(o?.motivo) ?? `HTTP ${status}` }
  }
  const tareas: TareaDeHoy[] = []
  let descartadas = 0
  for (const t of o.tareas) {
    const r = objeto(t)
    const id = texto(r?.id)
    const tipo = texto(r?.tipo)
    const prioridad = texto(r?.prioridad)
    const fechaLimite = texto(r?.fechaLimite)
    const oportunidadId = texto(r?.oportunidadId)
    const clienteId = texto(r?.clienteId)
    if (!r || !id || !tipo || !prioridad || !fechaLimite || !oportunidadId || !clienteId) { descartadas++; continue }
    tareas.push({
      id, tipo, prioridad, fechaLimite, oportunidadId, clienteId,
      observaciones: typeof r.observaciones === 'string' ? r.observaciones : '',
      cliente: texto(r.cliente),
      ramo: texto(r.ramo),
    })
  }
  return { estado: 'ok', tareas, truncado: o.truncado === true, descartadas }
}

// ─── Modo llamada ────────────────────────────────────────────────────────────

/** Lo que toca por TELÉFONO hoy: una tarea que no es llamada o un correo no entran aquí. */
const ACCIONES_POR_TELEFONO: readonly AccionPaso[] = ['primer_contacto', 'recordatorio', 'llamada']

/**
 * La cola de llamadas de hoy, en el orden de la lista (probabilidad × prima).
 * Solo quien se puede llamar (teléfono y canal que lo permite) y a quien le
 * toca ya: un primer contacto a quien se le puede escribir va por correo, no aquí.
 */
export function colaLlamadas(leads: readonly LeadVencimiento[]): LeadVencimiento[] {
  return leads.filter((l) => {
    if (l.telefono === null || (l.canal !== 'solo_telefono' && l.canal !== 'telefono_y_correo')) return false
    if (!ACCIONES_POR_TELEFONO.includes(l.paso.accion) || l.paso.dentroDeDias > 0) return false
    // Con correo permitido, el primer contacto y el recordatorio van por correo.
    if (l.canal === 'telefono_y_correo' && l.paso.accion !== 'llamada') return false
    return true
  })
}

/** Guion corto de la llamada, con lo que se sabe del lead. Lo que no consta no se inventa. */
export function guionLlamada(l: LeadVencimiento): string[] {
  const ramo = l.ramo ?? 'su seguro'
  const donde = l.aseguradora ? ` con ${l.aseguradora}` : ''
  return [
    l.fueCliente === true
      ? 'Soy Alberto, de Grupo ASegura: hace unos años le llevamos un seguro.'
      : 'Soy Alberto, de Grupo ASegura, correduría de seguros en Sevilla.',
    `¿Sigue con ${l.ramo ? `el seguro de ${ramo}` : ramo}${donde}? ¿Cuándo le renueva? (tenemos ~${l.vencimientoEstimado}, sin confirmar)`,
    'Le preparo una comparativa sin compromiso antes de esa fecha.',
    'Si dice que sí: pedir su correo y permiso para enviársela.',
  ]
}

export const RESULTADOS_LLAMADA_UI = [
  { valor: 'quiere_precio', rotulo: 'Quiere precio' },
  { valor: 'otro_dia', rotulo: 'Llamar otro día' },
  { valor: 'no_contesta', rotulo: 'No contesta' },
  { valor: 'no_interesa', rotulo: 'No le interesa' },
] as const
export type ResultadoLlamadaUI = (typeof RESULTADOS_LLAMADA_UI)[number]['valor']

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
export function registrarLlamadaAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/oportunidad/llamada', { method: 'POST', body: JSON.stringify(body) })
}

export function tareasHoyAsegura(): Promise<Reenvio> {
  return llamar('/api/operador/tareas-hoy', { method: 'GET' })
}
