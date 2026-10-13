// packages/module-seguros/src/expedientes.ts
//
// «Mis expedientes» (13/10/2026): la lista de lo que Alberto tiene abierto en TODOS los clientes. Un
// expediente ES una fila de `seguros.oportunidades` (no hay tabla nueva); aquí solo se decide cómo se
// PINTA: su clase, su estado visible, si entra en la lista, cuándo vuelve un rescate perdido y cuánto
// se pospone. PURO (sin BD ni red): `node --test`.
//
// Decisiones de Alberto (13/10/2026, «muy simplificado»):
//   · Tres clases: venta nueva · mejora/renovación · rescate. Siniestros, fuera.
//   · Estados visibles: Abierta (por contactar + negociando juntos) · Esperando cliente · Aparcada
//     hasta dd/mm · Ganada · Perdida. «Aparcada» NO es un valor del enum: es la marca `aparcada_hasta`,
//     y así la oportunidad conserva el estado al que vuelve.
//   · Un rescate de recibo devuelto PERDIDO se aparca solo hasta el año siguiente.

import { DIAS_AVISO_OPORTUNIDAD, fechaAvisoOportunidad } from './oportunidad-aviso.ts'
import { ORIGEN_DEVOLUCION } from './seguimiento-devolucion.ts'
import { ORIGEN_RETENCION } from './retencion-fuga.ts'

export const CLASES_EXPEDIENTE = ['venta_nueva', 'mejora_renovacion', 'rescate'] as const
export type ClaseExpediente = (typeof CLASES_EXPEDIENTE)[number]

export const ROTULO_CLASE: Record<ClaseExpediente, string> = {
  venta_nueva: 'Venta nueva',
  mejora_renovacion: 'Mejora / renovación',
  rescate: 'Rescate',
}

/** Origen de la oportunidad del año siguiente que abre un rescate de recibo PERDIDO a mano. */
export const ORIGEN_RESCATE_PERDIDO = 'rescate_perdido'
/** Origen de la oportunidad del año siguiente que abre «el cliente se va» desde el recibo devuelto. */
export const ORIGEN_BAJA_VERIFICADA = 'baja_verificada'

/**
 * Orígenes (`info_riesgo.origen`) que son una MEJORA del seguro que el cliente ya tiene o tuvo: el año
 * siguiente de una baja o de un rescate perdido, el «mejórame el precio» del portal y el «avísame»
 * del vencimiento de la web.
 */
const ORIGENES_MEJORA: ReadonlySet<string> = new Set([
  ORIGEN_BAJA_VERIFICADA,
  ORIGEN_RESCATE_PERDIDO,
  'portal:mejorar-precio',
  'web:aviso-vencimiento',
])

export type EntradaClase = {
  /** `oportunidades.fuente` (enum heredado: renovacion, venta_directa, otros…). */
  fuente: string | null
  /** `info_riesgo->>'origen'`. */
  origen: string | null
  /** `info_riesgo->>'motivo'` (las abiertas A MANO por un devuelto llevan aquí `recibo_devuelto`). */
  motivo: string | null
}

/** ¿Es el rescate de un recibo DEVUELTO? (No una retención por anulación de CIMA.) */
export function esRescateDeRecibo(e: EntradaClase): boolean {
  return e.origen === ORIGEN_DEVOLUCION || e.motivo === ORIGEN_DEVOLUCION
}

/**
 * La clase del expediente. Sin columna propia: sale de `fuente` + `info_riesgo`. Lo que no es rescate ni
 * mejora es VENTA NUEVA (el valor de cajón `otros` del enum no llega nunca a la pantalla como «otro»).
 */
export function claseOportunidad(e: EntradaClase): ClaseExpediente {
  if (esRescateDeRecibo(e) || e.origen === ORIGEN_RETENCION) return 'rescate'
  if (e.fuente === 'renovacion' || (e.origen !== null && ORIGENES_MEJORA.has(e.origen))) return 'mejora_renovacion'
  return 'venta_nueva'
}

