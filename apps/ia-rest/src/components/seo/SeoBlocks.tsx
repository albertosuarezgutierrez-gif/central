// apps/ia-rest/src/components/seo/SeoBlocks.tsx
// Server component: renderiza los bloques SEO activos de una ruta desde BD.
import { getBlocks } from '@/lib/seo/store'

export default async function SeoBlocks({ ruta }: { ruta: string }) {
  const bloques = await getBlocks(ruta)
  if (!bloques.length) return null
  return (
    <section aria-label="Información adicional" style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 48px' }}>
      {bloques.map((b) => (
        <div key={b.posicion} style={{ marginBottom: 32 }}>
          {b.titulo ? <h2 style={{ fontSize: 24, margin: '0 0 12px' }}>{b.titulo}</h2> : null}
          <div style={{ fontSize: 15, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: b.html }} />
        </div>
      ))}
    </section>
  )
}
