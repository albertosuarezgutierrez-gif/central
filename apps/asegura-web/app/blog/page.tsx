// Índice del blog.
//
// No es una lista de novedades: es la puerta a las respuestas que las páginas
// de ramo no dan. Una página de ramo explica un producto; estos artículos
// resuelven el momento concreto en el que alguien busca —el preaviso que se le
// echa encima, el recibo que ha subido, el siniestro que le han denegado—.
import type { Metadata } from 'next'
import Link from 'next/link'
import { ARTICULOS } from '@/lib/articulos'
import { url } from '@/lib/sitio'
import { migas, jsonLd } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Guías y artículos',
  description:
    'Artículos sobre plazos, coberturas y trámites de seguros, escritos por un corredor inscrito en la DGSFP. Con los artículos de la ley que los regulan.',
  alternates: { canonical: url('/blog') },
}

/** Fecha en español, para leerla; la máquina lee el `datePublished` del JSON-LD. */
function fechaLegible(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

export default function Blog() {
  const breadcrumb = migas([
    { nombre: 'Inicio', ruta: '/' },
    { nombre: 'Guías', ruta: '/blog' },
  ])

  // Más reciente primero. El orden del array es el de escritura, no el de
  // publicación, y no tienen por qué coincidir.
  const orden = [...ARTICULOS].sort((a, b) => b.fecha.localeCompare(a.fecha))

  return (
    <div className="wrap pagina">
      {breadcrumb && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />}

      <nav aria-label="Migas de pan" style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
        <Link href="/">Inicio</Link> <span aria-hidden>›</span> Guías
      </nav>

      <h1>Guías y artículos</h1>
      <p style={{ fontSize: 17, color: 'var(--muted)', maxWidth: 640 }}>
        Lo que hay que saber cuando el seguro deja de ser un recibo y pasa a ser un problema con fecha:
        plazos, coberturas y trámites. Con la norma que lo regula citada, para que puedas comprobarlo.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: '32px 0 0', display: 'grid', gap: 24, maxWidth: 720 }}>
        {orden.map((a) => (
          <li key={a.slug} style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <h2 style={{ fontSize: 21, margin: '0 0 8px', lineHeight: 1.3 }}>
              <Link href={`/blog/${a.slug}`}>{a.h1}</Link>
            </h2>
            <p style={{ margin: '0 0 8px', color: 'var(--muted)' }}>{a.resumen}</p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
              <time dateTime={a.fecha}>{fechaLegible(a.fecha)}</time>
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