export const ESTADOS_VISIBLES = ['abierta', 'esperando_cliente', 'aparcada', 'ganada', 'perdida'] as const
export type EstadoVisible = (typeof ESTADOS_VISIBLES)[number]

export const ROTULO_ESTADO_VISIBLE: Record<EstadoVisible, string> = {
  abierta: 'Abierta',
  esperando_cliente: 'Esperando cliente',
  aparcada: 'Aparcada',
  ganada: 'Ganada',
  perdida: 'Perdida',
}

/**
 * El estado que ve Alberto. Aparcada = `aparcada_hasta` POSTERIOR a hoy (el día de la vuelta ya es
 * «abierta» otra vez: ese día le toca). Una cerrada nunca se pinta aparcada. Un estado del enum que no
 * se conoce → `null`: no se adivina.
 */
export function estadoVisible(o: { estado: string; aparcadaHasta: string | null }, hoyIso: string): EstadoVisible | null {
  if (o.estado === 'ganada') return 'ganada'
  if (o.estado === 'perdida') return 'perdida'
  if (o.estado !== 'competencia' && o.estado !== 'en_negociacion' && o.estado !== 'pendiente_cliente') return null
  if (o.aparcadaHasta !== null && o.aparcadaHasta > hoyIso) return 'aparcada'
  return o.estado === 'pendiente_cliente' ? 'esperando_cliente' : 'abierta'
}

/**
 * ¿Entra en «Mis expedientes»? Solo las abiertas (aparcadas incluidas), y NUNCA la bolsa del volcado del
 * CRM anterior sin tocar (`import_ref` + `competencia`: ~3.670 leads que viven en Vencimientos). Lo del
 * volcado que ya se movió a negociación o a esperar al cliente sí entra: eso ya es trabajo de Alberto.
 */
export function esExpedienteDeTrabajo(o: { estado: string; delVolcado: boolean }): boolean {
  if (o.estado !== 'competencia' && o.estado !== 'en_negociacion' && o.estado !== 'pendiente_cliente') return false
  return !(o.delVolcado && o.estado === 'competencia')
}

// ── Fechas ──────────────────────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/

