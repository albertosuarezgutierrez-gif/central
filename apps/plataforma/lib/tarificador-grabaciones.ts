// GRABADOR del tarificador RPA — reglas PURAS de la pantalla /correduria/tarificador/grabaciones (07/10/2026).
// Las usan el componente cliente y las rutas; `node --test`.
import type { MapaGrabacion } from '@central/module-tarificacion'

/** Mismos topes que asegura (`MAX_BYTES_PANTALLA`, `MAX_PANTALLAS` de @central/module-tarificacion). */
export const MAX_BYTES_FICHERO = 4 * 1024 * 1024
export const MAX_FICHEROS = 40

export type ResumenGrabacion = {
  id: string
  compania: string
  ramo: string
  producto: string | null
  nota: string | null
  pantallas: number
  analizadas: number
  conError: number
  mapaValidado: boolean
  validadoPor: string | null
  validadoEn: string | null
  llamadasIA: number
  costeEstimado: number
  creadoPor: string
  creadoEn: string
}
export type PantallaGrabada = { orden: number; nombre: string; bytes: number; estado: 'pendiente' | 'ok' | 'error'; error: string | null; analizadaEn: string | null; documentoId: string }
export type DetalleGrabacion = ResumenGrabacion & { pantallasLista: PantallaGrabada[]; mapa: MapaGrabacion | null; maxLlamadas: number }
export type ResultadoAnalisis = { estado: 'ok'; procesadas: number; bien: number; mal: number; pendientes: number; tope: boolean; llamadasUsadas: number; maxLlamadas: number; botonesForzados: number }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** Mensaje legible de una respuesta que no ha ido bien (o `null` si fue bien). */
export function mensajeError(status: number, json: unknown, que: string): string | null {
  const o = obj(json)
  if (status >= 200 && status < 300) return null
  if (o?.estado === 'tabla_sin_crear') return typeof o.mensaje === 'string' ? o.mensaje : 'Falta aplicar el SQL de las grabaciones.'
  if (status === 503 && o?.estado === 'sin_configurar') return 'Falta configurar el puerto de asegura (ASEGURA_OPERADOR_SECRET) en plataforma.'
  if (status === 502) return 'No se ha podido hablar con asegura (red). Prueba en un rato.'
  if (status === 401 || status === 403) return 'Sin permiso.'
  if (status === 413) return `${que}: el fichero es demasiado grande (máx. 4 MB).`
  const detalle = typeof o?.mensaje === 'string' ? o.mensaje : typeof o?.causa === 'string' ? o.causa : null
  return `${que}: no ha ido bien${detalle ? ` (${detalle})` : ` (HTTP ${status})`}.`
}

export type FicheroElegido = { name: string; size: number }

/** Comprueba los ficheros elegidos ANTES de subir nada: extensión, tamaño y cuántos caben. */
export function comprobarFicheros(ficheros: readonly FicheroElegido[], yaSubidas: number): string[] {
  const errores: string[] = []
  if (ficheros.length === 0) errores.push('No hay ficheros elegidos.')
  if (yaSubidas + ficheros.length > MAX_FICHEROS) errores.push(`Caben ${Math.max(0, MAX_FICHEROS - yaSubidas)} pantallas más (máximo ${MAX_FICHEROS} por grabación).`)
  for (const f of ficheros) {
    if (!/\.html?$/i.test(f.name)) errores.push(`«${f.name}» no es un .html.`)
    else if (f.size <= 0) errores.push(`«${f.name}» está vacío.`)
    else if (f.size > MAX_BYTES_FICHERO) errores.push(`«${f.name}» pasa de 4 MB.`)
  }
  return errores
}

/**
 * Orden inicial: por nombre. El bookmarklet nombra `pantalla-<host>-AAAAMMDD-HHMMSS.html`, así que por nombre
 * es el orden en que se grabaron. Alberto puede reordenar antes de subir.
 */
export function ordenInicial<T extends FicheroElegido>(ficheros: readonly T[]): T[] {
  return [...ficheros].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
}

export function mover<T>(lista: readonly T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length) return [...lista]
  const out = [...lista]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

export function tamano(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('es-ES', { maximumFractionDigits: 0 })} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`
}

/** Estado de la grabación en una palabra (para la insignia). */
export function estadoGrabacion(g: Pick<ResumenGrabacion, 'pantallas' | 'analizadas' | 'conError' | 'mapaValidado'>): { texto: string; tono: 'positivo' | 'aviso' | 'info' | 'neutral' } {
  if (g.pantallas === 0) return { texto: 'Sin pantallas', tono: 'neutral' }
  if (g.mapaValidado) return { texto: 'Mapa validado', tono: 'positivo' }
  if (g.conError > 0) return { texto: `${g.conError} con error`, tono: 'aviso' }
  if (g.analizadas < g.pantallas) return { texto: `${g.analizadas}/${g.pantallas} analizadas`, tono: 'info' }
  return { texto: 'Mapa por validar', tono: 'aviso' }
}
