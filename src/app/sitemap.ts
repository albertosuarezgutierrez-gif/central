import { MetadataRoute } from 'next'
import { createServerClient } from '@/lib/supabase'

export const revalidate = 3600 // regenerar cada hora

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://www.iarest.es'
  const now  = new Date()

  // Páginas estáticas
  const estaticas: MetadataRoute.Sitemap = [
    { url: base,                                                   lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/registro`,                                     lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/comanda-por-voz`,                              lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/tpv-restaurante`,                              lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/restaurantes`,                                 lastModified: now, changeFrequency: 'daily',   priority: 0.8 },
    { url: `${base}/blog`,                                         lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${base}/blog/verifactu-restaurantes-guia-2026`,        lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/blog/reducir-errores-comanda-restaurante`,     lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/blog/alternativa-numier-tpv`,                  lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/blog/comanda-por-voz-como-funciona`,           lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/blog/tpv-con-ia-hosteleria`,                   lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/comparativas/iarest-vs-numier`,                lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/comparativas/iarest-vs-revo`,                  lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/comparativas/iarest-vs-camarero10`,            lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/sectores/restaurante`,                         lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/sectores/bar`,                                 lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/sectores/cafeteria`,                           lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/login`,                                        lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/aviso-legal`,                                  lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/privacidad`,                                   lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/cookies`,                                      lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${base}/terminos`,                                     lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
  ]

  // Webs de restaurantes activas — dinámico
  let websRestaurantes: MetadataRoute.Sitemap = []
  let ciudades: Set<string> = new Set()

  try {
    const supabase = createServerClient()
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

      // Recoger ciudades únicas para páginas de directorio
      webs.forEach(w => {
        const ciudad = (w.restaurantes as any)?.ciudad
        if (ciudad) ciudades.add(ciudad.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
      })
    }
  } catch (e) {
    console.warn('[sitemap] Error cargando webs dinámicas:', e)
  }

  // Páginas de directorio por ciudad
  const paginasCiudad: MetadataRoute.Sitemap = Array.from(ciudades).map(ciudad => ({
    url: `${base}/restaurantes/${ciudad}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }))

  return [...estaticas, ...websRestaurantes, ...paginasCiudad]
}
