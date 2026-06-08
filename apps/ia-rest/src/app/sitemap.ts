import { MetadataRoute } from 'next'
import { createServerClient } from '@/lib/supabase'

export const revalidate = 3600 // regenerar cada hora

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://www.iarest.es'
  const now  = new Date()

  // Posts de blog estáticos (no gestionados por agente SEO)
  const postsEstaticos = [
    'verifactu-restaurantes-guia-2026',
    'reducir-errores-comanda-restaurante',
    'errores-comanda-restaurante',
    'alternativa-numier-tpv',
    'comanda-por-voz-como-funciona',
    'tpv-restaurante',
    'tpv-voz-para-bares',
    'software-tpv-bares-espana',
  ]

  // Páginas estáticas
  const estaticas: MetadataRoute.Sitemap = [
    // Core
    { url: base,                                                    lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/registro`,                                      lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/comanda-por-voz`,                               lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/restaurantes`,                                  lastModified: now, changeFrequency: 'daily',   priority: 0.8 },

    // Landings por sector / tipo de negocio
    { url: `${base}/restaurante-indio`,                             lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/restaurante-mediterraneo`,                      lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/grupo-multilocal`,                              lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/catering`,                                      lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/tapas-bar`,                                     lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/hosteleria`,                                    lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/eventos`,                                       lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/espacios`,                                      lastModified: now, changeFrequency: 'monthly', priority: 0.7 },

    // Blog índice
    { url: `${base}/blog`,                                          lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },

    // Posts estáticos (no gestionados por agente SEO)
    ...postsEstaticos.map(slug => ({
      url: `${base}/blog/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),

    // Legal
    { url: `${base}/login`,                                         lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/aviso-legal`,                                   lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/privacidad`,                                    lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/cookies`,                                       lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${base}/terminos`,                                      lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
  ]

  // Posts generados por el agente SEO — dinámico desde BD
  let postsAgente: MetadataRoute.Sitemap = []

  // Webs de restaurantes activas — dinámico
  let websRestaurantes: MetadataRoute.Sitemap = []
  let ciudades: Set<string> = new Set()

  try {
    const supabase = createServerClient()

    // Blog posts publicados por el agente SEO
    const { data: posts } = await supabase
      .from('blog_borradores')
      .select('slug, published_at')
      .eq('estado', 'publicado')
      .order('published_at', { ascending: false })

    if (posts?.length) {
      // Excluir los que ya están en postsEstaticos para evitar duplicados
      postsAgente = posts
        .filter(p => !postsEstaticos.includes(p.slug))
        .map(p => ({
          url: `${base}/blog/${p.slug}`,
          lastModified: new Date(p.published_at ?? now),
          changeFrequency: 'monthly' as const,
          priority: 0.8,
        }))
    }

    // Webs de restaurantes activas
    const { data: webs } = await supabase
      .from('web_restaurante')
      .select('slug, updated_at, restaurantes(ciudad)')
      .eq('activa', true)
      .not('slug', 'is', null)

    if (webs?.length) {
      websRestaurantes = webs.map(w => ({
        url: `${base}/r/${w.slug}`,
        lastModified: new Date(w.updated_at ?? now),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }))

      webs.forEach(w => {
        const ciudad = (w.restaurantes as any)?.ciudad
        if (ciudad) ciudades.add(ciudad.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
      })
    }
  } catch (e) {
    console.warn('[sitemap] Error cargando datos dinámicos:', e)
  }

  // Páginas de directorio por ciudad
  const paginasCiudad: MetadataRoute.Sitemap = Array.from(ciudades).map(ciudad => ({
    url: `${base}/restaurantes/${ciudad}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }))

  return [...estaticas, ...postsAgente, ...websRestaurantes, ...paginasCiudad]
}
