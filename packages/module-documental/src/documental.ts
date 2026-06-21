import type { ConfigCarpeta, EntradaSubida, OpcionesValidacion, OwnerRef } from './tipos.ts'
import { obtenerCarpeta, puedeSubir } from './permisos.ts'
import type { Actor } from './tipos.ts'

const TAMANO_MAX_DEFECTO = 20 * 1024 * 1024 // 20 MB

export type SubidaValidada = { carpeta: string; nombre: string; tipo: string | null; tamano: number | null }

/**
 * Valida y normaliza una subida: carpeta existe, actor con permiso, nombre no vacío, tamaño dentro de límite.
 * Lanza Error con mensaje legible si algo falla. No toca BD ni Storage (puro).
 */
export function validarSubida(
  carpetas: Map<string, ConfigCarpeta>,
  actor: Actor,
  entrada: EntradaSubida,
  opts: OpcionesValidacion = {}
): SubidaValidada {
  obtenerCarpeta(carpetas, entrada.carpeta) // lanza si no existe
  if (!puedeSubir(carpetas, entrada.carpeta, actor)) {
    throw new Error(`Sin permiso para subir a "${entrada.carpeta}"`)
  }
  const nombre = (entrada.nombre ?? '').trim()
  if (!nombre) throw new Error('El nombre del archivo es obligatorio')

  const max = opts.tamanoMaxBytes ?? TAMANO_MAX_DEFECTO
  const tamano = entrada.tamano ?? null
  if (tamano != null && tamano > max) {
    throw new Error(`El archivo supera el máximo de ${Math.round(max / 1024 / 1024)} MB`)
  }
  return { carpeta: entrada.carpeta, nombre, tipo: entrada.tipo ?? null, tamano }
}

/** Saca la extensión en minúsculas de un nombre de archivo, o '' si no tiene. */
function extension(nombre: string): string {
  const i = nombre.lastIndexOf('.')
  return i > 0 ? nombre.slice(i + 1).toLowerCase() : ''
}

/**
 * Construye el path del objeto en Storage, agnóstico de entidad:
 *   <owner.tipo>/<owner.id>/<carpeta>/<uuid>.<ext>
 * El bucket y la política los pone la vertical (igual que core-storage).
 */
export function construirPathStorage(owner: OwnerRef, carpeta: string, nombre: string, uuid: string): string {
  const ext = extension(nombre)
  const base = `${owner.tipo}/${owner.id}/${carpeta}/${uuid}`
  return ext ? `${base}.${ext}` : base
}
