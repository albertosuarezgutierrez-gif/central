/**
 * «Mi mesa» (rediseño 26/10/2026): qué hay ENTRE MANOS y qué va plegado debajo. PURO (sin red ni JSX).
 *
 * Cada expediente cae en UNA sección (`seccionMesa(e, hoy)`, con `hoy` inyectado). Prioridad:
 *   1) aparcada → «Aparcadas» (la decide asegura con `estadoVisible`; nunca sale en las demás);
 *   2) «Entre manos» (abierta, arriba) si cumple ALGUNO de los brazos de `motivosEntreManos`:
 *      contacto humano ≤30 d · petición explícita del cliente · siguiente paso vencido · nº de solicitud o
 *      esperando cliente · rescate/retención · vencimiento de póliza ≤60 d · creada ≤21 d y no es póliza subida.
 *      Una renovación automática sin tocar (`trabajada === false`) solo entra por contacto, petición, rescate o
 *      vencimiento: su tarea vencida y su alta reciente son ruido del vencimiento, no trabajo;
 *   3) plegadas: «Pólizas subidas» (subida por el cliente, vence >60 d), «Renovaciones de cartera sin tocar»,
 *      «Leads antiguos sin contacto» (del volcado, o sin contacto humano >30 d y creados hace >30 d);
 *   4) lo demás, y todo lo que no se sabe (`origen`/`ultimoContacto`/vencimiento `null`) → Entre manos:
 *      ante la duda NO se esconde. La antigüedad de un lead NO sale de `fechaFinVigencia` (la del volcado está mal).
 */
import type { Expediente, Expedientes, PerdidaPorRevisar, TareaSuelta } from './expedientes.ts'

export type SeccionMesa = 'entreManos' | 'subidas' | 'renovaciones' | 'leadsAntiguos' | 'aparcadas'

/** Orden en pantalla de las secciones de expedientes (las demás —sueltas, pérdidas, correos— las pone la pantalla). */
export const SECCIONES_MESA: readonly SeccionMesa[] = ['entreManos', 'subidas', 'leadsAntiguos', 'renovaciones', 'aparcadas']

export const TITULO_SECCION: Record<SeccionMesa, string> = {
  entreManos: 'Entre manos',
  subidas: 'Pólizas subidas · vencen más adelante',
  renovaciones: 'Renovaciones de cartera sin tocar',
  leadsAntiguos: 'Leads antiguos sin contacto',
  aparcadas: 'Aparcadas',
}

export const VACIO_SECCION: Record<SeccionMesa, string> = {
  entreManos: 'Nada entre manos.',
  subidas: 'Ninguna póliza subida pendiente.',
  renovaciones: 'Ninguna renovación sin tocar.',
  leadsAntiguos: 'Ningún lead antiguo.',
  aparcadas: 'Nada aparcado.',
}

/** Días de la ventana de contacto humano, de la antigüedad de un lead y de «recién entrado». */
export const DIAS_CONTACTO = 30
export const DIAS_RECIEN = 21
/** Preaviso legal (1 mes) + 30 días para negociar y presupuestar. */
export const DIAS_VENCE = 60

/** Fecha `aaaa-mm-dd` de una cadena (acepta ISO con hora); `null` si no es una fecha. */
export function soloDia(v: string | null): string | null {
  if (!v) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v)
  return m ? m[1] : null
}

/** Días de `desde` a `hasta` (negativo si `hasta` es anterior). */
function dias(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000)
}

/** Póliza SUBIDA por el cliente al portal (o declarada) sin pedir precio: no es una petición. */
export function esSubida(e: Pick<Expediente, 'origen'>): boolean {
  return e.origen === 'documento:portal' || e.origen === 'portal:declarada'
}

/** Petición EXPLÍCITA del cliente: correo/formulario de lead, web, portal (también «mejórame el precio» y el aviso de vencimiento). */
export function esPeticion(e: Pick<Expediente, 'origen'>): boolean {
  const o = e.origen
  if (o === null || esSubida(e)) return false
  return o === 'correo:lead' || o.startsWith('web:') || o.startsWith('portal:')
}

/** Contacto humano en los últimos `DIAS_CONTACTO` días. `null` = no hay dato o no hay contacto (no es «reciente»). */
export function contactoReciente(e: Pick<Expediente, 'ultimoContacto'>, hoy: string): boolean {
  const d = soloDia(e.ultimoContacto)
  return d !== null && dias(d, hoy) <= DIAS_CONTACTO
}

