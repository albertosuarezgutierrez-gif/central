/**
 * brain-cache.ts
 * Cache en memoria para menú y zonas del restaurante.
 * Evita 2-3 queries a Supabase en cada llamada al BRAIN.
 * TTL: 2 minutos (lo suficiente para un servicio real sin datos rancios).
 */

import { createServerClient } from '@/lib/supabase'

const CACHE_TTL_MS = 2 * 60 * 1000 // 2 minutos

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ProductoCacheItem {
  id: string
  nombre: string
  aliases: string[]   // nombre + nombre_alternativo[]
  precio: number | null
  seccion: string | null
  formatos: { id: string; nombre: string; precio: number }[]
}

export interface ZonaCacheItem {
  prefijo: string   // 'T', 'P', 'B'
  nombre: string    // 'Salón', 'Terraza', 'Barra'
  tipo: string      // 'salon', 'terraza', 'barra'
}

export interface MenuCache {
  productos: ProductoCacheItem[]
  zonas: ZonaCacheItem[]
  // Índices de búsqueda rápida
  byAlias: Map<string, ProductoCacheItem>   // alias normalizado → producto
  byPrefijo: Map<string, ZonaCacheItem>     // prefijo → zona
}

// ── Store del cache ───────────────────────────────────────────────────────────

const store = new Map<string, { data: MenuCache; expiresAt: number }>()

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

// ── Loader ────────────────────────────────────────────────────────────────────

async function cargarCache(restaurante_id: string): Promise<MenuCache> {
  const supabase = createServerClient()

  const [{ data: productos }, { data: formatos }, { data: zonas }] = await Promise.all([
    supabase
      .from('productos')
      .select('id, nombre, nombre_alternativo, precio, seccion')
      .eq('activo', true)
      .eq('restaurante_id', restaurante_id),
    supabase
      .from('producto_formatos')
      .select('id, producto_id, nombre, precio')
      .eq('activo', true),
    supabase
      .from('zonas')
      .select('prefijo, nombre, tipo')
      .eq('activa', true)
      .eq('restaurante_id', restaurante_id)
      .order('orden'),
  ])

  // Map formato por producto
  const fmtMap = new Map<string, { id: string; nombre: string; precio: number }[]>()
  for (const f of formatos ?? []) {
    const arr = fmtMap.get(f.producto_id) ?? []
    arr.push({ id: f.id, nombre: f.nombre, precio: f.precio })
    fmtMap.set(f.producto_id, arr)
  }

  // Construir productos con aliases
  const productosCache: ProductoCacheItem[] = (productos ?? []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    nombre: p.nombre as string,
    aliases: [
      p.nombre as string,
      ...(Array.isArray(p.nombre_alternativo) ? (p.nombre_alternativo as string[]) : []),
    ],
    precio: p.precio != null ? Number(p.precio) : null,
    seccion: (p.seccion as string) ?? null,
    formatos: fmtMap.get(p.id as string) ?? [],
  }))

  // Índice por alias normalizado
  const byAlias = new Map<string, ProductoCacheItem>()
  for (const p of productosCache) {
    for (const alias of p.aliases) {
      byAlias.set(norm(alias), p)
    }
  }

  // Zonas
  const zonasCache: ZonaCacheItem[] = (zonas ?? [])
    .filter((z: Record<string, unknown>) => z.prefijo)
    .map((z: Record<string, unknown>) => ({ prefijo: z.prefijo as string, nombre: z.nombre as string, tipo: (z.tipo as string) ?? (z.nombre as string).toLowerCase() }))

  const byPrefijo = new Map<string, ZonaCacheItem>()
  for (const z of zonasCache) {
    byPrefijo.set(z.prefijo, z)
  }

  // Fallback zonas si la BD no tiene configuradas
  if (zonasCache.length === 0) {
    const defaults: ZonaCacheItem[] = [
      { prefijo: 'T', nombre: 'Salón', tipo: 'salon' },
      { prefijo: 'T', nombre: 'Terraza', tipo: 'terraza' },
      { prefijo: 'B', nombre: 'Barra', tipo: 'barra' },
    ]
    for (const z of defaults) {
      zonasCache.push(z)
      byPrefijo.set(z.prefijo, z)
    }
  }

  return { productos: productosCache, zonas: zonasCache, byAlias, byPrefijo }
}

// ── API pública ───────────────────────────────────────────────────────────────

export async function getMenuCache(restaurante_id: string): Promise<MenuCache> {
  const cached = store.get(restaurante_id)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }
  const data = await cargarCache(restaurante_id)
  store.set(restaurante_id, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  return data
}

/** Invalida el cache de un restaurante (útil al modificar carta desde /owner). */
export function invalidarCache(restaurante_id: string): void {
  store.delete(restaurante_id)
}