function valida(s: string | null | undefined): string | null {
  if (typeof s !== 'string' || !ISO.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** El mismo día del año siguiente (29/02 → 28/02). */
function unAnioDespues(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  const dia = Math.min(d, new Date(Date.UTC(a + 1, m, 0)).getUTCDate())
  return `${a + 1}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/**
 * El primer aniversario de `base` POSTERIOR a hoy en los 3 años siguientes; `null` si la base es más
 * vieja (un dato así no se estira: misma regla que `vencimientoCompetencia()` de apps/asegura).
 */
function siguienteAniversario(base: string, hoy: string): string | null {
  const [a, m, d] = base.split('-').map(Number)
  for (let anio = a; anio <= a + 3; anio++) {
    const dia = Math.min(d, new Date(Date.UTC(anio, m, 0)).getUTCDate())
    const iso = `${anio}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    if (iso > hoy) return iso
  }
  return null
}

/** Tope de `aplicarAccion('aparcar')`: un aparcado más largo no se acepta. */
const MAX_DIAS_APARCADA = 400

export type VueltaRescate = {
  /** El vencimiento que se usó, REAL (de la póliza o del recibo). `null` = no había ninguno legible. */
  vence: string | null
  /** Hasta cuándo queda aparcada la del año siguiente (y el día de su próxima acción). */
  aparcadaHasta: string
  /** `true` = sin vencimiento: se ha contado +12 meses desde hoy. */
  estimada: boolean
}

/**
 * Cuándo vuelve un rescate de recibo devuelto PERDIDO (Alberto, 13/10/2026: «se aparca solo hasta el año
 * siguiente: vencimiento de la póliza o +12 meses si no hay»).
 *
 * El vencimiento es el primer aniversario POSTERIOR a hoy del efecto del recibo que no pagó (el día en
 * que dejó de estar con nosotros: su seguro nuevo renueva entonces; con recibos fraccionados el
 * vencimiento de NUESTRA póliza ya no dice nada); sin él, el del vencimiento de la póliza; sin ninguno,
 * hoy + 12 meses (y se marca `estimada`: no se escribe como vencimiento, no se inventa un día). Es la
 * misma prioridad que `vencimientoCompetencia()` de «el cliente se va» (apps/asegura). Vuelve
 * {@link DIAS_AVISO_OPORTUNIDAD} días ANTES de ese vencimiento —la regla única de toda oportunidad: el
 * día del vencimiento ya es tarde para pasarle precio—, nunca antes de mañana ni a más de 400 días.
 */
export function vueltaRescatePerdido(e: { vencimientoPoliza: string | null; efectoRecibo: string | null; hoy: string }): VueltaRescate {
  const hoy = e.hoy
  const pol = valida(e.vencimientoPoliza)
  const efe = valida(e.efectoRecibo)
  const vence = (efe ? siguienteAniversario(efe, hoy) : null) ?? (pol ? siguienteAniversario(pol, hoy) : null)
  const objetivo = vence ?? unAnioDespues(hoy)
  let hasta = fechaAvisoOportunidad(objetivo, hoy)
  const tope = sumarDias(hoy, MAX_DIAS_APARCADA)
  if (hasta > tope) hasta = tope
  return { vence, aparcadaHasta: hasta, estimada: vence === null }
}

// ── Posponer la próxima acción ──────────────────────────────────────────────

/** Más de un año no es posponer: es aparcar (con su motivo). */
export const MAX_DIAS_POSPONER = 365

/**
 * «Posponer N días»: la próxima acción pasa a hoy + N. `dias` entero de 1 a {@link MAX_DIAS_POSPONER};
 * cualquier otra cosa se rechaza con su motivo (nunca se convierte en 0 ni en «mañana»).
 */
export function fechaPospuesta(dias: unknown, hoyIso: string): { ok: true; fecha: string; dias: number } | { ok: false; motivo: string } {
  const n = typeof dias === 'number' ? dias : typeof dias === 'string' && /^\d+$/.test(dias.trim()) ? Number(dias.trim()) : Number.NaN
  if (!Number.isInteger(n) || n < 1 || n > MAX_DIAS_POSPONER) {
    return { ok: false, motivo: `Los días a posponer deben ser un entero de 1 a ${MAX_DIAS_POSPONER} (para más, aparca con su motivo).` }
  }
  const hoy = valida(hoyIso)
  if (!hoy) return { ok: false, motivo: 'Fecha de hoy no válida.' }
  return { ok: true, fecha: sumarDias(hoy, n), dias: n }
}

/** Texto de la próxima acción que deja aparcar: la que la hace volver sola el día de la vuelta. */
export const PREFIJO_RETOMAR = 'Retomar: '

export function textoRetomar(motivo: string | null): string {
  const m = (motivo ?? '').trim()
  return `${PREFIJO_RETOMAR}${m === '' ? 'vuelve del aparcado' : m}`.slice(0, 500)
}

// ── Notas libres ─────────────────────────────────────────────────────────────

export const MAX_NOTAS = 4000

/**
 * Las notas libres de una oportunidad (13/10/2026: «un recordatorio para el año que viene»). `''`/`null`
 * = borrarlas; texto = guardarlo recortado; otra cosa = inválido.
 */
export function notasEditadas(v: unknown): string | null | 'invalido' {
  if (v === null) return null
  if (typeof v !== 'string') return 'invalido'
  const t = v.replace(/\r\n/g, '\n').trim()
  return t === '' ? null : t.slice(0, MAX_NOTAS)
}
