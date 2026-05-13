import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog · ia.rest — Recursos para hostelería y TPV',
  description: 'Guías prácticas sobre TPV para restaurantes, VeriFactu, gestión de comandas y tecnología para hostelería española. Recursos gratuitos de ia.rest.',
  alternates: { canonical: 'https://www.iarest.es/blog' },
  openGraph: {
    title: 'Blog ia.rest — Recursos para hostelería y TPV',
    description: 'Guías prácticas sobre TPV para restaurantes, VeriFactu y gestión de hostelería.',
    url: 'https://www.iarest.es/blog',
    type: 'website',
  },
}

const SE = "'Newsreader',Georgia,serif"
const SN = "'Inter Tight',system-ui,sans-serif"

const articulos = [
  {
    slug: 'verifactu-restaurantes-guia-2026',
    titulo: 'VeriFactu para restaurantes: guía completa 2026',
    descripcion: 'Todo lo que necesitas saber sobre la obligación de VeriFactu en hostelería. Plazos, requisitos, cómo cumplir y qué TPV lo incluye de serie.',
    fecha: 'Mayo 2026',
    categoria: 'Fiscal',
    color: '#E8A33B',
  },
  {
    slug: 'reducir-errores-comanda-restaurante',
    titulo: 'Cómo reducir los errores de comanda en tu restaurante',
    descripcion: 'Un camarero medio comete 3-4 errores de comanda por turno. Este artículo analiza las causas y las soluciones reales que funcionan en hostelería.',
    fecha: 'Mayo 2026',
    categoria: 'Operaciones',
    color: '#3F7D44',
  },
  {
    slug: 'alternativa-numier-tpv',
    titulo: 'Alternativa a Numier TPV en 2026: qué opciones tienes',
    descripcion: 'Si estás valorando salir de Numier, aquí tienes una comparativa honesta de las mejores alternativas para restaurantes y bares en España.',
    fecha: 'Mayo 2026',
    categoria: 'Comparativas',
    color: '#D9442B',
  },
]

export default function BlogPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#F6F1E7', color: '#1A1714', fontFamily: SN }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 20px' }}>

        {/* Nav */}
        <a href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: 48 }}>
          <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714' }}>
            ia<span style={{ color: '#D9442B' }}>.</span>rest
          </span>
        </a>

        {/* Header */}
        <div style={{ marginBottom: 56 }}>
          <p style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B5F52', margin: '0 0 12px' }}>Blog</p>
          <h1 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 40, color: '#1A1714', margin: '0 0 16px', lineHeight: 1.15, letterSpacing: '-0.5px' }}>
            Recursos para hostelería
          </h1>
          <p style={{ fontSize: 16, color: '#6B5F52', lineHeight: 1.7, maxWidth: 520, margin: 0 }}>
            Guías prácticas sobre TPV, VeriFactu, gestión de comandas y tecnología para restaurantes y bares en España.
          </p>
        </div>

        {/* Artículos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {articulos.map((art) => (
            <a
              key={art.slug}
              href={`/blog/${art.slug}`}
              style={{
                textDecoration: 'none',
                background: '#FBF8F1',
                border: '1px solid #D8CDB6',
                borderRadius: 8,
                padding: '28px 32px',
                display: 'block',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  color: art.color,
                  background: art.color + '18',
                  padding: '3px 10px',
                  borderRadius: 100,
                }}>
                  {art.categoria}
                </span>
                <span style={{ fontSize: 12, color: '#6B5F52' }}>{art.fecha}</span>
              </div>
              <h2 style={{
                fontFamily: SE,
                fontStyle: 'italic',
                fontSize: 22,
                color: '#1A1714',
                margin: '0 0 10px',
                lineHeight: 1.3,
                letterSpacing: '-0.3px',
              }}>
                {art.titulo}
              </h2>
              <p style={{ fontSize: 14, color: '#6B5F52', lineHeight: 1.65, margin: 0 }}>
                {art.descripcion}
              </p>
              <span style={{ display: 'inline-block', marginTop: 16, fontSize: 13, color: '#D9442B', fontWeight: 500 }}>
                Leer artículo →
              </span>
            </a>
          ))}
        </div>

        {/* CTA */}
        <div style={{
          marginTop: 56,
          padding: '32px',
          background: '#1A1714',
          borderRadius: 8,
          textAlign: 'center',
        }}>
          <p style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: '#F6F1E7', margin: '0 0 8px' }}>
            ¿Listo para probarlo en tu restaurante?
          </p>
          <p style={{ fontSize: 13, color: '#D8CDB6', margin: '0 0 20px' }}>14 días gratis. Sin tarjeta. En marcha en 10 minutos.</p>
          <a href="/registro" style={{
            display: 'inline-block',
            background: '#D9442B',
            color: '#F6F1E7',
            textDecoration: 'none',
            padding: '12px 28px',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
          }}>
            Solicitar prueba gratuita →
          </a>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #D8CDB6', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <a href="/" style={{ color: '#6B5F52', fontSize: 13, textDecoration: 'none' }}>← Inicio</a>
          <a href="/registro" style={{ color: '#D9442B', fontSize: 13, textDecoration: 'underline' }}>Prueba gratis</a>
          <a href="/#contacto" style={{ color: '#6B5F52', fontSize: 13, textDecoration: 'none' }}>Contacto</a>
        </div>

      </div>
    </div>
  )
}
