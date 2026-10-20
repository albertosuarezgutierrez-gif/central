/**
 * «Mi mesa» (13/10/2026): cómo se reparten los expedientes en los cinco bloques fijos. PURO (sin red ni JSX).
 *
 * Cada expediente cae en UN solo bloque. Prioridad de asignación:
 *   1) aparcada (la decide asegura con `estadoVisible`) → «Aparcadas»; NUNCA sale en los demás: una aparcada
 *      con la próxima acción vencida no es trabajo de hoy, vuelve sola el día que toca;
 *   1b) renovación automática SIN contacto (`trabajada === false`, y no es rescate) → «Renovaciones sin tocar»
 *      (20/10/2026: Mi mesa es lo que Alberto ha trabajado; el ruido del vencimiento va plegado al final);
 *   2) próxima acción con fecha ≤ hoy → «Hoy y vencido»;
 *   3) clase rescate → «Rescates» (lleva su recibo y su plazo; no se esconde entre las abiertas);
 *   4) esperando al cliente → «Esperando cliente»;
 *   5) el resto → «Abiertas».
 * El ORDEN en pantalla es el de `BLOQUES_MESA`. Una próxima acción SIN fecha no es «hoy»: nadie la ha
 * puesto en el calendario, así que va a su bloque y se marca como huérfana (`sinFecha`).
 */
import type { Expediente, Expedientes, PerdidaPorRevisar, TareaSuelta } from './expedientes.ts'

export type BloqueMesa = 'hoy' | 'abiertas' | 'esperando' | 'rescates' | 'aparcadas' | 'sinTocar'

export const BLOQUES_MESA: readonly BloqueMesa[] = ['hoy', 'abiertas', 'esperando', 'rescates', 'aparcadas', 'sinTocar']

export const TITULO_BLOQUE: Record<BloqueMesa, string> = {
  hoy: 'Hoy y vencido',
  abiertas: 'Abiertas',
  esperando: 'Esperando cliente',
  rescates: 'Rescates',
  aparcadas: 'Aparcadas',
  sinTocar: 'Renovaciones sin tocar',
}

export const VACIO_BLOQUE: Record<BloqueMesa, string> = {
  hoy: 'Nada vencido.',
  abiertas: 'Ninguna abierta.',
  esperando: 'Nadie te debe respuesta.',
  rescates: 'Ningún rescate pendiente.',
  aparcadas: 'Nada aparcado.',
  sinTocar: 'Ninguna renovación sin tocar.',
}

/** Fecha `aaaa-mm-dd` de una cadena (acepta ISO con hora); `null` si no es una fecha. */
export function soloDia(v: string | null): string | null {
  if (!v) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v)
  return m ? m[1] : null
}

export function bloqueDe(e: Expediente, hoy: string): BloqueMesa {
  if (e.estadoVisible === 'aparcada') return 'aparcadas'
  if (e.trabajada === false && e.clase !== 'rescate') return 'sinTocar'
  const f = soloDia(e.proximaAccion?.fecha ?? null)
  if (f !== null && f <= hoy) return 'hoy'
  if (e.clase === 'rescate') return 'rescates'
  if (e.estadoVisible === 'esperando_cliente') return 'esperando'
  return 'abiertas'
}

