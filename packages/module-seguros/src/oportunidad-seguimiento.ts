// packages/module-seguros/src/oportunidad-seguimiento.ts
//
// El SEGUIMIENTO de una oportunidad (Fase 1 de ASegura OS, PR B, 23/09/2026):
// qué transiciones de estado existen, qué exige cada una y qué tarea es
// válida. Puro: decide, no escribe. La escritura (con su auditoría en la
// misma transacción) vive en `apps/asegura/lib/oportunidad-seguimiento.ts`.
//
// La regla que manda: **nada se pierde sin decir por qué.** Una oportunidad
// perdida sin motivo es un dato que no enseña nada —no se puede saber si se
// pierde por precio, por la compañía o porque nadie contestó—, y por eso el
// motivo es obligatorio aquí Y en la BD (CHECK), no solo en un formulario.
//
// Los estados son los del enum heredado `estado_comercial` del CRM de Manuel;
// no se inventa uno nuevo. «Aparcar» NO es un estado: la oportunidad conserva
// el suyo y lleva una fecha hasta la que no se trabaja (`aparcadaHasta`).

export type EstadoOportunidad = 'competencia' | 'en_negociacion' | 'pendiente_cliente' | 'ganada' | 'perdida'

export const MOTIVOS_PERDIDA = [
  'precio',
  'competidor',
  'coberturas',
  'cliente_desiste',
  'sin_respuesta',
  'no_contactable',
  'ya_asegurado',
  'otro',
  // «Descartar» (24/09/2026): la oportunidad se abrió por error o está
  // duplicada. NO es una venta perdida, y cualquier estadística de pérdidas
  // la tiene que excluir (`MOTIVO_DESCARTE`). No se borra: su rastro se queda.
  'error_alta',
] as const
export type MotivoPerdida = (typeof MOTIVOS_PERDIDA)[number]
/** El motivo de «descartar»: fuera de toda cuenta de ventas perdidas. */
export const MOTIVO_DESCARTE: MotivoPerdida = 'error_alta'
/** Los motivos de una VENTA perdida (o de una póliza que se va): todos menos el de descartar. */
export const MOTIVOS_PERDIDA_VENTA: readonly MotivoPerdida[] = MOTIVOS_PERDIDA.filter(m => m !== MOTIVO_DESCARTE)

export type AccionOportunidad = 'interesado' | 'propuesta_enviada' | 'ganar' | 'perder' | 'aparcar' | 'reabrir'

export type PeticionAccion = {
  accion: AccionOportunidad
  motivo?: unknown
  detalle?: unknown
  competidor?: unknown
  primaCompetidor?: unknown
  aparcadaHasta?: unknown
  polizaGanadaId?: unknown
}

export type EstadoActual = { estado: EstadoOportunidad; aparcadaHasta: string | null }

/** Lo que hay que escribir. Un campo `undefined` no se toca; `null` se borra. */
export type Cambios = {
  estado: EstadoOportunidad
  motivoPerdida?: MotivoPerdida | null
  motivoDetalle?: string | null
  competidor?: string | null
  primaCompetidor?: number | null
  aparcadaHasta?: string | null
  /** Por qué se aparcó. Columna propia: no es un motivo de PÉRDIDA. */
  aparcadaMotivo?: string | null
  polizaGanadaId?: string | null
  cerrada?: boolean
}

export type ResultadoAccion = { ok: true; cambios: Cambios } | { ok: false; motivo: string }

const ABIERTOS: readonly EstadoOportunidad[] = ['competencia', 'en_negociacion', 'pendiente_cliente']
/** Un año y un mes: aparcar «hasta el año que viene» cabe; aparcar para siempre, no. */
const MAX_DIAS_APARCADA = 400
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t.slice(0, max)
}

function fechaIso(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
}

function diasDesdeHoy(fecha: string, hoy: Date): number {
  const base = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return Math.round((Date.parse(`${fecha}T00:00:00Z`) - base) / 86_400_000)
}

function importe(v: unknown): number | null | 'invalido' {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : Number.NaN
  // 0 no es una prima (regla NULL≠0): quien no la sabe, no la manda.
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : 'invalido'
}

function estaAparcada(a: EstadoActual, hoy: Date): boolean {
  return a.aparcadaHasta !== null && diasDesdeHoy(a.aparcadaHasta, hoy) > 0
}

