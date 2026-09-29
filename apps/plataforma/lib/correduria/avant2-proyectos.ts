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
  /** `null` = aún no está en la intranet. `origen` = puerta con la que entró. */
  intranet: { tarificacionId: string; origen: string } | null
}

export type ListaAvant2 = { estado: 'ok'; proyectos: ProyectoAvant2[] } | { estado: 'error'; mensaje: string }

type J = Record<string, unknown>
const o = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {})
const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

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
    intranet: i && s(i.tarificacionId) ? { tarificacionId: s(i.tarificacionId) as string, origen: s(i.origen) ?? '?' } : null,
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

/** Dónde se abre en plataforma una tarificación de ese ramo (la pantalla retoma la última). */
export function rutaTarificacion(clienteId: string, ramo: string | null): string | null {
  return ramo === 'auto' || ramo === 'moto' || ramo === 'hogar' ? `/correduria/cliente/${clienteId}/${ramo}-nuevo` : null
}

/** «Hecho en…»: la puerta `corredor`/`agente` es plataforma; sin fila en la intranet, la web de Avant2. */
export function origenProyecto(p: ProyectoAvant2): 'plataforma' | 'web (traído)' | 'web' {
  if (!p.intranet) return 'web'
  return p.intranet.origen === 'web' ? 'web (traído)' : 'plataforma'
}
