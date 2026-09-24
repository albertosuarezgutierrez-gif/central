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

import { cabecerasPuerto } from './puerto-actor.ts'
import {
  MOTIVOS_PERDIDA,
  MOTIVO_DESCARTE,
  RAMOS_OPORTUNIDAD,
  TIPOS_TAREA,
  mensajeRenovacionLeadWhatsapp,
  puedeWhatsappLead,
  type CanalLead,
  type ContactoMovil,
  type EstadoOportunidad,
  type MotivoPerdida,
  type PasoLead,
  type RamoOportunidad,
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

// ─── Las oportunidades de un cliente (tarjeta de la ficha) ───────────────────

export type OportunidadDeCliente = Oportunidad & {
  aseguradora: string | null
  /** `null` = no consta: nunca 0,00€. */
  prima: number | null
  creada: string
  /** `null` = no tiene tarea pendiente: una abierta así está huérfana y se dice. */
  proximaTarea: { tipo: string; fechaLimite: string } | null
}

export type OportunidadesCliente =
  | { estado: 'ok'; oportunidades: OportunidadDeCliente[]; truncado: boolean; descartadas: number }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

export function interpretarOportunidadesCliente(status: number, json: unknown): OportunidadesCliente {
  const o = objeto(json)
  if (o?.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || !o || o.estado !== 'ok' || !Array.isArray(o.oportunidades)) {
    return { estado: 'error', motivo: texto(o?.causa) ?? texto(o?.motivo) ?? `HTTP ${status}` }
  }
  const oportunidades: OportunidadDeCliente[] = []
  let descartadas = 0
  for (const f of o.oportunidades) {
    const r = objeto(f)
    const id = texto(r?.id)
    const clienteId = texto(r?.clienteId)
    const estado = uno(ESTADOS, r?.estado)
    const creada = texto(r?.creada)
    if (!r || !id || !clienteId || !estado || !creada) { descartadas++; continue }
    const pt = objeto(r.proximaTarea)
    const ptTipo = texto(pt?.tipo)
    const ptFecha = texto(pt?.fechaLimite)
    oportunidades.push({
      id,
      clienteId,
      ramo: texto(r.ramo),
      estado,
      fechaFinVigencia: texto(r.fechaFinVigencia),
      motivoPerdida: texto(r.motivoPerdida),
      competidor: texto(r.competidor),
      primaCompetidor: numero(r.primaCompetidor),
      aparcadaHasta: texto(r.aparcadaHasta),
      cerradaAt: texto(r.cerradaAt),
      aseguradora: texto(r.aseguradora),
      prima: numero(r.prima),
      creada,
      proximaTarea: ptTipo && ptFecha ? { tipo: ptTipo, fechaLimite: ptFecha } : null,
    })
  }
  return { estado: 'ok', oportunidades, truncado: o.truncado === true, descartadas }
}

/** Qué pasa con la respuesta de «abrir oportunidad», en palabras. */
export function textoAltaOportunidad(status: number, json: unknown): { ok: boolean; texto: string; id: string | null } {
  const o = objeto(json)
  const id = texto(o?.id)
  if (status === 201 && id) return { ok: true, texto: 'Oportunidad abierta. Su primer paso saldrá en «Hoy» el día que le toque.', id }
  if (status === 409 && o?.estado === 'duplicada') return { ok: false, texto: texto(o.motivo) ?? 'Ya tiene una abierta de ese ramo.', id }
  if (status === 503 || o?.estado === 'sin_configurar') return { ok: false, texto: 'La cartera no está conectada: no se ha guardado nada.', id: null }
  if (status === 422 || status === 404) return { ok: false, texto: texto(o?.motivo) ?? 'Revisa los datos.', id: null }
  return { ok: false, texto: `No se ha podido guardar (${texto(o?.motivo) ?? `HTTP ${status}`}). Reintenta: si se hubiera guardado, al reintentar te avisará de que ya existe.`, id: null }
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
  error_alta: 'Descartada: abierta por error o duplicada',
}
/**
 * Los motivos del módulo, en su orden: un motivo nuevo sin rótulo no compila.
 * El de descartar NO sale en «perder»: tiene su propio botón, y no es una venta perdida.
 */
export const MOTIVOS_PERDIDA_UI: readonly { valor: MotivoPerdida; rotulo: string }[] =
  MOTIVOS_PERDIDA.filter((valor) => valor !== MOTIVO_DESCARTE).map((valor) => ({ valor, rotulo: ROTULO_MOTIVO[valor] }))

/** Rótulo de un motivo leído del puerto; `null` si no es uno conocido (se enseña tal cual). */
export function rotuloMotivo(m: string | null): string | null {
  return m === null ? null : (ROTULO_MOTIVO as Record<string, string>)[m] ?? m
}

const ROTULO_RAMO: Record<RamoOportunidad, string> = {
  auto: 'Auto', moto: 'Moto', hogar: 'Hogar', vida: 'Vida', salud: 'Salud', decesos: 'Decesos',
  responsabilidad_civil: 'Resp. civil', comercio: 'Comercio', comunidades: 'Comunidades', accidentes: 'Accidentes', otros: 'Otros',
}
export const RAMOS_OPORTUNIDAD_UI: readonly { valor: RamoOportunidad; rotulo: string }[] =
  RAMOS_OPORTUNIDAD.map((valor) => ({ valor, rotulo: ROTULO_RAMO[valor] }))
export function rotuloRamo(r: string | null): string {
  return r === null ? 'Sin ramo' : (ROTULO_RAMO as Record<string, string>)[r] ?? r
}

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

/**
 * El WhatsApp de seguimiento de un lead, o `null` si no se le puede escribir
 * por ahí (Alberto, 23/09/2026: es la vía preferente; lo abre y lo envía él).
 * Mismo régimen que el correo (LSSI art. 21): solo a quien FUE cliente. Que
 * el número sea un móvil lo decide `BotonWhatsapp`, que no pinta nada si no.
 */
export function whatsappDeLead(l: LeadVencimiento): { telefono: string; mensaje: string } | null {
  if (l.telefono === null || l.canal === 'sin_canal_permitido') return null
  if (!puedeWhatsappLead({ fueCliente: l.fueCliente, tieneTelefono: true })) return null
  const mes = Number(l.vencimientoEstimado.slice(5, 7))
  return {
    telefono: l.telefono,
    mensaje: mensajeRenovacionLeadWhatsapp({
      nombre: l.cliente,
      ramo: l.ramo,
      mesAniversario: Number.isInteger(mes) && mes >= 1 && mes <= 12 ? mes : null,
    }),
  }
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
      headers: { ...(await cabecerasPuerto(secret)), ...(init.body ? { 'content-type': 'application/json' } : {}) },
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
export function oportunidadesClienteAsegura(clienteId: string): Promise<Reenvio> {
  return llamar(`/api/operador/oportunidad?clienteId=${encodeURIComponent(clienteId)}`, { method: 'GET' })
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

/** Anota que se abrió el WhatsApp de seguimiento de un lead (no envía nada). */
export function registrarWhatsappAsegura(body: { oportunidadId: string; actor: string }): Promise<Reenvio> {
  return llamar('/api/operador/oportunidad/whatsapp', { method: 'POST', body: JSON.stringify(body) })
}

/** Clientes en vigor y leads de Vencimientos con su contacto, para el .vcf del móvil. */
export function contactosMovilAsegura(): Promise<Reenvio> {
  return llamar('/api/operador/contactos-movil', { method: 'GET' })
}

/**
 * Lectura defensiva de la respuesta: `null` = no se pudo leer (el .vcf NO se
 * genera vacío, que se importaría como «no tienes a nadie»).
 */
export function interpretarContactosMovil(status: number, j: unknown): { contactos: ContactoMovil[]; clientesSinLeer: number } | null {
  const o = (typeof j === 'object' && j !== null ? j : {}) as Record<string, unknown>
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.contactos)) return null
  const txt = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null)
  const contactos = o.contactos.flatMap((c): ContactoMovil[] => {
    const x = (typeof c === 'object' && c !== null ? c : {}) as Record<string, unknown>
    if (typeof x.clienteId !== 'string' || (x.grupo !== 'cliente' && x.grupo !== 'lead')) return []
    return [{ clienteId: x.clienteId, nombre: txt(x.nombre), apellidos: txt(x.apellidos), telefono: txt(x.telefono), email: txt(x.email), grupo: x.grupo }]
  })
  return { contactos, clientesSinLeer: typeof o.clientesSinLeer === 'number' ? o.clientesSinLeer : 0 }
}

