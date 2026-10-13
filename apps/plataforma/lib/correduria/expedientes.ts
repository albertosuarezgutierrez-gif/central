/**
 * «Mis expedientes» (13/10/2026): lo que Alberto tiene abierto en TODOS los clientes, leído del puerto
 * de asegura (`GET /api/operador/expedientes`). PURO: interpreta la respuesta; la red va por
 * `expedientesAsegura()` de `lib/seguimiento-asegura.ts`.
 *
 * Tres estados, como el resto del puerto: lista vacía con `ok` = no hay nada abierto; `sin_configurar`
 * y `error` = no se ha podido mirar (la pantalla nunca lo pinta como «0 abiertas»). Clase y estado
 * visible los decide asegura con `@central/module-seguros`; aquí solo se valida la forma, y una fila con
 * un valor que esta versión no conoce se CUENTA en `descartadas`, no se pinta a ciegas.
 */
import {
  CLASES_EXPEDIENTE,
  ESTADOS_VISIBLES,
  type ClaseExpediente,
  type EstadoVisible,
} from '@central/module-seguros'

export type ReciboRescate = {
  reciboId: string
  idRecibo: string | null
  /** `null` = no consta: nunca se pinta 0,00€. */
  importe: number | null
  efecto: string | null
  suspensionDesde: string | null
  hito: string | null
  situacion: string | null
}

export type Expediente = {
  id: string
  clienteId: string
  cliente: string | null
  ramo: string | null
  clase: ClaseExpediente
  estadoVisible: Exclude<EstadoVisible, 'ganada' | 'perdida'>
  estado: string
  delVolcado: boolean
  aparcadaHasta: string | null
  aparcadaMotivo: string | null
  /** `null` = sin próxima acción (huérfana: nadie la va a mirar si no se le pone una). */
  proximaAccion: { tareaId: string; texto: string; tipo: string; fecha: string | null } | null
  /** `null` = no se sabe. */
  prima: number | null
  fechaFinVigencia: string | null
  notas: string | null
  creada: string
  /** Solo en un rescate; `recibo: null` = no se ha podido localizar el recibo (no «no hay»). */
  rescate: { tipo: 'recibo' | 'anulacion'; recibo: ReciboRescate | null } | null
}

export type Expedientes =
  | {
      estado: 'ok'
      hoy: string
      expedientes: Expediente[]
      /** `null` = asegura no lo manda: se cuenta en la pantalla, no se supone 0. */
      recuento: Record<'abierta' | 'esperando_cliente' | 'aparcada', number> | null
      truncado: boolean
      /** Las que asegura descartó + las que aquí no tenían la forma esperada. */
      descartadas: number
    }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

function objeto(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}
function importe(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}
function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

const VISIBLES_ABIERTOS = ESTADOS_VISIBLES.filter((e): e is Expediente['estadoVisible'] => e !== 'ganada' && e !== 'perdida')

function recibo(v: unknown): ReciboRescate | null {
  const r = objeto(v)
  const reciboId = texto(r?.reciboId)
  if (!r || !reciboId) return null
  return {
    reciboId,
    idRecibo: texto(r.idRecibo),
    importe: importe(r.importe),
    efecto: texto(r.efecto),
    suspensionDesde: texto(r.suspensionDesde),
    hito: texto(r.hito),
    situacion: texto(r.situacion),
  }
}

function fila(v: unknown): Expediente | null {
  const r = objeto(v)
  if (!r) return null
  const id = texto(r.id)
  const clienteId = texto(r.clienteId)
  const estado = texto(r.estado)
  const creada = texto(r.creada)
  const clase = CLASES_EXPEDIENTE.find((c) => c === r.clase)
  const ev = VISIBLES_ABIERTOS.find((e) => e === r.estadoVisible)
  if (!id || !clienteId || !estado || !creada || !clase || !ev) return null
  const p = objeto(r.proximaAccion)
  const tareaId = texto(p?.tareaId)
  const tipo = texto(p?.tipo)
  const resc = objeto(r.rescate)
  const tipoRescate = resc?.tipo === 'recibo' || resc?.tipo === 'anulacion' ? resc.tipo : null
  return {
    id,
    clienteId,
    cliente: texto(r.cliente),
    ramo: texto(r.ramo),
    clase,
    estadoVisible: ev,
    estado,
    delVolcado: r.delVolcado === true,
    aparcadaHasta: texto(r.aparcadaHasta),
    aparcadaMotivo: texto(r.aparcadaMotivo),
    proximaAccion: p && tareaId && tipo
      ? { tareaId, tipo, texto: typeof p.texto === 'string' ? p.texto : '', fecha: texto(p.fecha) }
      : null,
    prima: importe(r.prima),
    fechaFinVigencia: texto(r.fechaFinVigencia),
    notas: texto(r.notas),
    creada,
    rescate: tipoRescate ? { tipo: tipoRescate, recibo: recibo(resc?.recibo) } : null,
  }
}

export function interpretarExpedientes(status: number, json: unknown): Expedientes {
  const o = objeto(json)
  if (o?.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || !o || o.estado !== 'ok' || !Array.isArray(o.expedientes)) {
    return { estado: 'error', motivo: texto(o?.causa) ?? texto(o?.motivo) ?? `HTTP ${status}` }
  }
  const expedientes: Expediente[] = []
  let descartadas = entero(o.descartadas) ?? 0
  for (const v of o.expedientes) {
    const e = fila(v)
    if (e) expedientes.push(e)
    else descartadas++
  }
  const rc = objeto(o.recuento)
  const a = entero(rc?.abierta)
  const ec = entero(rc?.esperando_cliente)
  const ap = entero(rc?.aparcada)
  return {
    estado: 'ok',
    hoy: texto(o.hoy) ?? '',
    expedientes,
    recuento: a !== null && ec !== null && ap !== null ? { abierta: a, esperando_cliente: ec, aparcada: ap } : null,
    truncado: o.truncado === true,
    descartadas,
  }
}
