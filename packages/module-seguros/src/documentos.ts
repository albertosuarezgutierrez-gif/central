// Documentos de la correduría — lógica PURA (sin BD, sin red).
//
// ─── El hueco que cierra (01-02/09/2026) ────────────────────────────────────
// Hacían falta en TRES sitios (cliente, póliza, siniestro) y solo la póliza tenía
// tabla; y faltaba el estado «pedido pero no recibido»: sin él, «0 documentos» no
// distingue no habérselo pedido al cliente de que el cliente no lo mande. Desde
// el 02/09/2026 hay una tabla única `seguros.documentos` y aquí vive lo que se
// puede decidir sin mirar la base: qué tipos hay, qué fichero se acepta y cómo
// se resume una lista SIN convertir «no se pudo consultar» en «no hay nada».

export type TipoDocumento =
  | 'poliza'
  | 'dni'
  | 'ficha_tecnica'
  | 'permiso_circulacion'
  | 'recibo'
  | 'parte_siniestro'
  | 'foto'
  | 'otro'

export const TIPOS_DOCUMENTO: readonly TipoDocumento[] = [
  'poliza',
  'dni',
  'ficha_tecnica',
  'permiso_circulacion',
  'recibo',
  'parte_siniestro',
  'foto',
  'otro',
]

export type EstadoDocumento = 'pedido' | 'recibido' | 'revisado'

export type DocumentoResumen = {
  id: string
  tipo: TipoDocumento
  estado: EstadoDocumento
  /** `null` cuando está `pedido`: todavía no hay fichero. */
  nombre: string | null
  mime: string | null
  bytes: number | null
  sha256: string | null
  notas: string | null
  subidoPor: 'corredor' | 'cliente' | 'agente'
  clienteId: string | null
  polizaId: string | null
  siniestroId: string | null
  creado: string
  revisadoEn: string | null
}

export function etiquetaTipoDocumento(t: string): string {
  switch (t) {
    case 'poliza': return 'Póliza'
    case 'dni': return 'DNI / NIE'
    case 'ficha_tecnica': return 'Ficha técnica'
    case 'permiso_circulacion': return 'Permiso de circulación'
    case 'recibo': return 'Recibo'
    case 'parte_siniestro': return 'Parte de siniestro'
    case 'foto': return 'Foto'
    case 'otro': return 'Otro'
    default: return t
  }
}

export function etiquetaEstadoDocumento(e: EstadoDocumento): string {
  switch (e) {
    case 'pedido': return '⏳ pedido, sin recibir'
    case 'recibido': return '📥 recibido, sin revisar'
    case 'revisado': return '✅ revisado'
  }
}

/** Un valor desconocido de la base se trata como `otro`/`recibido`, nunca revienta. */
export function tipoDocumento(v: unknown): TipoDocumento {
  return typeof v === 'string' && (TIPOS_DOCUMENTO as readonly string[]).includes(v) ? (v as TipoDocumento) : 'otro'
}
export function estadoDocumento(v: unknown): EstadoDocumento {
  return v === 'pedido' || v === 'revisado' ? v : 'recibido'
}

// ─── Qué fichero se acepta ───────────────────────────────────────────────────

export const MIMES_DOCUMENTO = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const

/** 10 MB: cabe cualquier póliza escaneada; un vídeo no entra por error. Mismo tope que el CHECK de la tabla. */
export const MAX_BYTES_DOCUMENTO = 10 * 1024 * 1024

/**
 * Devuelve el motivo del rechazo (texto para pantalla) o `null` si el fichero
 * vale. Se comprueba en el navegador ANTES de subir y otra vez en el servidor.
 */
export function revisarDocumento(f: { type: string; size: number; name?: string }): string | null {
  const esPdfPorNombre = (f.name ?? '').toLowerCase().endsWith('.pdf')
  if (!(MIMES_DOCUMENTO as readonly string[]).includes(f.type) && !esPdfPorNombre) {
    return `Tipo de fichero no admitido (${f.type || 'desconocido'}). Sube un PDF o una foto.`
  }
  if (f.size <= 0) return 'El fichero está vacío.'
  if (f.size > MAX_BYTES_DOCUMENTO) {
    return `El fichero pesa ${(f.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_BYTES_DOCUMENTO / 1024 / 1024} MB.`
  }
  return null
}

// ─── Resumen de una lista, con sus TRES estados ──────────────────────────────

export type ResumenDocumentos =
  /** La consulta falló o el puerto no lo informa: NO se afirma nada. */
  | { estado: 'sin_consultar'; titular: string }
  /** Se miró y no hay ninguno, ni pedido. */
  | { estado: 'ninguno'; titular: string }
  | {
      estado: 'ok'
      pedidos: number
      recibidos: number
      revisados: number
      titular: string
    }

export function resumenDocumentos(lista: DocumentoResumen[] | null): ResumenDocumentos {
  if (lista === null) {
    return { estado: 'sin_consultar', titular: 'Documentos sin consultar (no se ha podido leer la tabla).' }
  }
  if (lista.length === 0) {
    return { estado: 'ninguno', titular: 'Ningún documento: ni recibido ni pedido.' }
  }
  const pedidos = lista.filter((d) => d.estado === 'pedido').length
  const recibidos = lista.filter((d) => d.estado === 'recibido').length
  const revisados = lista.filter((d) => d.estado === 'revisado').length
  const partes: string[] = []
  if (pedidos > 0) partes.push(`${pedidos} pedido(s) sin recibir`)
  if (recibidos > 0) partes.push(`${recibidos} por revisar`)
  if (revisados > 0) partes.push(`${revisados} revisado(s)`)
  return { estado: 'ok', pedidos, recibidos, revisados, titular: partes.join(' · ') }
}

/**
 * ¿Qué falta para poder EMITIR? Los `supuestos` de la precalificación son la
 * lista de verificación; el papel que los cierra es este. Devuelve los tipos que
 * no están ni recibidos ni revisados (los `pedido` siguen faltando).
 */
export function documentosQueFaltan(
  lista: DocumentoResumen[] | null,
  necesarios: readonly TipoDocumento[],
): TipoDocumento[] | null {
  if (lista === null) return null
  const tiene = new Set(lista.filter((d) => d.estado !== 'pedido').map((d) => d.tipo))
  return necesarios.filter((t) => !tiene.has(t))
}

/** Lo que hace falta para emitir una póliza de AUTO desde una precalificación. */
export const NECESARIOS_EMISION_AUTO: readonly TipoDocumento[] = ['dni', 'permiso_circulacion', 'ficha_tecnica']
