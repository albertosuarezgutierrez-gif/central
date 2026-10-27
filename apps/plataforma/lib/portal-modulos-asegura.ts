// Lector PURO de «Módulos del portal» de la ficha (puerto `/api/operador/cliente/portal-modulos` de asegura).
// Sin red: lo importa el componente cliente. Las reglas (qué se puede activar y por qué no) las decide asegura y
// viajan ya en la respuesta; aquí solo se lee con cuidado y se traducen los desenlaces a una frase.
// Tres estados: una respuesta ilegible es `error`, NUNCA «ningún módulo».

export type EstadoModulo = 'activo' | 'solicitado' | 'inactivo'
export type ModuloFicha = {
  id: string
  nombre: string
  descripcion: string
  estado: EstadoModulo
  puedeActivar: boolean
  motivoNoActivar: string | null
  puedeRetirar: boolean
}
export type RespuestaModulos =
  | { estado: 'ok'; modulos: ModuloFicha[] }
  | { estado: 'no_encontrado' | 'sin_configurar' | 'error'; motivo: string }

/**
 * Nota fija bajo «Patrimonio y alquileres» (decisión de Alberto, 27/10/2026; NO cambia ninguna regla): el módulo va
 * ligado al email con el que el cliente entra al portal. `null` = ese módulo no lleva nota.
 */
export function notaModulo(id: string): string | null {
  if (id !== 'alquileres') return null
  return (
    'Va ligado al email con el que el cliente entra al portal: solo se abre si ese email está en su ficha y la ficha ' +
    'está viva (activar exige póliza en vigor en CIMA). Si cambia de email tiene que avisar; puede tener más emails en su ficha.'
  )
}

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

export function interpretarModulos(status: number, json: unknown): RespuestaModulos {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar') return { estado: 'sin_configurar', motivo: 'ASEGURA_OPERADOR_SECRET' }
  if (status === 404) return { estado: 'no_encontrado', motivo: 'ficha no encontrada' }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.modulos)) {
    return { estado: 'error', motivo: txt(o.causa) ?? txt(o.motivo) ?? (status === 502 ? 'red' : `HTTP ${status}`) }
  }
  const modulos: ModuloFicha[] = []
  for (const x of o.modulos) {
    if (typeof x !== 'object' || x === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const m = x as Record<string, unknown>
    const id = txt(m.id)
    const nombre = txt(m.nombre)
    if (!id || !nombre || (m.estado !== 'activo' && m.estado !== 'solicitado' && m.estado !== 'inactivo')) {
      return { estado: 'error', motivo: 'respuesta_ilegible' }
    }
    modulos.push({
      id,
      nombre,
      descripcion: txt(m.descripcion) ?? '',
      estado: m.estado,
      // Solo un `true` explícito habilita el botón.
      puedeActivar: m.puedeActivar === true,
      motivoNoActivar: txt(m.motivoNoActivar),
      puedeRetirar: m.puedeRetirar === true,
    })
  }
  return { estado: 'ok', modulos }
}

export function textoMotivoModulos(motivo: string): string {
  switch (motivo) {
    case 'secreto_rechazado':
      return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).'
    case 'red':
      return 'no se pudo llegar a asegura.'
    case 'respuesta_ilegible':
      return 'la respuesta de asegura no tenía la forma esperada.'
    case 'permisos':
      return 'falta aplicar el permiso de escritura en la base (prisma/sql/2026-10-24_portal_modulos_operador.sql).'
    default:
      return motivo
  }
}

export const ETIQUETA_ESTADO_MODULO: Record<EstadoModulo, string> = {
  activo: 'Activado',
  solicitado: 'Lo ha pedido el cliente',
  inactivo: 'No activado',
}

export type DesenlaceEscritura = { ok: boolean; texto: string }

/** Frase tras pulsar activar/retirar. `ok` solo si asegura confirma `ok`. */
export function textoEscritura(status: number, json: unknown, accion: 'activar' | 'retirar', nombre: string): DesenlaceEscritura {
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (status === 200 && o.estado === 'ok') {
    const n = typeof o.cambios === 'number' ? o.cambios : null
    if (n === 0) return { ok: true, texto: `«${nombre}» ya estaba ${accion === 'activar' ? 'activado' : 'retirado'}: no había nada que cambiar.` }
    return { ok: true, texto: `«${nombre}» ${accion === 'activar' ? 'activado' : 'retirado'}.` }
  }
  if (status === 409 && txt(o.motivo)) return { ok: false, texto: o.motivo as string }
  const m = txt(o.causa) ?? txt(o.motivo) ?? (status === 502 ? 'red' : `HTTP ${status}`)
  return { ok: false, texto: `No se ha podido ${accion} «${nombre}»: ${textoMotivoModulos(m)} No consta ningún cambio.` }
}
