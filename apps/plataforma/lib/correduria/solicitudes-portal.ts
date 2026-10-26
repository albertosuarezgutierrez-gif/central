// Cola «Solicitudes del portal» de /correduria → Hoy (26/10/2026): las peticiones de módulo («Herramientas») que los
// clientes hacen desde el portal y esperan activación. Intérprete PURO de `GET /api/operador/portal-modulos` de asegura.
//
// 🚨 Tres estados, nunca colapsados: `ok` (la lista, puede estar vacía de verdad), `sin_configurar` y `error`
// («no se ha podido leer» ≠ «no hay solicitudes»). Una fila ilegible NO se esconde: si falta una, la lista no es la lista.
// Activar/Rechazar reutilizan el POST de `/api/correduria/cliente/portal-modulos` (revalida en servidor, auditado,
// deja `historial_interno`); aquí no hay escritura. Rechazar = `retirar`.

export type SolicitudPortal = {
  id: string
  modulo: string
  moduloNombre: string
  /** Ficha vinculada (para el enlace y para escribir). `null` = identidad sin ficha. */
  clienteId: string | null
  /** Ficha si hay vínculo; si no, lo que tecleó la persona al entrar al portal (sin comprobar). */
  cliente: string
  /** `true` = `cliente` es lo tecleado en el portal, no la ficha. */
  sinFicha: boolean
  solicitadoEn: string
  puedeActivar: boolean
  motivoNoActivar: string | null
}

export type LecturaSolicitudesPortal =
  | { estado: 'ok'; solicitudes: SolicitudPortal[] }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export function leerSolicitud(v: unknown): SolicitudPortal | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  // Solo las pendientes: la cola nunca enseña filas activas o retiradas aunque el puerto las mande.
  if (o.estado !== 'solicitado') return null
  const id = cadena(o.id), modulo = cadena(o.modulo)
  // `solicitado_en` llega como ISO (JSON de un Date).
  const solicitadoEn = cadena(o.solicitado_en)
  if (!id || !modulo || !solicitadoEn || typeof o.puedeActivar !== 'boolean') return null
  const clienteId = cadena(o.cliente_id)
  const ficha = cadena(o.cliente)
  const motivo = cadena(o.motivoNoActivar)
  // Sin motivo no se puede explicar un botón apagado: fila ilegible, no se inventa un texto.
  if (!o.puedeActivar && !motivo) return null
  return {
    id,
    modulo,
    moduloNombre: cadena(o.moduloNombre) ?? modulo,
    clienteId,
    cliente: (clienteId ? ficha : null) ?? cadena(o.nombre) ?? 'Cliente sin nombre',
    sinFicha: clienteId === null,
    solicitadoEn,
    puedeActivar: o.puedeActivar,
    motivoNoActivar: o.puedeActivar ? null : motivo,
  }
}

export function interpretarSolicitudesPortal(status: number, json: unknown): LecturaSolicitudesPortal {
  const j = (json ?? null) as Record<string, unknown> | null
  if (status === 503 || (status === 200 && j?.estado === 'sin_configurar')) return { estado: 'sin_configurar' }
  if (status === 404) return { estado: 'error', motivo: 'asegura aún no tiene /api/operador/portal-modulos desplegado' }
  if (status !== 200 || j?.estado !== 'ok' || !Array.isArray(j.filas)) {
    const causa = typeof j?.causa === 'string' ? ` (${j.causa})` : ''
    return { estado: 'error', motivo: `HTTP ${status}${causa}` }
  }
  const filas = j.filas.filter((f) => (f as { estado?: unknown } | null)?.estado === 'solicitado')
  const solicitudes = filas.map(leerSolicitud)
  if (solicitudes.some((s) => s === null)) {
    return { estado: 'error', motivo: 'asegura devolvió una solicitud incompleta (¿versión antigua del puerto?)' }
  }
  return { estado: 'ok', solicitudes: solicitudes as SolicitudPortal[] }
}

/** dd/mm/aaaa de un ISO (la fecha tal cual viene, sin convertir de zona). */
export function fechaSolicitud(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** Texto del aviso tras Activar/Rechazar según lo que contestó el POST (nunca «hecho» si no se sabe). */
export function textoResultadoAccion(accion: 'activar' | 'retirar', status: number, json: unknown): { ok: boolean; texto: string } {
  const j = (json ?? null) as { estado?: string; motivo?: string } | null
  if (status === 200 && j?.estado === 'ok') return { ok: true, texto: accion === 'activar' ? 'Activado.' : 'Rechazada.' }
  const que = accion === 'activar' ? 'activado' : 'rechazado'
  return { ok: false, texto: `NO se ha ${que}: ${j?.motivo ?? (j?.estado ? j.estado : `HTTP ${status}`)}.` }
}