/**
 * Valida una acción contra el estado actual y devuelve lo que hay que
 * escribir, o por qué no. No hay transición «por defecto»: una acción que no
 * encaja con el estado se rechaza con su motivo, porque aplicarla igual
 * reescribiría la historia de la oportunidad sin que nadie lo notara.
 */
export function aplicarAccion(actual: EstadoActual, p: PeticionAccion, hoy: Date): ResultadoAccion {
  const abierta = ABIERTOS.includes(actual.estado)
  switch (p.accion) {
    case 'interesado':
      if (actual.estado !== 'competencia' && actual.estado !== 'en_negociacion') {
        return { ok: false, motivo: `No se puede marcar «interesado» desde «${actual.estado}».` }
      }
      return { ok: true, cambios: { estado: 'en_negociacion', aparcadaHasta: null, aparcadaMotivo: null } }

    case 'propuesta_enviada':
      if (actual.estado !== 'en_negociacion' && actual.estado !== 'competencia') {
        return { ok: false, motivo: `Solo se envía una propuesta a una oportunidad abierta sin propuesta (está «${actual.estado}»).` }
      }
      return { ok: true, cambios: { estado: 'pendiente_cliente', aparcadaHasta: null, aparcadaMotivo: null } }

    case 'ganar': {
      if (actual.estado !== 'en_negociacion' && actual.estado !== 'pendiente_cliente') {
        return { ok: false, motivo: `Solo se gana una oportunidad en negociación o con propuesta enviada (está «${actual.estado}»).` }
      }
      const poliza = p.polizaGanadaId === undefined || p.polizaGanadaId === null || p.polizaGanadaId === '' ? null : p.polizaGanadaId
      if (poliza !== null && (typeof poliza !== 'string' || !UUID.test(poliza))) {
        return { ok: false, motivo: 'La póliza ganada no es un identificador válido.' }
      }
      // Sin póliza, el campo no se toca (`undefined`): un `null` borraría una que ya hubiera.
      return {
        ok: true,
        cambios: { estado: 'ganada', polizaGanadaId: poliza === null ? undefined : (poliza as string), aparcadaHasta: null, aparcadaMotivo: null, cerrada: true },
      }
    }

    case 'perder': {
      if (!abierta) return { ok: false, motivo: `Una oportunidad «${actual.estado}» no se puede perder.` }
      const motivo = MOTIVOS_PERDIDA.find(m => m === p.motivo)
      if (!motivo) return { ok: false, motivo: `Falta el motivo de pérdida (uno de: ${MOTIVOS_PERDIDA.join(', ')}).` }
      const detalle = texto(p.detalle, 500)
      const competidor = texto(p.competidor, 120)
      if (motivo === 'competidor' && competidor === null) {
        return { ok: false, motivo: 'Si se pierde contra otra compañía, di cuál.' }
      }
      if (motivo === 'otro' && detalle === null) return { ok: false, motivo: 'Con motivo «otro», explica cuál.' }
      const prima = importe(p.primaCompetidor)
      if (prima === 'invalido') return { ok: false, motivo: 'La prima de la competencia no es un importe válido.' }
      return {
        ok: true,
        cambios: {
          estado: 'perdida',
          motivoPerdida: motivo,
          motivoDetalle: detalle,
          competidor,
          primaCompetidor: prima,
          aparcadaHasta: null,
          aparcadaMotivo: null,
          cerrada: true,
        },
      }
    }

    case 'aparcar': {
      if (!abierta) return { ok: false, motivo: `Una oportunidad «${actual.estado}» no se aparca: ya está cerrada.` }
      const hasta = fechaIso(p.aparcadaHasta)
      if (hasta === null) return { ok: false, motivo: 'Falta la fecha hasta la que se aparca (aaaa-mm-dd).' }
      const dias = diasDesdeHoy(hasta, hoy)
      if (dias <= 0) return { ok: false, motivo: 'La fecha de aparcar tiene que ser futura.' }
      if (dias > MAX_DIAS_APARCADA) return { ok: false, motivo: `No se aparca más de ${MAX_DIAS_APARCADA} días: si no interesa, se pierde con su motivo.` }
      const detalle = texto(p.detalle, 500)
      if (detalle === null) return { ok: false, motivo: 'Di por qué se aparca.' }
      return { ok: true, cambios: { estado: actual.estado, aparcadaHasta: hasta, aparcadaMotivo: detalle } }
    }

    case 'reabrir':
      if (actual.estado === 'perdida') {
        return {
          ok: true,
          cambios: {
            estado: 'en_negociacion',
            motivoPerdida: null,
            motivoDetalle: null,
            competidor: null,
            primaCompetidor: null,
            aparcadaHasta: null,
            aparcadaMotivo: null,
            cerrada: false,
          },
        }
      }
      if (abierta && estaAparcada(actual, hoy)) return { ok: true, cambios: { estado: actual.estado, aparcadaHasta: null, aparcadaMotivo: null } }
      return { ok: false, motivo: `Solo se reabre una oportunidad perdida o aparcada (está «${actual.estado}»).` }

    default:
      return { ok: false, motivo: 'Acción desconocida.' }
  }
}

