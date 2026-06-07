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
  aliases: string[]
  precio: number | null
  seccion: string | null
  familia: string | null   // grupo semántico para BRAIN (ej: 'vino_tinto', 'cerveza')
  formatos: { id: string; nombre: string; precio: number }[]
}

export interface ZonaCacheItem {
  prefijo: string   // 'T', 'P', 'B'
  nombre: string    // 'Salón', 'Terraza', 'Barra'
  tipo: string      // 'salon', 'terraza', 'barra'
}

export interface PersonalCacheItem {
  id: string
  nombre: string
  nombre_norm: string   // sin tildes, minúsculas, primer token
  rol: string
}

export interface SeccionCacheItem {
  id: string
  nombre: string
  nombre_norm: string
  impresora_id: string | null
}

export interface MenuCache {
  productos: ProductoCacheItem[]
  zonas: ZonaCacheItem[]
  personal: PersonalCacheItem[]
  secciones: SeccionCacheItem[]
  // Índices de búsqueda rápida
  byAlias: Map<string, ProductoCacheItem>   // alias normalizado → producto
  byPrefijo: Map<string, ZonaCacheItem>     // prefijo → zona
  byNombre: Map<string, PersonalCacheItem>  // nombre_norm → personal
  bySeccion: Map<string, SeccionCacheItem>  // nombre_norm → sección
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

  const [{ data: productos }, { data: formatos }, { data: zonas }, { data: personal }, { data: secciones }] = await Promise.all([
    supabase
      .from('productos')
      .select('id, nombre, nombre_alternativo, alias_ia, precio, seccion, familia')
      .eq('activo', true)
      .eq('local_id', restaurante_id),
    supabase
      .from('producto_formatos')
      .select('id, producto_id, nombre, precio')
      .eq('activo', true)
      .eq('local_id', restaurante_id),
    supabase
      .from('zonas')
      .select('prefijo, nombre, tipo')
      .eq('activa', true)
      .eq('local_id', restaurante_id)
      .order('orden'),
    supabase
      .from('personal')
      .select('id, nombre, rol')
      .eq('activo', true)
      .eq('local_id', restaurante_id),
    supabase
      .from('secciones_cocina')
      .select('id, nombre, impresora_id')
      .eq('activa', true)
      .eq('local_id', restaurante_id)
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
      ...(Array.isArray(p.alias_ia) ? (p.alias_ia as string[]) : []),   // alias IA (invisibles para el owner)
    ],
    precio: p.precio != null ? Number(p.precio) : null,
    seccion: (p.seccion as string) ?? null,
    familia: (p.familia as string) ?? null,
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

  // Personal — índice por primer nombre y nombre completo (ambos normalizados)
  const personalCache: PersonalCacheItem[] = (personal ?? []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    nombre: c.nombre as string,
    nombre_norm: norm((c.nombre as string).split(' ')[0]),
    rol: (c.rol as string) ?? 'camarero',
  }))
  const byNombre = new Map<string, PersonalCacheItem>()
  for (const p of personalCache) {
    byNombre.set(p.nombre_norm, p)
    byNombre.set(norm(p.nombre), p)
  }

  // Secciones de cocina
  const seccionesCache: SeccionCacheItem[] = (secciones ?? []).map((s: Record<string, unknown>) => ({
    id: s.id as string,
    nombre: s.nombre as string,
    nombre_norm: norm(s.nombre as string),
    impresora_id: (s.impresora_id as string) ?? null,
  }))
  const bySeccion = new Map<string, SeccionCacheItem>()
  for (const s of seccionesCache) {
    bySeccion.set(s.nombre_norm, s)
    // Indexar también primer token: "cocina caliente" → "cocina" (si único)
    const primerToken = s.nombre_norm.split(' ')[0]
    if (primerToken.length >= 4 && !bySeccion.has(primerToken)) {
      bySeccion.set(primerToken, s)
    }
  }

  return { productos: productosCache, zonas: zonasCache, personal: personalCache, secciones: seccionesCache, byAlias, byPrefijo, byNombre, bySeccion }
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
