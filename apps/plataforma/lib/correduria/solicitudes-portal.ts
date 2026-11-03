// Cola «Solicitudes del portal» de /correduria → Hoy (26/10/2026): las peticiones de módulo («Herramientas») que los
// clientes hacen desde el portal y esperan activación. Intérprete PURO de `GET /api/operador/portal-modulos` de asegura.
//
// 🚨 Tres estados, nunca colapsados: `ok` (la lista, puede estar vacía de verdad), `sin_configurar` y `error`
// («no se ha podido leer» ≠ «no hay solicitudes»). Una fila ilegible NO se esconde: si falta una, la lista no es la lista.
// Activar/Rechazar reutilizan el POST de `/api/correduria/cliente/portal-modulos` (revalida en servidor, auditado,
// deja `historial_interno`); aquí no hay escritura. Rechazar = `retirar`. 27/10/2026: una fila SIN ficha se activa por
// `identidadId` y asegura crea una ficha de PROSPECTO (`creaProspecto`); Rechazar sin ficha sigue sin poder hacerse aquí.

export type SolicitudPortal = {
  id: string
  modulo: string
  moduloNombre: string
  /** Ficha vinculada (para el enlace y para escribir). `null` = identidad sin ficha. */
  clienteId: string | null
  /** La identidad del portal que lo pidió. Con `clienteId` null, Activar va por aquí (27/10/2026: crea ficha de prospecto). */
  identidadId: string | null
  /** `true` = activar crea una ficha de PROSPECTO (sin póliza, no es cliente). La pantalla lo avisa antes de pulsar. */
  creaProspecto: boolean
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
  const identidadId = cadena(o.identidad_id)
  const ficha = cadena(o.cliente)
  const motivo = cadena(o.motivoNoActivar)
  // Sin motivo no se puede explicar un botón apagado: fila ilegible, no se inventa un texto.
  if (!o.puedeActivar && !motivo) return null
  // Activar sin ficha necesita la identidad: sin ella, el botón no tendría a quién activar (fila ilegible, no se inventa).
  const creaProspecto = o.creaProspecto === true && clienteId === null
  if (creaProspecto && !identidadId) return null
  return {
    id,
    modulo,
    moduloNombre: cadena(o.moduloNombre) ?? modulo,
    clienteId,
    identidadId,
    creaProspecto,
    cliente: (clienteId ? ficha : null) ?? cadena(o.nombre) ?? 'Cliente sin nombre',
    sinFicha: clienteId === null,
    solicitadoEn,
    // Sin ficha solo se activa si asegura dice que crea el prospecto (un puerto viejo no lo dice: botón apagado).
    puedeActivar: o.puedeActivar && (clienteId !== null || creaProspecto),
    motivoNoActivar: o.puedeActivar ? (clienteId !== null || creaProspecto ? null : 'Sin ficha vinculada: vincúlala antes de activar.') : motivo,
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

/**
 * El cuerpo del POST de Activar/Rechazar (27/10/2026), UNA regla para la cola y la campana: con ficha, por `clienteId`; sin
 * ficha, solo ACTIVAR y solo si asegura dijo `creaProspecto` (por `identidadId`). `null` = no hay nada que mandar.
 */
export function cuerpoAccion(s: SolicitudPortal, accion: 'activar' | 'retirar'): Record<string, string> | null {
  if (s.clienteId) return { clienteId: s.clienteId, modulo: s.modulo, accion }
  if (accion === 'activar' && s.creaProspecto && s.identidadId) return { identidadId: s.identidadId, modulo: s.modulo, accion }
  return null
}

/** La pregunta antes de activar a alguien sin ficha (se crea una ficha de prospecto). `null` = no hace falta preguntar. */
export function confirmacionProspecto(s: SolicitudPortal, accion: 'activar' | 'retirar'): string | null {
  if (accion !== 'activar' || s.clienteId || !s.creaProspecto) return null
  return `${s.cliente} no tiene ficha. Al activar «${s.moduloNombre}» se crea una ficha de PROSPECTO (sin póliza: no cuenta como cliente). ¿Seguir?`
}

/** Texto del aviso tras Activar/Rechazar según lo que contestó el POST (nunca «hecho» si no se sabe). */
export function textoResultadoAccion(accion: 'activar' | 'retirar', status: number, json: unknown): { ok: boolean; texto: string } {
  const j = (json ?? null) as { estado?: string; motivo?: string } | null
  if (status === 200 && j?.estado === 'ok') return { ok: true, texto: accion === 'activar' ? 'Activado.' : 'Rechazada.' }
  if (status === 503 && j?.estado === 'sin_migracion') {
    return { ok: false, texto: 'NO se ha activado: falta aplicar en la base el SQL 2026-10-27_portal_acceso_por_autorizacion.sql. No se ha creado ninguna ficha.' }
  }
  const que = accion === 'activar' ? 'activado' : 'rechazado'
  return { ok: false, texto: `NO se ha ${que}: ${j?.motivo ?? (j?.estado ? j.estado : `HTTP ${status}`)}.` }
}
