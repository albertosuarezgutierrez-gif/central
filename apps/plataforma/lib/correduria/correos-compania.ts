/**
 * Bandeja «Correos de compañía» de Mi mesa (14/10/2026). PURO: interpreta `GET /api/operador/correo/evento`
 * de asegura (los avisos de compañías que el triaje leyó en los últimos 30 días y lo que se hizo con cada
 * uno) y decide cómo se pinta. La red va por `GET /api/correduria/correos-compania`.
 *
 * 🚨 Tres estados: `ok` con lista vacía = comprobado, no ha llegado ninguno; `sin_migracion` = falta el SQL
 * (se dice); `error` = no se ha podido leer (nunca «no hay»). Los SIN RESOLVER van primero: NO se escribió
 * nada en la cartera y esta bandeja es la única señal.
 */

export const ESTADOS_CORREO_COMPANIA = ['aplicado', 'duplicado_cima', 'sin_resolver', 'procesando'] as const
export type EstadoCorreoCompania = (typeof ESTADOS_CORREO_COMPANIA)[number]

export type CorreoCompania = {
  id: string
  /** Madrid, `aaaa-mm-ddThh:mm`. */
  creado: string
  tipo: string
  subtipo: string | null
  clave: string
  compania: string
  numeroPoliza: string | null
  estado: EstadoCorreoCompania
  motivo: string | null
  resumen: string | null
  clienteId: string | null
  cliente: string | null
  fechaLimite: string | null
  /** `null` = el correo no lo traía (nunca 0). */
  importe: number | null
  /** `true` = alguien lo marcó como mirado. Ausente (asegura antiguo) = `false`: no se ha mirado. */
  revisado: boolean
}

export type LecturaCorreosCompania =
  | { estado: 'ok'; filas: CorreoCompania[]; truncado: boolean; descartadas: number }
  | { estado: 'sin_migracion' }
  | { estado: 'error'; motivo: string }

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

function fila(v: unknown): CorreoCompania | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const estado = ESTADOS_CORREO_COMPANIA.find((e) => e === o.estado)
  const id = txt(o.id), creado = txt(o.creado), tipo = txt(o.tipo), clave = txt(o.clave), compania = txt(o.compania)
  if (!estado || !id || !creado || !tipo || !clave || !compania) return null
  const fl = txt(o.fechaLimite)
  return {
    id, creado, tipo, clave, compania, estado,
    subtipo: txt(o.subtipo), numeroPoliza: txt(o.numeroPoliza), motivo: txt(o.motivo), resumen: txt(o.resumen),
    clienteId: txt(o.clienteId), cliente: txt(o.cliente),
    fechaLimite: fl && /^\d{4}-\d{2}-\d{2}$/.test(fl) ? fl : null,
    revisado: o.revisado === true,
    importe: typeof o.importe === 'number' && Number.isFinite(o.importe) ? o.importe : null,
  }
}

/** ¿Admite la marca «mirado»? Sin resolver, o a medias (sin desenlace confirmado), mirado o no. */
export function admiteMarca(e: Pick<CorreoCompania, 'estado'>): boolean {
  return e.estado === 'sin_resolver' || e.estado === 'procesando'
}

/** ¿Pide que alguien lo mire AHORA? Admite la marca y nadie la ha puesto. */
export function pideMirar(e: Pick<CorreoCompania, 'estado'> & { revisado?: boolean }): boolean {
  return admiteMarca(e) && e.revisado !== true
}

/** Orden de la bandeja: los que piden mirar primero, los mirados al final; dentro, lo más reciente arriba. */
export function ordenarCorreos(filas: CorreoCompania[]): CorreoCompania[] {
  const rango = (e: CorreoCompania) => (pideMirar(e) ? 0 : admiteMarca(e) ? 2 : 1)
  return [...filas].sort((a, b) => rango(a) - rango(b) || b.creado.localeCompare(a.creado))
}

/** Aplica en local el resultado de marcar/deshacer, sin recargar la lista. Id desconocido = sin cambios. */
export function conRevisado(filas: CorreoCompania[], id: string, revisado: boolean): CorreoCompania[] {
  return ordenarCorreos(filas.map((f) => (f.id === id && admiteMarca(f) ? { ...f, revisado } : f)))
}

export function interpretarCorreosCompania(status: number, json: unknown): LecturaCorreosCompania {
  const o = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : null
  if (o?.estado === 'sin_migracion') return { estado: 'sin_migracion' }
  if (status !== 200 || o?.estado !== 'ok' || !Array.isArray(o.filas)) {
    const motivo = o?.estado === 'sin_configurar' ? 'falta conectar el puerto de asegura'
      : status === 401 || status === 403 ? 'sin permiso' : `respuesta ${status}`
    return { estado: 'error', motivo }
  }
  const filas: CorreoCompania[] = []
  let descartadas = 0
  for (const v of o.filas) {
    const f = fila(v)
    if (f) filas.push(f)
    else descartadas++
  }
  return { estado: 'ok', filas: ordenarCorreos(filas), truncado: o.truncado === true, descartadas }
}

export const ROTULO_TIPO_CORREO: Record<string, string> = {
  siniestro: 'Siniestro', pre_anulacion: 'Pre-anulación', impago: 'Impago', anulacion: 'Anulación', suplemento: 'Suplemento',
  emision: 'Póliza nueva', solicitud: 'Solicitud',
}

/** El elemento de la fila, en una línea: «Siniestro 43000001 · póliza X», «Póliza nueva emitida: X» o «Póliza X». */
export function textoElementoCorreo(e: Pick<CorreoCompania, 'tipo' | 'clave' | 'numeroPoliza'>): string {
  if (e.tipo === 'siniestro') return `Siniestro ${e.clave}${e.numeroPoliza ? ` · póliza ${e.numeroPoliza}` : ''}`
  if (e.tipo === 'emision') return `Póliza nueva emitida: ${e.numeroPoliza ?? e.clave}`
  // Sin póliza aún: se engancha apuntando el nº en la oportunidad (Mi mesa → «Nº solicitud…»).
  if (e.tipo === 'solicitud') return `Solicitud ${e.clave}`
  return `Póliza ${e.numeroPoliza ?? e.clave}`
}

export const ROTULO_ESTADO_CORREO: Record<EstadoCorreoCompania, { texto: string; tono: 'positivo' | 'info' | 'negativo' | 'aviso' }> = {
  aplicado: { texto: 'Aplicado', tono: 'positivo' },
  duplicado_cima: { texto: 'Ya en CIMA', tono: 'info' },
  sin_resolver: { texto: 'Sin resolver', tono: 'negativo' },
  procesando: { texto: 'A medias', tono: 'aviso' },
}

export const ROTULO_COMPANIA: Record<string, string> = { reale: 'Reale', occident: 'Occident', mapfre: 'Mapfre', allianz: 'Allianz' }
