// packages/module-seguros/src/anulacion.ts
//
// Expediente de anulación de una póliza (Fase 2 de ASegura OS, pieza 2-d). PURO.
//
// El recorrido: solicitada → firmada (el cliente la firma) → comunicada (se manda a la compañía)
// → confirmada (CIMA ya la trae como no vigente). Se puede desistir en cualquier punto abierto.
//
// 🚨 No se comunica nada a la compañía sin firma del tomador: «comunicada» solo sale de «firmada».
// La comunicación misma NO se hace aquí: irá por la cola de aprobaciones (regla de comunicaciones
// salientes). Aquí solo se valida, se ordena y se dice cuál es el siguiente paso.

import { ventanaAnulacion } from './pago.ts'
import { MOTIVOS_PERDIDA, type MotivoPerdida } from './oportunidad-seguimiento.ts'

export const TIPOS_ANULACION = ['no_renovacion', 'inmediata', 'sustitucion'] as const
export type TipoAnulacion = (typeof TIPOS_ANULACION)[number]

export const SOLICITANTES_ANULACION = ['cliente', 'correduria', 'compania'] as const
export type SolicitanteAnulacion = (typeof SOLICITANTES_ANULACION)[number]

export const MOTIVOS_ANULACION = ['precio', 'competidor', 'coberturas', 'venta_del_bien', 'cliente_desiste', 'impago', 'otro'] as const
export type MotivoAnulacion = (typeof MOTIVOS_ANULACION)[number]

export const ESTADOS_ANULACION = ['solicitada', 'firmada', 'comunicada', 'confirmada', 'desistida'] as const
export type EstadoAnulacion = (typeof ESTADOS_ANULACION)[number]
export const ESTADOS_ANULACION_ABIERTA: readonly EstadoAnulacion[] = ['solicitada', 'firmada', 'comunicada']

export const ETIQUETA_TIPO_ANULACION: Record<TipoAnulacion, string> = {
  no_renovacion: 'Al vencimiento (no renovar)',
  inmediata: 'Anticipada (antes del vencimiento)',
  sustitucion: 'Por sustitución (la reemplaza otra póliza)',
}

export const ETIQUETA_MOTIVO_ANULACION: Record<MotivoAnulacion, string> = {
  precio: 'Precio',
  competidor: 'Se va a otra compañía o corredor',
  coberturas: 'Coberturas',
  venta_del_bien: 'Vendió el bien asegurado',
  cliente_desiste: 'Ya no lo necesita',
  impago: 'Impago',
  otro: 'Otro',
}

export const ETIQUETA_ESTADO_ANULACION: Record<EstadoAnulacion, string> = {
  solicitada: 'Solicitada',
  firmada: 'Firmada por el cliente',
  comunicada: 'Comunicada a la compañía',
  confirmada: 'Confirmada por la compañía',
  desistida: 'Desistida',
}

/** Días tras la fecha de efecto que se espera a que CIMA la refleje antes de dar la alarma. */
export const DIAS_ESPERA_CONFIRMACION = 15

export type SolicitudAnulacion = {
  tipo: TipoAnulacion
  solicitadaPor: SolicitanteAnulacion
  motivo: MotivoAnulacion
  motivoTexto: string | null
  /** `YYYY-MM-DD`. */
  fechaEfecto: string
}

