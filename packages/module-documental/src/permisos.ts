import type { Actor, ConfigCarpeta } from './tipos.ts'

/** Indexa una lista de carpetas por id, para consultas O(1). Lanza si hay ids duplicados. */
export function indexarCarpetas(carpetas: ConfigCarpeta[]): Map<string, ConfigCarpeta> {
  const m = new Map<string, ConfigCarpeta>()
  for (const c of carpetas) {
    if (m.has(c.id)) throw new Error(`Carpeta duplicada: ${c.id}`)
    m.set(c.id, c)
  }
  return m
}

/** Busca la config de una carpeta; lanza si la carpeta no existe en la taxonomía. */
export function obtenerCarpeta(carpetas: Map<string, ConfigCarpeta>, id: string): ConfigCarpeta {
  const c = carpetas.get(id)
  if (!c) throw new Error(`Carpeta desconocida: ${id}`)
  return c
}

/** ¿Puede `actor` SUBIR a `carpeta`? El gestor siempre puede; el titular solo si la carpeta lo permite. */
export function puedeSubir(carpetas: Map<string, ConfigCarpeta>, carpeta: string, actor: Actor): boolean {
  if (actor === 'gestor') return true
  return obtenerCarpeta(carpetas, carpeta).titularPuedeSubir
}

/** ¿Puede `actor` VER `carpeta`? El gestor siempre; el titular solo si la carpeta lo permite. */
export function puedeVer(carpetas: Map<string, ConfigCarpeta>, carpeta: string, actor: Actor): boolean {
  if (actor === 'gestor') return true
  return obtenerCarpeta(carpetas, carpeta).titularPuedeVer
}

/** Lista de carpetas visibles para `actor` (para pintar el árbol del expediente). */
export function carpetasVisibles(carpetas: ConfigCarpeta[], actor: Actor): ConfigCarpeta[] {
  if (actor === 'gestor') return carpetas
  return carpetas.filter(c => c.titularPuedeVer)
}