// ── Tareas (tabla heredada `gestiones`) ──────────────────────────────────────

export const TIPOS_TAREA = ['tarea', 'llamada', 'email', 'whatsapp'] as const
export type TipoTarea = (typeof TIPOS_TAREA)[number]
export const PRIORIDADES_TAREA = ['alta', 'media', 'baja'] as const
export type PrioridadTarea = (typeof PRIORIDADES_TAREA)[number]

export type TareaValida = { tipo: TipoTarea; prioridad: PrioridadTarea; observaciones: string; fechaLimite: string }

/**
 * Una tarea sin fecha no es seguimiento: es una nota que nadie vuelve a
 * mirar. Por eso la fecha límite es obligatoria y no puede estar en el pasado.
 */
export function validarTarea(
  d: { tipo?: unknown; prioridad?: unknown; observaciones?: unknown; fechaLimite?: unknown },
  hoy: Date,
): { ok: true; tarea: TareaValida } | { ok: false; motivo: string } {
  const tipo = TIPOS_TAREA.find(t => t === d.tipo)
  if (!tipo) return { ok: false, motivo: `Tipo de tarea no válido (uno de: ${TIPOS_TAREA.join(', ')}).` }
  const prioridad = d.prioridad === undefined ? 'media' : PRIORIDADES_TAREA.find(x => x === d.prioridad)
  if (!prioridad) return { ok: false, motivo: 'Prioridad no válida (alta, media o baja).' }
  const observaciones = texto(d.observaciones, 2000)
  if (observaciones === null) return { ok: false, motivo: 'Di qué hay que hacer.' }
  const fechaLimite = fechaIso(d.fechaLimite)
  if (fechaLimite === null) return { ok: false, motivo: 'Falta la fecha límite (aaaa-mm-dd).' }
  if (diasDesdeHoy(fechaLimite, hoy) < 0) return { ok: false, motivo: 'La fecha límite no puede estar en el pasado.' }
  return { ok: true, tarea: { tipo, prioridad, observaciones, fechaLimite } }
}

// ── Alta y edición a mano (Fase 1 del rediseño de la ficha, 24/09/2026) ─────

/** Los del enum `tipo_seguro` de la BD, en su orden. */
export const RAMOS_OPORTUNIDAD = ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos', 'responsabilidad_civil', 'comercio', 'comunidades', 'accidentes', 'otros'] as const
export type RamoOportunidad = (typeof RAMOS_OPORTUNIDAD)[number]
/** Con qué estado puede nacer una oportunidad a mano: por contactar o ya interesado. */
export const ESTADOS_ALTA: readonly EstadoOportunidad[] = ['competencia', 'en_negociacion']

export type AltaValida = {
  ramo: RamoOportunidad
  estado: EstadoOportunidad
  fechaFinVigencia: string | null
  aseguradora: string | null
  prima: number | null
  /** El primer paso: nace con él, o no nace. */
  tarea: TareaValida
}

/**
 * Una oportunidad a mano nace con su PRIMER PASO (tipo + fecha): la regla del
 * embudo es que nada queda sin siguiente paso, y una oportunidad sin tarea no
 * sale en «Hoy» ni la mira nadie. Sin fecha de vencimiento es válida (la del
 * cliente que pide precio de algo nuevo), pero entonces no entra en el carril
 * de Vencimientos: eso lo dice la pantalla, no se inventa una fecha.
 */
