import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.iarest.es'
  const now  = new Date()
  return [
    // Core — máxima prioridad
    { url: base,                                                   lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/registro`,                                     lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    // Landings de producto
    { url: `${base}/comanda-por-voz`,                              lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/tpv-restaurante`,                              lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    // Blog
    { url: `${base}/blog`,                                         lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${base}/blog/verifactu-restaurantes-guia-2026`,        lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/blog/reducir-errores-comanda-restaurante`,     lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/blog/alternativa-numier-tpv`,                  lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/blog/comanda-por-voz-como-funciona`,           lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/blog/tpv-con-ia-hosteleria`,                   lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    // Comparativas
    { url: `${base}/comparativas/iarest-vs-numier`,                lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/comparativas/iarest-vs-revo`,                  lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/comparativas/iarest-vs-camarero10`,            lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    // Sectores
    { url: `${base}/sectores/restaurante`,                         lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/sectores/bar`,                                 lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/sectores/cafeteria`,                           lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    // Legales
    { url: `${base}/login`,                                        lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/aviso-legal`,                                  lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/privacidad`,                                   lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/cookies`,                                      lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${base}/terminos`,                                     lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
  ]
}
