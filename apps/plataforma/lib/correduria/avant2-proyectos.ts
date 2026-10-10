/**
 * La lista de presupuestos del cliente en Avant2 (web o plataforma, 29/09/2026), leída de lo que
 * contesta asegura. PURO. Tres estados: `ok` con filas · `ok` vacío (mirado, no hay) · `error`
 * (no se ha podido mirar): un fallo nunca se pinta como «no tiene presupuestos».
 */

export type ProyectoAvant2 = {
  projectId: string
  creadoEn: string | null
  ramo: string | null
  lineaNombre: string | null
  riesgo: string | null
  companiaAnterior: string | null
  precios: number
  mejor: { compania: string | null; modalidad: string | null; primaEur: number | null; firme: boolean } | null
  confirmados: number
  avant2Url: string | null
  /** El proyecto no se pudo leer: se declara, no desaparece. */
  error: string | null
  /** `null` = aún no está en la intranet. `origen` = puerta con la que entró; `polizaId` = retarificación de esa póliza. */
  intranet: { tarificacionId: string; oportunidadId: string | null; polizaId: string | null; origen: string } | null
  /** Lo que dice Avant2 de su emisión (30/09/2026). `null` = asegura no lo manda o forma desconocida: no se afirma nada. */
  emision: EmisionResumen | null
}

/** Estado de la emisión de un proyecto en Avant2, tal como lo resume asegura. */
export type EmisionResumen = {
  estado: 'sin_solicitud' | 'aprobada' | 'pendiente' | 'rechazada' | 'desconocido'
  compania: string | null
  modalidad: string | null
  primaEur: number | null
  numeroPoliza: string | null
  solicitudId: string | null
  estadoVendor: string | null
  descripcion: string
}

export type ListaAvant2 = { estado: 'ok'; proyectos: ProyectoAvant2[] } | { estado: 'error'; mensaje: string }

type J = Record<string, unknown>
const o = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {})
const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const ESTADOS_EMISION: readonly EmisionResumen['estado'][] = ['sin_solicitud', 'aprobada', 'pendiente', 'rechazada', 'desconocido']

/** Puro. Sin `descripcion` o con un estado que no conocemos → `null`: no se pinta un estado inventado. */
export function leerEmisionResumen(v: unknown): EmisionResumen | null {
  if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) return null
  const e = v as J
  const estado = ESTADOS_EMISION.find((x) => x === e.estado)
  const descripcion = s(e.descripcion)
  if (!estado || !descripcion) return null
  return {
    estado,
    compania: s(e.compania),
    modalidad: s(e.modalidad),
    primaEur: n(e.primaEur),
    numeroPoliza: s(e.numeroPoliza),
    solicitudId: s(e.solicitudId),
    estadoVendor: s(e.estadoVendor),
    descripcion,
  }
}

/** Estados en los que tiene sentido «Registrar emisión en la intranet». */
export function emisionRegistrable(e: EmisionResumen | null): boolean {
  return e !== null && (e.estado === 'pendiente' || e.estado === 'aprobada' || e.estado === 'rechazada')
}

function fila(v: unknown): ProyectoAvant2 | null {
  const f = o(v)
  const projectId = s(f.projectId)
  if (!projectId) return null
  const m = f.mejor === null || f.mejor === undefined ? null : o(f.mejor)
  const i = f.intranet === null || f.intranet === undefined ? null : o(f.intranet)
  return {
    projectId,
    creadoEn: s(f.creadoEn),
    ramo: s(f.ramo),
    lineaNombre: s(f.lineaNombre),
    riesgo: s(f.riesgo),
    companiaAnterior: s(f.companiaAnterior),
    precios: n(f.precios) ?? 0,
    mejor: m ? { compania: s(m.compania), modalidad: s(m.modalidad), primaEur: n(m.primaEur), firme: m.firme === true } : null,
    confirmados: n(f.confirmados) ?? 0,
    avant2Url: s(f.avant2Url),
    error: s(f.error),
    intranet: i && s(i.tarificacionId) ? { tarificacionId: s(i.tarificacionId) as string, oportunidadId: s(i.oportunidadId), polizaId: s(i.polizaId), origen: s(i.origen) ?? '?' } : null,
    emision: leerEmisionResumen(f.emision),
  }
}

export function leerListaAvant2(status: number, json: unknown): ListaAvant2 {
  const j = o(json)
  if (status !== 200 || j.estado !== 'ok' || !Array.isArray(j.proyectos)) {
    return { estado: 'error', mensaje: s(j.mensaje) ?? `HTTP ${status}` }
  }
  const filas = j.proyectos.map(fila)
  // Una fila sin forma es un contrato roto, no un proyecto menos.
  if (filas.some((f) => f === null)) return { estado: 'error', mensaje: 'respuesta de asegura con forma desconocida' }
  return { estado: 'ok', proyectos: filas as ProyectoAvant2[] }
}