export function tareasHoyAsegura(): Promise<Reenvio> {
  return llamar('/api/operador/tareas-hoy', { method: 'GET' })
}

// ─── Rellenar la oportunidad leyendo un documento (24/09/2026) ──────────────
// Alberto: «subir póliza, recibo o alguna imagen y que el agente con IA busque los
// datos que haya». Lo leído RELLENA el formulario; lo guarda él al pulsar «Abrir».

export type LecturaDocumentoOportunidad =
  | {
      estado: 'ok'
      ramo: RamoOportunidad | null
      compania: string | null
      numeroPoliza: string | null
      vence: string | null
      prima: number | null
    }
  | { estado: 'error'; motivo: string }

/**
 * Lo que devuelve el puerto `leer-documento`. Un campo con forma rara se queda en
 * `null` («no se leyó»), nunca en un valor plausible: una prima 0 o una fecha
 * que no es fecha no rellenan nada. Si no se leyó NADA, es un error con motivo:
 * un formulario que no cambia sin explicación parece que el botón no funciona.
 */
export function interpretarLecturaOportunidad(status: number, json: unknown): LecturaDocumentoOportunidad {
  const o = json !== null && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null
  if (status !== 200 || !o || o.leido !== true) {
    if (status === 503) return { estado: 'error', motivo: 'la cartera no está conectada' }
    const m = typeof o?.error === 'string' ? o.error : typeof o?.motivo === 'string' ? o.motivo : `HTTP ${status}`
    return { estado: 'error', motivo: m }
  }
  const txt = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 120) : null)
  const ramo = RAMOS_OPORTUNIDAD.find(r => r === o.ramo) ?? null
  const vence = typeof o.fechaVencimiento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.fechaVencimiento)
    && !Number.isNaN(Date.parse(`${o.fechaVencimiento}T00:00:00Z`)) ? o.fechaVencimiento : null
  const prima = typeof o.primaAnual === 'number' && Number.isFinite(o.primaAnual) && o.primaAnual > 0 && o.primaAnual < 1_000_000
    ? Math.round(o.primaAnual * 100) / 100 : null
  const r = { ramo, compania: txt(o.compania), numeroPoliza: txt(o.numeroPoliza), vence, prima }
  if (Object.values(r).every(v => v === null)) {
    return { estado: 'error', motivo: 'el documento se ha leído pero no trae ramo, compañía, vencimiento ni prima' }
  }
  return { estado: 'ok', ...r }
}

