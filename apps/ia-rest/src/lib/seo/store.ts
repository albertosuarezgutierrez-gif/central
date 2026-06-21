// apps/ia-rest/src/lib/seo/store.ts
import { createServerClient } from '@/lib/supabase'
import type { SeoOverride, SeoContentBlock, SeoArticulo, SeoCambio } from './types'

export async function getOverride(ruta: string): Promise<SeoOverride | null> {
  const sb = createServerClient()
  const { data } = await sb.from('seo_overrides').select('*').eq('ruta', ruta).eq('activo', true).maybeSingle()
  return (data as SeoOverride) ?? null
}

export async function getBlocks(ruta: string): Promise<SeoContentBlock[]> {
  const sb = createServerClient()
  const { data } = await sb.from('seo_content_blocks').select('*').eq('ruta', ruta).eq('activo', true).order('posicion')
  return (data as SeoContentBlock[]) ?? []
}

export async function getArticulo(slug: string): Promise<SeoArticulo | null> {
  const sb = createServerClient()
  const { data } = await sb.from('seo_articulos').select('*').eq('slug', slug).eq('activo', true).maybeSingle()
  return (data as SeoArticulo) ?? null
}

export async function getArticulosPublicados(): Promise<{ slug: string }[]> {
  const sb = createServerClient()
  const { data } = await sb.from('seo_articulos').select('slug').eq('activo', true)
  return (data as { slug: string }[]) ?? []
}

/** Registra el snapshot antes/después de un cambio. */
export async function registrarCambio(c: SeoCambio): Promise<void> {
  const sb = createServerClient()
  await sb.from('seo_cambios').insert({
    run_id: c.run_id, ruta: c.ruta, tipo: c.tipo,
    valor_antes: c.valor_antes ?? null, valor_despues: c.valor_despues ?? null, motivo: c.motivo ?? null,
  })
}

export async function upsertOverride(o: SeoOverride): Promise<void> {
  const sb = createServerClient()
  await sb.from('seo_overrides').upsert(
    { ...o, activo: o.activo ?? true, updated_at: new Date().toISOString(), updated_by: 'seo-agent' },
    { onConflict: 'ruta' },
  )
}

export async function upsertBlock(b: SeoContentBlock): Promise<void> {
  const sb = createServerClient()
  await sb.from('seo_content_blocks').upsert(
    { ...b, activo: b.activo ?? true, updated_at: new Date().toISOString() },
    { onConflict: 'ruta,posicion' },
  )
}

export async function insertArticulo(a: SeoArticulo): Promise<void> {
  const sb = createServerClient()
  await sb.from('seo_articulos').insert({
    slug: a.slug, titulo: a.titulo, meta_description: a.meta_description ?? null,
    keyword: a.keyword ?? null, bloques: a.bloques, activo: true, published_at: new Date().toISOString(),
  })
}

/** Cambios recientes (para cooldown). */
export async function cambiosRecientes(dias = 7): Promise<{ ruta: string; created_at: string }[]> {
  const sb = createServerClient()
  const desde = new Date(Date.now() - dias * 86400000).toISOString()
  const { data } = await sb.from('seo_cambios').select('ruta, created_at').gte('created_at', desde)
  return (data as { ruta: string; created_at: string }[]) ?? []
}

export async function listarCambios(limit = 50) {
  const sb = createServerClient()
  const { data } = await sb.from('seo_cambios').select('*').order('created_at', { ascending: false }).limit(limit)
  return data ?? []
}
