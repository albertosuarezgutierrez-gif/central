import type { MetadataRoute } from 'next'

// Área PRIVADA de clientes (clientes.grupoasegura.es): no se indexa nada.
// Va junto al `robots: { index: false, follow: false }` del layout raíz: este
// fichero evita el rastreo; el meta, que una URL enlazada desde fuera acabe
// en el índice igualmente.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } }
}