/** La prima como la teclearía Alberto, para el campo de texto: «1200,5» → «1200,50». */
export function primaParaCampo(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

// ─── De qué oportunidad cuelga un presupuesto recién pedido (24/09/2026) ─────
// asegura engancha cada precio real a la oportunidad del cliente para ese ramo (o
// la abre) y lo manda en `guardado.oportunidad`. Ausente = no se intentó
// (simulación o asegura más vieja): entonces no se dice nada, ni bueno ni malo.

export type EnlacePresupuesto =
  | { estado: 'creada' | 'enlazada'; oportunidadId: string }
  | { estado: 'fallo'; motivo: string }

export function enlaceOportunidadDe(guardado: unknown): EnlacePresupuesto | null {
  if (typeof guardado !== 'object' || guardado === null) return null
  const o = (guardado as Record<string, unknown>).oportunidad
  if (typeof o !== 'object' || o === null) return null
  const e = o as Record<string, unknown>
  if ((e.estado === 'creada' || e.estado === 'enlazada') && typeof e.oportunidadId === 'string' && e.oportunidadId !== '') {
    return { estado: e.estado, oportunidadId: e.oportunidadId }
  }
  if (e.estado === 'no_enlazada' || e.estado === 'omitida') {
    return { estado: 'fallo', motivo: typeof e.motivo === 'string' ? e.motivo : 'sin motivo' }
  }
  return null
}

// ─── «Pídele los datos al cliente» (24/09/2026) ──────────────────────────────
// Enlace directo (sin código) para que el cliente complete lo que falta para
// presupuestar moto o coche. asegura guarda el hash del token y las respuestas
// cifradas; aquí se leen para verlas y tarificar.

export type SolicitudDatos = {
  id: string
  ramo: 'moto' | 'auto'
  estado: 'pendiente' | 'completada' | 'anulada' | 'caducada'
  caduca: string
  completada: string | null
  campos: { clave: string; etiqueta: string; opciones?: { valor: string; etiqueta: string }[] }[]
  /** `null` = sin completar o ilegible (entonces `ilegible` lo dice). */
  respuestas: Record<string, string | number | boolean | null> | null
  ilegible: boolean
}

export type SolicitudesDatos = { estado: 'ok'; solicitudes: SolicitudDatos[] } | { estado: 'error'; motivo: string }

const ESTADOS_SOLICITUD = ['pendiente', 'completada', 'anulada', 'caducada'] as const

export function interpretarSolicitudesDatos(status: number, json: unknown): SolicitudesDatos {
  const o = objeto(json)
  if (status !== 200 || o?.estado !== 'ok' || !Array.isArray(o.solicitudes)) {
    return { estado: 'error', motivo: texto(o?.motivo) ?? (status === 503 ? 'la cartera no responde' : `HTTP ${status}`) }
  }
  const solicitudes: SolicitudDatos[] = []
  for (const x of o.solicitudes) {
    const s = objeto(x)
    const id = texto(s?.id)
    const estado = uno(ESTADOS_SOLICITUD, s?.estado)
    const ramo = s?.ramo === 'moto' || s?.ramo === 'auto' ? s.ramo : null
    if (!s || !id || !estado || !ramo || !Array.isArray(s.campos)) continue
    const campos = s.campos.flatMap((c) => {
      const co = objeto(c)
      const clave = texto(co?.clave)
      const etiqueta = texto(co?.etiqueta)
      if (!clave || !etiqueta) return []
      const opciones = Array.isArray(co?.opciones)
        ? co.opciones.flatMap((op) => { const oo = objeto(op); const v = texto(oo?.valor); const e = texto(oo?.etiqueta); return v && e ? [{ valor: v, etiqueta: e }] : [] })
        : undefined
      return [{ clave, etiqueta, ...(opciones ? { opciones } : {}) }]
    })
    const r = objeto(s.respuestas)
    const respuestas = r
      ? Object.fromEntries(Object.entries(r).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))) as Record<string, string | number | boolean | null>
      : null
    solicitudes.push({ id, ramo, estado, caduca: texto(s.caduca) ?? '', completada: texto(s.completada), campos, respuestas, ilegible: s.ilegible === true })
  }
  return { estado: 'ok', solicitudes }
}

/** Una respuesta como la lee Alberto: opción → su etiqueta, sí/no, fecha española; `null` → «—». */
export function valorLegible(campo: SolicitudDatos['campos'][number], v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'number') return v.toLocaleString('es-ES')
  const op = campo.opciones?.find((o) => o.valor === v)
  if (op) return op.etiqueta
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return f ? `${f[3]}/${f[2]}/${f[1]}` : v
}

export function solicitudesDatosAsegura(oportunidadId: string): Promise<Reenvio> {
  return llamar(`/api/operador/solicitud-datos?oportunidadId=${encodeURIComponent(oportunidadId)}`, { method: 'GET' })
}
export function accionSolicitudDatosAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/solicitud-datos', { method: 'POST', body: JSON.stringify(body) })
}