/**
 * Dónde se abre en plataforma. Una retarificación, en la pantalla de SU póliza: la de alta nueva
 * busca una tarificación con cliente y sin póliza, y abría otra o ninguna (bug del 29/09/2026).
 * Auto y moto abren ESA tarificación (`?oportunidad=&tarificacion=`); sin oportunidad, o en hogar
 * (que no admite abrir una concreta), la pantalla retoma la última del ramo, que puede ser otra.
 * `null` = ramo sin pantalla de tarificar.
 */
export function rutaTarificacion(clienteId: string, ramo: string | null, intranet: ProyectoAvant2['intranet'] = null): string | null {
  if (intranet?.polizaId) return `/correduria/poliza/${encodeURIComponent(intranet.polizaId)}/retarificar`
  if (ramo !== 'auto' && ramo !== 'moto' && ramo !== 'hogar') return null
  const base = `/correduria/cliente/${clienteId}/${ramo}-nuevo`
  if (ramo === 'hogar' || !intranet?.oportunidadId) return base
  return `${base}?oportunidad=${encodeURIComponent(intranet.oportunidadId)}&tarificacion=${encodeURIComponent(intranet.tarificacionId)}`
}

/** «Hecho en…»: la puerta `corredor`/`agente` es plataforma; sin fila en la intranet, la web de Avant2. */
export function origenProyecto(p: ProyectoAvant2): 'plataforma' | 'web (traído)' | 'web' {
  if (!p.intranet) return 'web'
  return p.intranet.origen === 'web' ? 'web (traído)' : 'plataforma'
}

// ─── Registrar en la intranet una emisión hecha en la web de Avant2 (30/09/2026) ───────────────

export type AccionEmision = 'acunar' | 'retener' | 'rechazar' | 'nada'

export type VistaEmisionExterna =
  | {
      estado: 'ok'
      projectId: string
      ramo: string | null
      emision: EmisionResumen
      estadoProyecto: 'riesgo_condicionado' | 'rechazada' | null
      accion: AccionEmision
      oportunidadId: string | null
      bloqueos: string[]
    }
  | { estado: 'error'; mensaje: string }

const ACCIONES: readonly AccionEmision[] = ['acunar', 'retener', 'rechazar', 'nada']

/** Puro. La vista previa (GET, gratis). Una forma rara es un error, nunca «no hay bloqueos». */
export function leerVistaEmision(status: number, json: unknown): VistaEmisionExterna {
  const j = o(json)
  if (status !== 200 || j.estado !== 'ok') return { estado: 'error', mensaje: s(j.mensaje) ?? `HTTP ${status}` }
  const projectId = s(j.projectId)
  const emision = leerEmisionResumen(j.emision)
  const accion = ACCIONES.find((x) => x === j.accion)
  const ep = j.estadoProyecto
  const estadoProyecto = ep === 'riesgo_condicionado' || ep === 'rechazada' ? ep : ep === null || ep === undefined ? null : undefined
  if (!projectId || !emision || !accion || estadoProyecto === undefined || !Array.isArray(j.bloqueos)) {
    return { estado: 'error', mensaje: 'respuesta de asegura con forma desconocida' }
  }
  const bloqueos = j.bloqueos.filter((b): b is string => typeof b === 'string' && b.trim() !== '')
  return { estado: 'ok', projectId, ramo: s(j.ramo), emision, estadoProyecto, accion, oportunidadId: s(j.oportunidadId), bloqueos }
}

/** Lo que va a pasar según `accion`, en una frase para el `confirm`. */
export function textoAccionEmision(a: AccionEmision): string {
  switch (a) {
    case 'acunar': return 'Se dará de alta la póliza en cartera y la oportunidad pasará a ganada.'
    case 'retener': return 'La póliza queda como EMITIDA pero RETENIDA por la compañía: no entra en cartera hasta que la libere (se comprueba sola dos veces al día).'
    case 'rechazar': return 'Se anotará que la compañía ha RECHAZADO la emisión; no entra nada en cartera.'
    case 'nada': return 'No hay nada que registrar: la intranet ya refleja este estado.'
  }
}

export type ResultadoEmisionExterna =
  | { estado: 'ok' | 'ya_emitida' | 'emitido_sin_acunar'; texto: string; numeroPoliza: string | null; polizaId: string | null; oportunidadGanada: boolean }
  | { estado: 'error'; texto: string }

/** Puro. El resultado del POST, con el texto que se enseña. */
export function leerResultadoEmision(status: number, json: unknown): ResultadoEmisionExterna {
  const j = o(json)
  const est = j.estado
  if (status === 200 && (est === 'ok' || est === 'ya_emitida' || est === 'emitido_sin_acunar')) {
    const partes = [s(j.descripcion), s(j.mensaje)].filter((x): x is string => x !== null)
    return {
      estado: est,
      texto: partes.length ? partes.join(' · ') : est,
      numeroPoliza: s(j.numeroPoliza),
      polizaId: s(j.polizaId),
      oportunidadGanada: j.oportunidadGanada === true,
    }
  }
  // Un 5xx o un corte en un POST puede haber escrito o no: se dice, no se supone.
  const base = s(j.mensaje) ?? `HTTP ${status}`
  return { estado: 'error', texto: status >= 500 ? `${base}. Recarga la lista antes de repetir: puede haberse registrado.` : base }
}