/** Primero lo que antes toca; sin fecha al final; a igualdad, la prima mayor (null al final); luego el id (estable). */
function comparar(a: Expediente, b: Expediente): number {
  const fa = soloDia(a.proximaAccion?.fecha ?? null)
  const fb = soloDia(b.proximaAccion?.fecha ?? null)
  if (fa !== fb) {
    if (fa === null) return 1
    if (fb === null) return -1
    return fa < fb ? -1 : 1
  }
  if (a.prima !== b.prima) {
    if (a.prima === null) return 1
    if (b.prima === null) return -1
    return b.prima - a.prima
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function comparaAparcadas(a: Expediente, b: Expediente): number {
  const fa = soloDia(a.aparcadaHasta)
  const fb = soloDia(b.aparcadaHasta)
  if (fa !== fb) {
    if (fa === null) return 1
    if (fb === null) return -1
    return fa < fb ? -1 : 1
  }
  return a.id < b.id ? -1 : 1
}

export function repartirMesa(expedientes: readonly Expediente[], hoy: string): Record<BloqueMesa, Expediente[]> {
  const out: Record<BloqueMesa, Expediente[]> = { hoy: [], abiertas: [], esperando: [], rescates: [], aparcadas: [], sinTocar: [] }
  for (const e of expedientes) out[bloqueDe(e, hoy)].push(e)
  for (const b of BLOQUES_MESA) out[b].sort(b === 'aparcadas' ? comparaAparcadas : comparar)
  return out
}

function dias(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000)
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «12 mar» / «12 mar 2027» (otro año) — sin depender de la zona del navegador. */
export function fechaCorta(iso: string | null, hoy: string): string {
  const d = soloDia(iso)
  if (!d) return '—'
  const [y, m, dd] = d.split('-').map(Number)
  const base = `${dd} ${MESES[m - 1]}`
  return y === Number(hoy.slice(0, 4)) ? base : `${base} ${y}`
}

/** «hoy» · «hace 3 d» · «mañana» · «en 5 d» · «12 mar» (más lejos de 14 días) · «sin fecha». */
export function cuandoRelativo(iso: string | null, hoy: string): string {
  const d = soloDia(iso)
  if (!d) return 'sin fecha'
  const n = dias(hoy, d)
  if (n === 0) return 'hoy'
  if (n === -1) return 'ayer'
  if (n < 0) return `hace ${-n} d`
  if (n === 1) return 'mañana'
  if (n <= 14) return `en ${n} d`
  return fechaCorta(d, hoy)
}

/** Suma `n` días a una fecha `aaaa-mm-dd`. */
export function masDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** «El año que viene» = el mismo día del año siguiente (29 feb → 28 feb). */
export function mismoDiaAnoQueViene(hoy: string): string {
  const [y, m, d] = hoy.split('-').map(Number)
  const ult = new Date(Date.UTC(y + 1, m, 0)).getUTCDate()
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, ult)).padStart(2, '0')}`
}

/** Los atajos de «Aparcar hasta». El puerto admite hasta 13 meses (~395 d): ninguno lo pasa. */
export function atajosAparcar(hoy: string): { clave: string; rotulo: string; fecha: string }[] {
  const mas = (meses: number) => {
    const [y, m, d] = hoy.split('-').map(Number)
    const t = m - 1 + meses
    const ay = y + Math.floor(t / 12)
    const am = ((t % 12) + 12) % 12
    const ult = new Date(Date.UTC(ay, am + 1, 0)).getUTCDate()
    return `${ay}-${String(am + 1).padStart(2, '0')}-${String(Math.min(d, ult)).padStart(2, '0')}`
  }
  return [
    { clave: '3m', rotulo: '+3 meses', fecha: mas(3) },
    { clave: '6m', rotulo: '+6 meses', fecha: mas(6) },
    { clave: 'ano', rotulo: 'El año que viene', fecha: mismoDiaAnoQueViene(hoy) },
  ]
}

// ── Tareas sueltas y pérdidas por revisar (13/10/2026) ──────────────────────────────────────────────
// Lo que asegura manda ADEMÁS de los expedientes. Tres estados cada una: `null` = no se pudo leer en
// asegura (se DICE, nunca «no hay»), `[]` = leído y vacío (no ocupa sitio), filas = trabajo.

/** Lectura de una lista opcional del puerto. */
export type Lectura<T> = { estado: 'no_leido' } | { estado: 'ok'; filas: T[] }

export type TareaSueltaMesa = TareaSuelta & { dia: string | null; vencida: boolean }

/** Primero lo vencido y lo de hoy (más antigua antes); sin fecha al final; a igualdad, por id (estable). */
export function ordenarTareasSueltas(tareas: readonly TareaSuelta[], hoy: string): TareaSueltaMesa[] {
  const filas = tareas.map(t => {
    const dia = soloDia(t.fecha)
    return { ...t, dia, vencida: dia !== null && dia <= hoy }
  })
  return filas.sort((a, b) => {
    if (a.dia !== b.dia) {
      if (a.dia === null) return 1
      if (b.dia === null) return -1
      return a.dia < b.dia ? -1 : 1
    }
    return a.tareaId < b.tareaId ? -1 : a.tareaId > b.tareaId ? 1 : 0
  })
}

/** Por cliente y póliza, para que las del mismo cliente queden juntas; estable por id. */
export function ordenarPerdidas(perdidas: readonly PerdidaPorRevisar[]): PerdidaPorRevisar[] {
  const clave = (p: PerdidaPorRevisar) => `${(p.cliente ?? '\uffff').toLowerCase()}|${p.polizaNumero ?? ''}|${p.id}`
  return [...perdidas].sort((a, b) => (clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0))
}

export type MesaCompleta = {
  bloques: Record<BloqueMesa, Expediente[]>
  sueltas: Lectura<TareaSueltaMesa>
  /** La lista llegó recortada: hay más tareas sueltas de las que se ven. */
  sueltasTruncado: boolean
  perdidas: Lectura<PerdidaPorRevisar>
  /** Pérdidas que no se listan porque su póliza ya tiene expediente. `null` = no consta (no se supone 0). */
  perdidasConExpediente: number | null
}

/** Reparte TODO lo que trae el puerto en la mesa: los cinco bloques + tareas sueltas + pérdidas por revisar. */
export function repartirMesaCompleta(d: Extract<Expedientes, { estado: 'ok' }>, hoy: string): MesaCompleta {
  return {
    bloques: repartirMesa(d.expedientes, hoy),
    sueltas: d.tareasSueltas === null ? { estado: 'no_leido' } : { estado: 'ok', filas: ordenarTareasSueltas(d.tareasSueltas, hoy) },
    sueltasTruncado: d.tareasSueltasTruncado,
    perdidas: d.perdidasPorRevisar === null ? { estado: 'no_leido' } : { estado: 'ok', filas: ordenarPerdidas(d.perdidasPorRevisar) },
    perdidasConExpediente: d.perdidasConExpediente,
  }
}

/** Motivos de pérdida de una póliza de cartera (los mismos que la pantalla de pérdidas de cartera de siempre). */
export const ROTULO_MOTIVO_PERDIDA: Record<string, string> = {
  precio: 'Precio',
  competidor: 'Se fue a otro corredor/compañía',
  coberturas: 'Coberturas',
  cliente_desiste: 'Ya no lo necesita',
  sin_respuesta: 'Sin respuesta',
  no_contactable: 'No contactable',
  ya_asegurado: 'Ya estaba asegurado',
  otro: 'Otro',
}

const AMBIGUO_TAREA = 'No se ha podido confirmar si se guardó: recarga para verlo antes de repetirlo.'

/**
 * Resultado de `PATCH /api/correduria/oportunidad/tarea` (tarea suelta) → `null` si se guardó, o el motivo que
 * se enseña en la fila. 409 (hito de devolución o ya cerrada) y 404 se DICEN con su motivo; un 5xx o una
 * respuesta ilegible es «no sé si se guardó» (no se afirma ni éxito ni fallo).
 */
export function motivoFalloTareaSuelta(status: number, json: unknown): string | null {
  const j = (typeof json === 'object' && json !== null ? json : {}) as { motivo?: unknown; estado?: unknown }
  const motivo = typeof j.motivo === 'string' && j.motivo.trim() !== '' ? j.motivo.trim() : null
  if (status >= 200 && status < 300 && j.estado !== 'error' && j.estado !== 'invalido') return null
  if (status === 409) return `No se ha guardado: ${motivo ?? 'es un hito de devolución o ya está cerrada.'}`
  if (status === 404) return `No se ha guardado: ${motivo ?? 'la tarea ya no existe.'}`
  if (status >= 500 || status === 0) return AMBIGUO_TAREA
  return `No se ha guardado: ${motivo ?? `HTTP ${status}`}`
}