export type ResultadoSolicitud =
  | { ok: true; solicitud: SolicitudAnulacion; advertencia: string | null }
  | { ok: false; motivo: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/

function fechaValida(s: unknown): s is string {
  return typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

function fechaEs(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function uno<T extends string>(lista: readonly T[], v: unknown): T | null {
  return lista.find((x) => x === v) ?? null
}

/**
 * Valida lo que pide el corredor contra la póliza. `vencimiento` y `hoy` en `YYYY-MM-DD` (Madrid).
 * Lo que es ilegal o imposible, se rechaza; lo que es posible pero arriesgado, pasa con advertencia.
 */
export function validarSolicitud(v: unknown, ctx: { vencimiento: string | null; hoy: string }): ResultadoSolicitud {
  if (!v || typeof v !== 'object') return { ok: false, motivo: 'Solicitud vacía.' }
  const o = v as Record<string, unknown>
  const tipo = uno(TIPOS_ANULACION, o.tipo)
  const solicitadaPor = uno(SOLICITANTES_ANULACION, o.solicitadaPor)
  const motivo = uno(MOTIVOS_ANULACION, o.motivo)
  if (!tipo) return { ok: false, motivo: 'Elige el tipo de anulación.' }
  if (!solicitadaPor) return { ok: false, motivo: 'Di quién la pide.' }
  if (!motivo) return { ok: false, motivo: 'Elige el motivo.' }
  const motivoTexto = typeof o.motivoTexto === 'string' && o.motivoTexto.trim() ? o.motivoTexto.trim().slice(0, 500) : null
  if (motivo === 'otro' && !motivoTexto) return { ok: false, motivo: 'Con «Otro», escribe el motivo.' }
  if (!fechaValida(o.fechaEfecto)) return { ok: false, motivo: 'Fecha de efecto no válida.' }
  const fechaEfecto = o.fechaEfecto
  const solicitud: SolicitudAnulacion = { tipo, solicitadaPor, motivo, motivoTexto, fechaEfecto }

  if (tipo === 'no_renovacion') {
    if (!ctx.vencimiento) return { ok: false, motivo: 'No consta el vencimiento de la póliza: sin él no se puede anular al vencimiento.' }
    if (fechaEfecto !== ctx.vencimiento) return { ok: false, motivo: `Al vencimiento, el efecto es el vencimiento (${fechaEs(ctx.vencimiento)}).` }
    if (ctx.vencimiento < ctx.hoy) return { ok: false, motivo: 'Ese vencimiento ya pasó: la póliza se ha renovado o ya no está. Revisa la fecha antes.' }
    const w = ventanaAnulacion(ctx.vencimiento, new Date(`${ctx.hoy}T12:00:00Z`))
    // Art. 22 LCS: el tomador se opone a la prórroga con un mes de antelación. Fuera de plazo la
    // compañía puede prorrogar igual; se deja tramitar (hay compañías que la aceptan), avisado.
    // La compañía, en cambio, tiene que avisar con dos meses.
    const diasHasta = diasEntre(ctx.hoy, ctx.vencimiento)
    const advertencia = solicitadaPor === 'compania'
      ? (diasHasta < 60 ? 'La compañía tiene que oponerse a la prórroga con dos meses de antelación (art. 22 LCS): este aviso llega tarde.' : null)
      : w && !w.enPlazo
        ? `Fuera del plazo del art. 22 LCS (había que avisar antes del ${fechaEs(w.limiteAviso)}): la compañía puede prorrogarla otro año.`
        : null
    return { ok: true, solicitud, advertencia }
  }

  if (diasEntre(fechaEfecto, ctx.hoy) > 90) return { ok: false, motivo: 'El efecto no puede ser de hace más de 90 días.' }
  if (ctx.vencimiento && fechaEfecto > ctx.vencimiento) {
    return { ok: false, motivo: `El efecto es posterior al vencimiento (${fechaEs(ctx.vencimiento)}): eso es anular al vencimiento.` }
  }
  if (tipo === 'inmediata') {
    return {
      ok: true,
      solicitud,
      advertencia: motivo === 'venta_del_bien'
        ? null
        : 'La baja anticipada depende del condicionado: no todas las compañías la admiten ni devuelven la prima no consumida.',
    }
  }
  return { ok: true, solicitud, advertencia: null }
}

export type AccionAnulacion = 'marcar_firmada' | 'marcar_comunicada' | 'confirmar' | 'desistir'
export const ACCIONES_ANULACION: readonly AccionAnulacion[] = ['marcar_firmada', 'marcar_comunicada', 'confirmar', 'desistir']

/** El estado al que lleva una acción, o `null` si desde ahí no se puede. */
export function transicion(estado: EstadoAnulacion, accion: AccionAnulacion): EstadoAnulacion | null {
  if (!ESTADOS_ANULACION_ABIERTA.includes(estado)) return null
  switch (accion) {
    case 'marcar_firmada': return estado === 'solicitada' ? 'firmada' : null
    // Sin firma no se comunica: la anulación es del tomador, no de la correduría.
    case 'marcar_comunicada': return estado === 'firmada' ? 'comunicada' : null
    // Confirmar es que la compañía ha aplicado lo que se le comunicó: sin comunicación no hay qué confirmar.
    case 'confirmar': return estado === 'comunicada' ? 'confirmada' : null
    case 'desistir': return 'desistida'
  }
}

export type SiguientePaso = { texto: string; alerta: boolean }

/** Qué toca ahora con un expediente abierto. `hoy` en `YYYY-MM-DD`. */
export function siguientePaso(a: { estado: EstadoAnulacion; fechaEfecto: string; compania: string | null }, hoy: string): SiguientePaso | null {
  const compania = a.compania ?? 'la compañía'
  switch (a.estado) {
    case 'solicitada': {
      const alerta = diasEntre(hoy, a.fechaEfecto) <= 15
      return { texto: `Falta la firma del cliente${alerta ? ` y el efecto es el ${fechaEs(a.fechaEfecto)}` : ''}.`, alerta }
    }
    case 'firmada': return { texto: `Firmada: falta comunicarla a ${compania}.`, alerta: diasEntre(hoy, a.fechaEfecto) <= 15 }
    case 'comunicada': {
      const tarde = diasEntre(a.fechaEfecto, hoy) - DIAS_ESPERA_CONFIRMACION
      return tarde > 0
        ? { texto: `CIMA aún no la refleja ${diasEntre(a.fechaEfecto, hoy)} días después del efecto: pide a ${compania} el suplemento de anulación.`, alerta: true }
        : { texto: `Comunicada: falta que ${compania} la aplique (se verá en CIMA).`, alerta: false }
    }
    default: return null
  }
}

/** Cómo queda la pérdida de cartera que explica esta anulación (revisión del evento de baja). */
export function resolucionDeAnulacion(a: { tipo: TipoAnulacion; motivo: MotivoAnulacion }): { resolucion: 'perdida'; motivo: MotivoPerdida } | { resolucion: 'no_es_perdida' } {
  if (a.tipo === 'sustitucion') return { resolucion: 'no_es_perdida' }
  const directo = MOTIVOS_PERDIDA.find((m) => m === a.motivo)
  return { resolucion: 'perdida', motivo: directo ?? 'otro' }
}