/** Días hasta el vencimiento de la póliza (negativo = ya vencida); `null` = no se sabe. */
export function diasAlVencimiento(e: Pick<Expediente, 'vencimiento'>, hoy: string): number | null {
  const d = soloDia(e.vencimiento)
  return d === null ? null : dias(hoy, d)
}

/** Días desde que se creó (ISO con hora → día). `null` si la fecha no se lee. */
export function antiguedadDias(e: Pick<Expediente, 'creada'>, hoy: string): number | null {
  const d = soloDia(e.creada)
  return d === null ? null : dias(d, hoy)
}

export type MotivoEntreManos = 'contacto' | 'peticion' | 'vencido' | 'compania' | 'rescate' | 'vence' | 'reciente'

/** Qué brazos del OR de «Entre manos» cumple. Una aparcada no se evalúa aquí. */
export function motivosEntreManos(e: Expediente, hoy: string): MotivoEntreManos[] {
  const m: MotivoEntreManos[] = []
  if (contactoReciente(e, hoy)) m.push('contacto')
  if (esPeticion(e)) m.push('peticion')
  const f = soloDia(e.proximaAccion?.fecha ?? null)
  if (f !== null && f <= hoy) m.push('vencido')
  if (e.solicitudCompania !== null || e.estadoVisible === 'esperando_cliente') m.push('compania')
  if (e.clase === 'rescate') m.push('rescate')
  const v = diasAlVencimiento(e, hoy)
  if (v !== null && v <= DIAS_VENCE) m.push('vence')
  const a = antiguedadDias(e, hoy)
  if (a !== null && a <= DIAS_RECIEN && !esSubida(e)) m.push('reciente')
  return m
}

/** Brazos que bastan para sacar a una renovación automática sin tocar de su sección plegada. */
const BRAZOS_RENOVACION: readonly MotivoEntreManos[] = ['contacto', 'peticion', 'rescate', 'vence']

export function seccionMesa(e: Expediente, hoy: string): SeccionMesa {
  if (e.estadoVisible === 'aparcada') return 'aparcadas'
  const motivos = motivosEntreManos(e, hoy)
  if (e.trabajada === false) return motivos.some(x => BRAZOS_RENOVACION.includes(x)) ? 'entreManos' : 'renovaciones'
  if (motivos.length > 0) return 'entreManos'
  if (esSubida(e)) return diasAlVencimiento(e, hoy) === null ? 'entreManos' : 'subidas'
  // Sin brazo que lo suba: lead antiguo si es del volcado, o si CONSTA que no hay contacto reciente y lleva >30 d.
  const a = antiguedadDias(e, hoy)
  const sinContacto = e.contactoConsta && !contactoReciente(e, hoy)
  if (e.delVolcado || (sinContacto && a !== null && a > DIAS_CONTACTO)) return 'leadsAntiguos'
  return 'entreManos'
}

export type OrigenMesa = 'Portal' | 'Correo' | 'Web' | 'Presupuesto' | 'Cartera'

/** Insignia de origen de la tarjeta. `null` = no consta cómo entró: no se inventa una. */
export function origenInsignia(e: Pick<Expediente, 'origen' | 'delVolcado'>): OrigenMesa | null {
  const o = e.origen
  if (o !== null) {
    if (o.startsWith('portal:') || o.startsWith('documento:portal')) return 'Portal'
    if (o.startsWith('correo:')) return 'Correo'
    if (o.startsWith('web:')) return 'Web'
    if (o.startsWith('presupuesto')) return 'Presupuesto'
    if (o === 'renovacion_cartera') return 'Cartera'
  }
  return e.delVolcado ? 'Cartera' : null
}

/** «vence en 12 d» · «vence hoy» · «vencida hace 3 d». `null` = vencimiento que no se sabe (no se pinta nada). */
export function textoVencimiento(e: Pick<Expediente, 'vencimiento'>, hoy: string): string | null {
  const n = diasAlVencimiento(e, hoy)
  if (n === null) return null
  if (n === 0) return 'vence hoy'
  return n > 0 ? `vence en ${n} d` : `vencida hace ${-n} d`
}

/** «entró hoy» · «entró hace 5 d». `null` si la fecha no se lee. */
export function textoAntiguedad(e: Pick<Expediente, 'creada'>, hoy: string): string | null {
  const n = antiguedadDias(e, hoy)
  if (n === null) return null
  return n <= 0 ? 'entró hoy' : `entró hace ${n} d`
}

const FIN = '9999-12-31'

