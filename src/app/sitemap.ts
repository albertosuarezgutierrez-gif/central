import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.iarest.es'
  const now  = new Date()
  return [
    { url: base,                       lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/registro`,         lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    // Blog
    { url: `${base}/blog`,                                           lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${base}/blog/verifactu-restaurantes-guia-2026`,          lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/blog/reducir-errores-comanda-restaurante`,       lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/blog/alternativa-numier-tpv`,                    lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    // Legales
    { url: `${base}/login`,            lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/aviso-legal`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/privacidad`,       lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/cookies`,          lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${base}/terminos`,         lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
  ]
}