export function validarAltaOportunidad(
  d: { ramo?: unknown; estado?: unknown; fechaFinVigencia?: unknown; aseguradora?: unknown; prima?: unknown; tipoTarea?: unknown; fechaTarea?: unknown; nota?: unknown },
  hoy: Date,
): { ok: true; alta: AltaValida } | { ok: false; motivo: string } {
  const ramo = RAMOS_OPORTUNIDAD.find(r => r === d.ramo)
  if (!ramo) return { ok: false, motivo: 'Elige el ramo.' }
  const estado = d.estado === undefined ? 'en_negociacion' : ESTADOS_ALTA.find(e => e === d.estado)
  if (!estado) return { ok: false, motivo: 'Una oportunidad nueva nace «por contactar» o «interesado».' }
  const campos = camposEditables(d)
  if (!campos.ok) return campos
  const nota = texto(d.nota, 2000)
  const t = validarTarea(
    { tipo: d.tipoTarea ?? 'llamada', prioridad: 'media', observaciones: nota ?? `Primer contacto: ${ramo.replace('_', ' ')}`, fechaLimite: d.fechaTarea },
    hoy,
  )
  if (!t.ok) return { ok: false, motivo: `Primer paso: ${t.motivo}` }
  return {
    ok: true,
    alta: {
      ramo,
      estado,
      fechaFinVigencia: campos.valores.fechaFinVigencia ?? null,
      aseguradora: campos.valores.aseguradora ?? null,
      prima: campos.valores.prima ?? null,
      tarea: t.tarea,
    },
  }
}

export type EdicionValida = {
  ramo?: RamoOportunidad
  fechaFinVigencia?: string | null
  aseguradora?: string | null
  prima?: number | null
}

/**
 * Lo que se corrige a mano de una oportunidad ABIERTA: ramo, vencimiento,
 * compañía y prima actuales. `undefined` = no tocar; `null`/'' = borrar. El
 * estado NO se edita aquí: para eso están las acciones, que exigen su motivo.
 */
export function validarEdicionOportunidad(
  d: { ramo?: unknown; fechaFinVigencia?: unknown; aseguradora?: unknown; prima?: unknown },
): { ok: true; cambios: EdicionValida } | { ok: false; motivo: string } {
  const out: EdicionValida = {}
  if (d.ramo !== undefined) {
    const ramo = RAMOS_OPORTUNIDAD.find(r => r === d.ramo)
    if (!ramo) return { ok: false, motivo: 'Ramo no válido.' }
    out.ramo = ramo
  }
  const campos = camposEditables(d)
  if (!campos.ok) return campos
  Object.assign(out, campos.valores)
  if (Object.keys(out).length === 0) return { ok: false, motivo: 'No hay nada que cambiar.' }
  return { ok: true, cambios: out }
}

function vacio(v: unknown): boolean {
  return v === null || (typeof v === 'string' && v.trim() === '')
}

function camposEditables(
  d: { fechaFinVigencia?: unknown; aseguradora?: unknown; prima?: unknown },
): { ok: true; valores: Omit<EdicionValida, 'ramo'> } | { ok: false; motivo: string } {
  const valores: Omit<EdicionValida, 'ramo'> = {}
  if (d.fechaFinVigencia !== undefined) {
    if (vacio(d.fechaFinVigencia)) valores.fechaFinVigencia = null
    else {
      const f = fechaIso(d.fechaFinVigencia)
      if (f === null) return { ok: false, motivo: 'La fecha de vencimiento no es válida (aaaa-mm-dd).' }
      valores.fechaFinVigencia = f
    }
  }
  if (d.aseguradora !== undefined) {
    if (!vacio(d.aseguradora) && typeof d.aseguradora !== 'string') return { ok: false, motivo: 'La compañía no es un texto.' }
    valores.aseguradora = texto(d.aseguradora, 120)
  }
  if (d.prima !== undefined) {
    const p = importe(d.prima)
    if (p === 'invalido') return { ok: false, motivo: 'La prima no es un importe válido (0 no es una prima: si no se sabe, déjala vacía).' }
    valores.prima = p
  }
  return { ok: true, valores }
}