/** Rango y clave de orden dentro de «Entre manos» (menor = antes). */
function claveEntreManos(e: Expediente, hoy: string): { rango: number; clave: string } {
  const motivos = motivosEntreManos(e, hoy)
  const f = soloDia(e.proximaAccion?.fecha ?? null)
  if (motivos.includes('vencido')) return { rango: 0, clave: f ?? FIN }
  if (motivos.includes('peticion') && !contactoReciente(e, hoy)) return { rango: 1, clave: soloDia(e.creada) ?? FIN }
  if (motivos.includes('vence') || motivos.includes('rescate')) {
    const v = motivos.includes('vence') ? soloDia(e.vencimiento) : null
    const efecto = soloDia(e.rescate?.recibo?.efecto ?? null)
    return { rango: 2, clave: [v, efecto].filter((x): x is string => x !== null).sort()[0] ?? FIN }
  }
  // Recién entrado: el más nuevo primero (el día se invierte para que ordene ascendente).
  if (motivos.includes('reciente')) return { rango: 3, clave: String(99_999_999 - Number((soloDia(e.creada) ?? '0').replace(/-/g, ''))).padStart(8, '0') }
  if (motivos.includes('contacto') || motivos.includes('peticion')) return { rango: 4, clave: f ?? FIN }
  if (motivos.includes('compania')) return { rango: 5, clave: f ?? FIN }
  return { rango: 6, clave: f ?? FIN }
}

function porPrimaEId(a: Expediente, b: Expediente): number {
  if (a.prima !== b.prima) {
    if (a.prima === null) return 1
    if (b.prima === null) return -1
    return b.prima - a.prima
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Orden de «Entre manos»: siguiente paso vencido (el más antiguo) → cliente esperando respuesta → vence ≤60 d (el más
 * cercano) → recién entrado → con contacto → la pelota la tiene otro (compañía / esperando cliente). Empate: prima mayor,
 * null al final. Las del MISMO cliente (por `clienteId`, nunca por nombre) quedan juntas, bajo la mejor de ellas.
 */
export function ordenarEntreManos(lista: readonly Expediente[], hoy: string): Expediente[] {
  const claves = new Map(lista.map(e => [e.id, claveEntreManos(e, hoy)]))
  const cmp = (a: Expediente, b: Expediente): number => {
    const ka = claves.get(a.id)!
    const kb = claves.get(b.id)!
    if (ka.rango !== kb.rango) return ka.rango - kb.rango
    if (ka.clave !== kb.clave) return ka.clave < kb.clave ? -1 : 1
    return porPrimaEId(a, b)
  }
  const grupos = new Map<string, Expediente[]>()
  for (const e of lista) grupos.set(e.clienteId, [...(grupos.get(e.clienteId) ?? []), e])
  const ordenados = [...grupos.values()].map(g => g.sort(cmp))
  ordenados.sort((a, b) => cmp(a[0], b[0]))
  return ordenados.flat()
}

/** Por vencimiento (el más cercano primero; sin fecha al final), luego prima mayor. */
function porVencimiento(a: Expediente, b: Expediente): number {
  const fa = soloDia(a.vencimiento)
  const fb = soloDia(b.vencimiento)
  if (fa !== fb) {
    if (fa === null) return 1
    if (fb === null) return -1
    return fa < fb ? -1 : 1
  }
  return porPrimaEId(a, b)
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
  return porPrimaEId(a, b)
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

export function repartirMesa(expedientes: readonly Expediente[], hoy: string): Record<SeccionMesa, Expediente[]> {
  const out: Record<SeccionMesa, Expediente[]> = { entreManos: [], subidas: [], renovaciones: [], leadsAntiguos: [], aparcadas: [] }
  for (const e of expedientes) out[seccionMesa(e, hoy)].push(e)
  out.entreManos = ordenarEntreManos(out.entreManos, hoy)
  out.subidas.sort(porVencimiento)
  out.renovaciones.sort(comparar)
  out.leadsAntiguos.sort(comparar)
  out.aparcadas.sort(comparaAparcadas)
  return out
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
  bloques: Record<SeccionMesa, Expediente[]>
  sueltas: Lectura<TareaSueltaMesa>
  /** La lista llegó recortada: hay más tareas sueltas de las que se ven. */
  sueltasTruncado: boolean
  perdidas: Lectura<PerdidaPorRevisar>
  /** Pérdidas que no se listan porque su póliza ya tiene expediente. `null` = no consta (no se supone 0). */
  perdidasConExpediente: number | null
}

/** Reparte TODO lo que trae el puerto en la mesa: las secciones + tareas sueltas + pérdidas por revisar. */
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
